//! Word (.docx) document parser
//!
//! DOCX files are ZIP archives containing XML files. This parser extracts:
//! - Text content with basic formatting (bold, italic, underline)
//! - Images from the media folder (position-aware)
//! - Document metadata (title, author)

use super::{DocumentError, DocumentMetadata, DocumentParser, ExtractedImage, ParseResult};
use async_trait::async_trait;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;
use std::io::Read;
use uuid::Uuid;
use zip::ZipArchive;

/// Parser for Word documents
pub struct DocxParser;

impl DocxParser {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DocxParser {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl DocumentParser for DocxParser {
    fn document_type(&self) -> super::DocumentType {
        super::DocumentType::Word
    }

    async fn parse(&self, data: &[u8]) -> Result<ParseResult, DocumentError> {
        let data_owned = data.to_vec();
        tokio::task::spawn_blocking(move || parse_docx_sync(&data_owned))
            .await
            .map_err(|e| DocumentError::ParseError(format!("Task join error: {}", e)))?
    }
}

fn parse_docx_sync(data: &[u8]) -> Result<ParseResult, DocumentError> {
    let cursor = std::io::Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)?;

    // Parse relationships to get rId -> media file mapping
    let relationships = parse_relationships(&mut archive);

    // First pass: collect image references from document.xml
    let mut referenced_image_ids: Vec<String> = Vec::new();
    if let Ok(mut doc_file) = archive.by_name("word/document.xml") {
        let mut doc_content = String::new();
        doc_file.read_to_string(&mut doc_content)?;
        collect_image_references(&doc_content, &relationships, &mut referenced_image_ids);
    }

    // Collect all media files first
    let mut media_files: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().to_string();
            // Only include actual files, not directory entries
            if name.starts_with("word/media/") && !name.ends_with('/') && name.len() > "word/media/".len() {
                media_files.push(name);
            }
        }
    }

    // Extract only referenced images from word/media/
    let mut images = Vec::new();
    let mut rid_to_image_id: HashMap<String, String> = HashMap::new();

    for name in &media_files {
        let media_filename = name.strip_prefix("word/media/").unwrap_or(name);

        // Find which relationship ID references this media file
        let rel_id_for_media = relationships.iter()
            .find(|(_, target)| {
                let target_name = target.strip_prefix("media/").unwrap_or(target);
                target_name == media_filename || target.ends_with(media_filename)
            })
            .map(|(rid, _)| rid.clone());

        // Check if this media file is referenced
        let is_referenced = rel_id_for_media.as_ref()
            .map(|rid| referenced_image_ids.contains(rid))
            .unwrap_or(false);

        if is_referenced || referenced_image_ids.is_empty() {
            if let Ok(mut media_file) = archive.by_name(name) {
                let mut media_data = Vec::new();
                media_file.read_to_end(&mut media_data)?;

                let content_type = guess_image_type(name, &media_data);
                // Use relationship ID as image ID if available, otherwise generate UUID
                let image_id = rel_id_for_media.clone().unwrap_or_else(|| Uuid::new_v4().to_string());

                if let Some(ref rid) = rel_id_for_media {
                    rid_to_image_id.insert(rid.clone(), image_id.clone());
                }

                images.push(ExtractedImage {
                    id: image_id,
                    original_ref: name.clone(),
                    relationship_id: rel_id_for_media,
                    data: media_data,
                    content_type,
                    caption: None,
                });
            }
        }
    }

    tracing::debug!("DOCX parse: relationships={:?}, referenced_ids={:?}", relationships, referenced_image_ids);
    tracing::debug!("DOCX parse: rid_to_image_id={:?}", rid_to_image_id);

    // Second pass: extract text with image markdown using actual image IDs
    let mut content = String::new();
    if let Ok(mut doc_file) = archive.by_name("word/document.xml") {
        let mut doc_content = String::new();
        doc_file.read_to_string(&mut doc_content)?;
        content = extract_text_with_images(&doc_content, &relationships, &rid_to_image_id);
    }

    // Parse core.xml for metadata
    let mut metadata = DocumentMetadata::default();
    if let Ok(mut core_file) = archive.by_name("docProps/core.xml") {
        let mut core_content = String::new();
        core_file.read_to_string(&mut core_content)?;
        metadata = extract_metadata_from_core_xml(&core_content);
    }

    tracing::debug!("DOCX parse: extracted {} images, content length {}", images.len(), content.len());

    Ok(ParseResult {
        content,
        images,
        metadata,
    })
}

/// Parse word/_rels/document.xml.rels to get rId -> target mapping
fn parse_relationships(archive: &mut ZipArchive<std::io::Cursor<&[u8]>>) -> HashMap<String, String> {
    let mut relationships = HashMap::new();

    if let Ok(mut rels_file) = archive.by_name("word/_rels/document.xml.rels") {
        let mut rels_content = String::new();
        if rels_file.read_to_string(&mut rels_content).is_ok() {
            let mut reader = Reader::from_str(&rels_content);
            reader.trim_text(true);
            let mut buffer = Vec::new();

            loop {
                match reader.read_event_into(&mut buffer) {
                    Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                        let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                        if tag_name == "Relationship" {
                            let mut current_id = String::new();
                            let mut target = String::new();
                            for attr in e.attributes().flatten() {
                                let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                                let value = String::from_utf8_lossy(&attr.value).to_string();
                                if key == "Id" {
                                    current_id = value;
                                } else if key == "Target" {
                                    target = value;
                                }
                            }
                            if !current_id.is_empty() && !target.is_empty() {
                                relationships.insert(current_id, target);
                            }
                        }
                    }
                    Ok(Event::Eof) => break,
                    Err(_) => break,
                    _ => {}
                }
                buffer.clear();
            }
        }
    }

    relationships
}

/// First pass: collect all image relationship IDs referenced in the document
fn collect_image_references(
    xml: &str,
    relationships: &HashMap<String, String>,
    referenced_ids: &mut Vec<String>,
) {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    let mut buffer = Vec::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                // Match a:blip, pic:blip, or any namespace ending with :blip
                if tag_name == "a:blip" || tag_name == "pic:blip" || tag_name.ends_with(":blip") || tag_name == "blip" {
                    for attr in e.attributes().flatten() {
                        let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                        // DOCX uses r:embed or r:link with namespace prefix
                        if key == "embed" || key == "link" || key == "r:embed" || key == "r:link" || key.ends_with(":embed") || key.ends_with(":link") {
                            let rid = String::from_utf8_lossy(&attr.value).to_string();
                            // Only add if it's a valid relationship ID pointing to media
                            if relationships.contains_key(&rid) {
                                referenced_ids.push(rid);
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
}

/// Extract text content while detecting and marking image positions
fn extract_text_with_images(
    xml: &str,
    _relationships: &HashMap<String, String>,
    rid_to_image_id: &HashMap<String, String>,
) -> String {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut content = String::new();
    let mut buffer = Vec::new();

    // Table tracking state
    let mut in_table = false;
    let mut in_cell = false;
    let mut cell_content = String::new();
    let mut table_cells: Vec<String> = Vec::new();

    // Formatting state
    let mut is_bold = false;
    let mut is_italic = false;
    let mut is_underline = false;
    let mut font_size: Option<u32> = None;
    let mut color: Option<String> = None;

    #[derive(Clone)]
    struct FormatState {
        is_bold: bool,
        is_italic: bool,
        is_underline: bool,
        font_size: Option<u32>,
        color: Option<String>,
    }
    let mut format_stack: Vec<FormatState> = Vec::new();

    fn push_formatted(target: &mut String, text: &str, is_bold: bool, is_italic: bool, is_underline: bool, font_size: Option<u32>, color: Option<&str>) {
        if text.is_empty() {
            return;
        }
        let formatted = apply_formatting(text, is_bold, is_italic, is_underline, font_size, color);
        if !target.is_empty() {
            let last_ch = target.chars().last().unwrap();
            let first_ch = formatted.chars().next().unwrap_or(' ');
            if !last_ch.is_whitespace() && !first_ch.is_whitespace()
               && last_ch != '<' && first_ch != '<' {
                if !last_ch.is_ascii_punctuation() && !first_ch.is_ascii_punctuation() {
                    target.push(' ');
                }
            }
        }
        target.push_str(&formatted);
    }

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "w:p" => {
                        if !cell_content.is_empty() && !cell_content.ends_with('\n') {
                            cell_content.push('\n');
                        }
                    }
                    "w:r" => {
                        format_stack.push(FormatState {
                            is_bold,
                            is_italic,
                            is_underline,
                            font_size,
                            color: color.clone(),
                        });
                    }
                    "w:rPr" => {}
                    "w:b" | "w:bCs" => is_bold = true,
                    "w:i" | "w:iCs" => is_italic = true,
                    "w:u" => is_underline = true,
                    "w:color" => {
                        for attr in e.attributes().flatten() {
                            if std::str::from_utf8(attr.key.as_ref()).unwrap_or("") == "val" {
                                let val = String::from_utf8_lossy(&attr.value).to_string();
                                if val.len() == 6 {
                                    color = Some(format!("#{}", val.to_lowercase()));
                                }
                            }
                        }
                    }
                    "w:sz" | "w:szCs" => {
                        for attr in e.attributes().flatten() {
                            if std::str::from_utf8(attr.key.as_ref()).unwrap_or("") == "val" {
                                if let Ok(size) = String::from_utf8_lossy(&attr.value).parse::<u32>() {
                                    font_size = Some(size / 2);
                                }
                            }
                        }
                    }
                    "w:tbl" => {
                        in_table = true;
                        table_cells.clear();
                    }
                    "w:tr" => {
                        if in_table {
                            cell_content.clear();
                        }
                    }
                    "w:tc" => {
                        in_cell = true;
                        cell_content.clear();
                    }
                    // Handle DrawingML image references (a:blip, pic:blip, or any namespace ending with :blip)
                    _ if tag_name == "a:blip" || tag_name == "pic:blip" || tag_name.ends_with(":blip") || tag_name == "blip" => {
                        tracing::debug!("Found blip element: {}", tag_name);
                        for attr in e.attributes().flatten() {
                            let key = std::str::from_utf8(attr.key.as_ref()).unwrap_or("");
                            let value = String::from_utf8_lossy(&attr.value).to_string();
                            tracing::debug!("  blip attr: {}={}", key, value);
                            // DOCX uses r:embed or r:link with namespace prefix
                            if key == "embed" || key == "link" || key == "r:embed" || key == "r:link" || key.ends_with(":embed") || key.ends_with(":link") {
                                let rid = value;
                                tracing::debug!("  Found image reference: rid={}", rid);
                                // Use the actual image ID (from relationships) for the markdown
                                if let Some(image_id) = rid_to_image_id.get(&rid) {
                                    tracing::debug!("  Mapped to image_id={}", image_id);
                                    // Just insert the raw URL - the converter will wrap it in markdown syntax
                                    let image_url = format!("atomic://embedded-image/{}", image_id);
                                    if in_cell {
                                        cell_content.push_str(&image_url);
                                    } else {
                                        content.push_str(&image_url);
                                    }
                                } else {
                                    tracing::warn!("  No mapping found for rid={}", rid);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "w:r" => {
                        if let Some(state) = format_stack.pop() {
                            is_bold = state.is_bold;
                            is_italic = state.is_italic;
                            is_underline = state.is_underline;
                            font_size = state.font_size;
                            color = state.color;
                        }
                    }
                    "w:p" => {
                        if in_cell {
                            cell_content.push('\n');
                        } else if !content.ends_with('\n') {
                            content.push('\n');
                        }
                    }
                    "w:tbl" => {
                        in_table = false;
                        if !table_cells.is_empty() {
                            let max_cols = table_cells.iter().map(|row| row.matches('|').count()).max().unwrap_or(0).max(1);
                            let separator = format!("|{}|", "---|".repeat(max_cols).trim_end_matches('|'));
                            let first_pipe = table_cells[0].find('|').unwrap_or(0);
                            let last_pipe = table_cells[0].rfind('|').unwrap_or(table_cells[0].len());
                            let header = &table_cells[0][first_pipe..last_pipe+1];
                            content.push_str(header);
                            content.push('\n');
                            content.push_str(&separator);
                            content.push('\n');
                            for (i, row) in table_cells.iter().enumerate() {
                                if i > 0 {
                                    content.push('\n');
                                    let first_pipe = row.find('|').unwrap_or(0);
                                    let last_pipe = row.rfind('|').unwrap_or(row.len());
                                    content.push_str(&row[first_pipe..last_pipe+1]);
                                }
                            }
                            content.push('\n');
                            table_cells.clear();
                        }
                    }
                    "w:tr" => {
                        if in_table {
                            let row_text = cell_content.trim();
                            if !row_text.is_empty() || table_cells.is_empty() {
                                let row_str = format!("|{}|", row_text.replace('\n', " "));
                                table_cells.push(row_str);
                            }
                        }
                    }
                    "w:tc" => {
                        in_cell = false;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if let Ok(text) = e.unescape() {
                    let text = text.to_string();
                    if !text.is_empty() {
                        if in_cell {
                            push_formatted(&mut cell_content, &text, is_bold, is_italic, is_underline, font_size, color.as_deref());
                        } else {
                            push_formatted(&mut content, &text, is_bold, is_italic, is_underline, font_size, color.as_deref());
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    // Clean up extra newlines
    let mut result = String::new();
    let mut last_was_newline = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !result.is_empty() && !last_was_newline {
                result.push('\n');
            }
            last_was_newline = true;
        } else {
            if !result.is_empty() && !last_was_newline {
                result.push('\n');
            }
            result.push_str(trimmed);
            last_was_newline = false;
        }
    }

    result
}

/// Apply HTML inline formatting to text
fn apply_formatting(text: &str, bold: bool, italic: bool, underline: bool, font_size: Option<u32>, color: Option<&str>) -> String {
    let mut styled = text.to_string();

    if let Some(c) = color {
        styled = format!("<span style=\"color:{};\">{}</span>", c, styled);
    }

    if let Some(size) = font_size {
        styled = format!("<span style=\"font-size:{}pt;\">{}</span>", size, styled);
    }

    if underline {
        styled = format!("<u>{}</u>", styled);
    }

    if italic {
        styled = format!("<i>{}</i>", styled);
    }

    if bold {
        styled = format!("<b>{}</b>", styled);
    }

    styled
}

/// Extract metadata from docProps/core.xml
fn extract_metadata_from_core_xml(xml: &str) -> DocumentMetadata {
    let mut metadata = DocumentMetadata::default();
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut buffer = Vec::new();
    let mut current_element = String::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) => {
                current_element = String::from_utf8_lossy(e.name().as_ref()).to_string();
            }
            Ok(Event::Text(e)) => {
                if let Ok(text) = e.unescape() {
                    let text = text.to_string();
                    match current_element.as_str() {
                        "dc:title" | "title" => metadata.title = Some(text),
                        "dc:creator" | "creator" => metadata.author = Some(text),
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    metadata
}

/// Guess image content type from file extension and magic bytes
fn guess_image_type(filename: &str, data: &[u8]) -> String {
    if data.len() >= 3 {
        match &data[0..3] {
            [0xFF, 0xD8, 0xFF] => return "image/jpeg".to_string(),
            [0x89, 0x50, 0x4E] => return "image/png".to_string(),
            [0x47, 0x49, 0x46] => return "image/gif".to_string(),
            _ => {}
        }
    }

    let lower = filename.to_lowercase();
    if lower.ends_with(".png") {
        "image/png".to_string()
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg".to_string()
    } else if lower.ends_with(".gif") {
        "image/gif".to_string()
    } else if lower.ends_with(".webp") {
        "image/webp".to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_type_detection() {
        assert_eq!(
            super::super::DocumentType::Word,
            super::super::DocumentType::from_extension("docx")
        );
        assert_eq!(
            super::super::DocumentType::Word,
            super::super::DocumentType::from_extension("DOC")
        );
    }
}