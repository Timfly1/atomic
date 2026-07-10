//! Excel (.xlsx) document parser
//!
//! XLSX files are ZIP archives containing XML files. This parser extracts:
//! - Sheet names
//! - Cell values as tabular Markdown
//! - Images from the media folder

use super::{DocumentError, DocumentMetadata, DocumentParser, ExtractedImage, ParseResult};
use async_trait::async_trait;
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::Read;
use uuid::Uuid;
use zip::ZipArchive;

/// Parser for Excel documents
pub struct XlsxParser;

impl XlsxParser {
    pub fn new() -> Self {
        Self
    }
}

impl Default for XlsxParser {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl DocumentParser for XlsxParser {
    fn document_type(&self) -> super::DocumentType {
        super::DocumentType::Excel
    }

    async fn parse(&self, data: &[u8]) -> Result<ParseResult, DocumentError> {
        let data_owned = data.to_vec();
        tokio::task::spawn_blocking(move || parse_xlsx_sync(&data_owned))
            .await
            .map_err(|e| DocumentError::ParseError(format!("Task join error: {}", e)))?
    }
}

fn parse_xlsx_sync(data: &[u8]) -> Result<ParseResult, DocumentError> {
    let cursor = std::io::Cursor::new(data);
    let mut archive = ZipArchive::new(cursor)?;

    let mut metadata = DocumentMetadata::default();
    let mut content = String::new();
    let mut images = Vec::new();

    // Get sheet names from workbook.xml
    if let Ok(mut workbook_file) = archive.by_name("xl/workbook.xml") {
        let mut workbook_content = String::new();
        workbook_file.read_to_string(&mut workbook_content)?;
        metadata.sheet_names = extract_sheet_names(&workbook_content);
    }

    // Parse each sheet
    for (idx, sheet_name) in metadata.sheet_names.iter().enumerate() {
        let sheet_file_name = format!("xl/worksheets/sheet{}.xml", idx + 1);

        if let Ok(mut sheet_file) = archive.by_name(&sheet_file_name) {
            let mut sheet_content = String::new();
            sheet_file.read_to_string(&mut sheet_content)?;

            if !content.is_empty() {
                content.push('\n');
            }
            content.push_str(&format!("## {}\n\n", sheet_name));
            content.push_str(&extract_sheet_content(&sheet_content));
        }
    }

    // Extract images from xl/media/
    // First collect the names (to avoid borrow conflicts)
    let mut media_names: Vec<String> = Vec::new();
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().to_string();
            if name.starts_with("xl/media/") {
                media_names.push(name);
            }
        }
    }

    // Then read each file
    for name in media_names {
        if let Ok(mut media_file) = archive.by_name(&name) {
            let mut img_data = Vec::new();
            media_file.read_to_end(&mut img_data)?;

            let content_type = guess_image_type(&name, &img_data);
            let image_id = Uuid::new_v4().to_string();

            images.push(ExtractedImage {
                id: image_id,
                original_ref: name.clone(),
                relationship_id: None,
                data: img_data,
                content_type,
                caption: None,
            });
        }
    }

    Ok(ParseResult {
        content,
        images,
        metadata,
    })
}

/// Extract sheet names from workbook.xml
fn extract_sheet_names(xml: &str) -> Vec<String> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut sheet_names = Vec::new();
    let mut buffer = Vec::new();
    let mut in_sheet = false;
    let mut current_name = String::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                if tag_name == "sheet" {
                    in_sheet = true;
                    current_name.clear();
                    // Look for name attribute
                    for attr in e.attributes().flatten() {
                        if attr.key.as_ref() == b"name" {
                            if let Ok(value) = std::str::from_utf8(&attr.value) {
                                current_name = value.to_string();
                            }
                        }
                    }
                    if !current_name.is_empty() {
                        sheet_names.push(current_name.clone());
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    if sheet_names.is_empty() {
        sheet_names.push("Sheet1".to_string());
    }

    sheet_names
}

/// Extract content from a sheet XML file as Markdown table
fn extract_sheet_content(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);

    let mut content = String::new();
    let mut buffer = Vec::new();
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut current_row: Vec<String> = Vec::new();
    let mut current_cell_value = String::new();
    let mut in_cell = false;
    let mut max_cols = 0;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "row" => {
                        current_row = Vec::new();
                    }
                    "c" => {
                        in_cell = true;
                        current_cell_value.clear();
                    }
                    "v" | "t" => {
                        // Cell value
                    }
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                let tag_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                match tag_name.as_str() {
                    "row" => {
                        if !current_row.is_empty() {
                            max_cols = max_cols.max(current_row.len());
                            rows.push(current_row);
                        }
                        current_row = Vec::new();
                    }
                    "c" => {
                        in_cell = false;
                        current_row.push(current_cell_value.clone());
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(e)) => {
                if in_cell {
                    if let Ok(text) = e.unescape() {
                        current_cell_value = text.to_string();
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    // Handle last row if not properly closed
    if !current_row.is_empty() {
        max_cols = max_cols.max(current_row.len());
        rows.push(current_row);
    }

    // Convert to Markdown table
    if rows.is_empty() {
        return String::new();
    }

    // Build header row
    let header_cols = (0..max_cols).map(|i| format!("Column{}", i + 1)).collect::<Vec<_>>();
    content.push_str(&header_cols.join(" | "));
    content.push('\n');
    content.push_str(&header_cols.iter().map(|_| "---".to_string()).collect::<Vec<_>>().join(" | "));
    content.push('\n');

    // Build data rows
    for row in rows {
        let padded_row: Vec<String> = (0..max_cols)
            .map(|i| row.get(i).cloned().unwrap_or_default())
            .collect();
        content.push_str(&padded_row.join(" | "));
        content.push('\n');
    }

    content
}

/// Guess image content type
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
            super::super::DocumentType::Excel,
            super::super::DocumentType::from_extension("xlsx")
        );
        assert_eq!(
            super::super::DocumentType::Excel,
            super::super::DocumentType::from_extension("XLS")
        );
    }
}