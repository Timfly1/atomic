//! PDF document parser
//!
//! PDF parsing is complex due to the varied ways PDFs can be structured.
//! This parser provides best-effort extraction of:
//! - Text content (from text streams)
//! - Embedded images (from image XObjects)
//! - Page count
//!
//! Note: PDF extraction quality varies significantly based on how the PDF was created.
//! Scanned PDFs will have minimal extractable text (use OCR instead).

use super::{DocumentError, DocumentMetadata, DocumentParser, ExtractedImage, ParseResult};
use async_trait::async_trait;
use lopdf::{Document, Object, ObjectId};
use uuid::Uuid;

/// Parser for PDF documents
pub struct PdfParser;

impl PdfParser {
    pub fn new() -> Self {
        Self
    }
}

impl Default for PdfParser {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl DocumentParser for PdfParser {
    fn document_type(&self) -> super::DocumentType {
        super::DocumentType::Pdf
    }

    async fn parse(&self, data: &[u8]) -> Result<ParseResult, DocumentError> {
        let data_owned = data.to_vec();
        tokio::task::spawn_blocking(move || parse_pdf_sync(&data_owned))
            .await
            .map_err(|e| DocumentError::ParseError(format!("Task join error: {}", e)))?
    }
}

fn parse_pdf_sync(data: &[u8]) -> Result<ParseResult, DocumentError> {
    let doc = Document::load_mem(data).map_err(|e| {
        DocumentError::ParseError(format!("Failed to parse PDF: {}", e))
    })?;

    let page_count = doc.get_pages().len();
    let metadata = DocumentMetadata {
        page_count: Some(page_count),
        ..Default::default()
    };

    // Extract text and images from each page
    let mut content = String::new();
    let mut images = Vec::new();

    let pages = doc.get_pages();
    for (page_num, &page_id) in pages.iter() {
        if !content.is_empty() {
            content.push('\n');
        }
        content.push_str(&format!("--- Page {} ---\n\n", page_num));

        // Extract text from page
        let page_text = extract_text_from_page(&doc, page_id);
        content.push_str(&page_text);

        // Extract images from page
        let page_images = extract_images_from_page(&doc, page_id)?;
        images.extend(page_images);
    }

    Ok(ParseResult {
        content,
        images,
        metadata,
    })
}

/// Extract text content from a page
fn extract_text_from_page(doc: &Document, page_id: ObjectId) -> String {
    let mut text = String::new();

    // Get page dictionary
    if let Ok(page_dict) = doc.get_dictionary(page_id) {
        // Get Contents reference
        if let Ok(contents) = page_dict.get(b"Contents") {
            match contents {
                Object::Reference(contents_id) => {
                    if let Ok(contents_obj) = doc.get_object(*contents_id) {
                        text.push_str(&extract_text_from_content_stream(doc, &contents_obj));
                    }
                }
                Object::Array(contents_array) => {
                    for item in contents_array {
                        if let Object::Reference(contents_id) = item {
                            if let Ok(contents_obj) = doc.get_object(*contents_id) {
                                text.push_str(&extract_text_from_content_stream(doc, &contents_obj));
                                text.push('\n');
                            }
                        }
                    }
                }
                Object::Stream(contents_stream) => {
                    text.push_str(&extract_text_from_content_stream(doc, &Object::Stream(contents_stream.clone())));
                }
                _ => {}
            }
        }
    }

    text
}

/// Extract text from a content stream
fn extract_text_from_content_stream(_doc: &Document, contents: &Object) -> String {
    let mut text = String::new();

    let stream_data = match contents {
        Object::Stream(stream) => stream,
        _ => return text,
    };

    // Get the raw content
    let content_bytes = &stream_data.content;

    // Try to decode as UTF-8, fall back to Latin-1
    let content_str = if let Ok(s) = std::str::from_utf8(content_bytes) {
        s.to_string()
    } else {
        // Fall back to Latin-1 (ISO-8859-1) which is common in PDFs
        content_bytes.iter().map(|&b| b as char).collect()
    };

    // Look for text between parentheses (PDF text operator)
    // Handle escaped characters properly
    let mut in_text = false;
    let mut current_text = String::new();
    let mut prev_char = '\0';

    for ch in content_str.chars() {
        match ch {
            '(' if !in_text && prev_char != '\\' => {
                in_text = true;
                current_text.clear();
            }
            ')' if in_text && prev_char != '\\' => {
                in_text = false;
                if !current_text.trim().is_empty() {
                    text.push_str(current_text.trim());
                    text.push(' ');
                }
            }
            '\\' if in_text => {
                // Handle escape sequences - will be processed in next iteration
            }
            _ if in_text => {
                // Handle escaped characters
                if prev_char == '\\' {
                    match ch {
                        'n' => current_text.push('\n'),
                        'r' => current_text.push('\r'),
                        't' => current_text.push('\t'),
                        '\\' => current_text.push('\\'),
                        '(' => current_text.push('('),
                        ')' => current_text.push(')'),
                        _ => current_text.push(ch),
                    }
                } else {
                    current_text.push(ch);
                }
            }
            _ => {}
        }
        prev_char = ch;
    }

    // Clean up extra whitespace
    let mut cleaned = String::new();
    let mut last_was_space = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            if !last_was_space && !cleaned.is_empty() {
                cleaned.push(' ');
                last_was_space = true;
            }
        } else {
            cleaned.push(ch);
            last_was_space = false;
        }
    }

    cleaned.trim().to_string()
}

/// Extract images from a page
fn extract_images_from_page(doc: &Document, page_id: ObjectId) -> Result<Vec<ExtractedImage>, DocumentError> {
    let mut images = Vec::new();

    // Get page dictionary
    if let Ok(page_dict) = doc.get_dictionary(page_id) {
        // Get Resources dictionary
        if let Ok(resources) = page_dict.get(b"Resources") {
            if let Ok(res_dict) = resources.as_reference() {
                if let Ok(res_obj) = doc.get_object(res_dict) {
                    if let Ok(dict) = res_obj.as_dict() {
                        // Look for XObject (images are stored as XObjects)
                        if let Ok(xobjects) = dict.get(b"XObject") {
                            if let Ok(xobj_dict) = xobjects.as_reference() {
                                if let Ok(xobj_obj) = doc.get_object(xobj_dict) {
                                    if let Ok(xobjects_dict) = xobj_obj.as_dict() {
                                        for (name, obj) in xobjects_dict.iter() {
                                            let name_str = String::from_utf8_lossy(name).to_string();
                                            // Resolve reference if obj is a reference
                                            let resolved_obj = match obj {
                                                Object::Reference(id) => {
                                                    match doc.get_object(*id) {
                                                        Ok(o) => o,
                                                        Err(_) => continue,
                                                    }
                                                }
                                                _ => obj,
                                            };
                                            if let Ok(subtype) = resolved_obj.as_dict().and_then(|d| d.get(b"Subtype")) {
                                                if let Ok(subtype_name) = subtype.as_name_str() {
                                                    if subtype_name == "Image" {
                                                        if let Ok(img) = extract_image_from_xobject(doc, resolved_obj, &name_str) {
                                                            images.push(img);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(images)
}

/// Extract image data from an XObject
fn extract_image_from_xobject(doc: &Document, obj: &Object, name: &str) -> Result<ExtractedImage, DocumentError> {
    let stream = match obj {
        Object::Stream(stream) => stream,
        _ => return Err(DocumentError::ParseError("Not a stream".to_string())),
    };

    let dict = &stream.dict;

    // Get image properties
    let width = dict.get(b"Width").and_then(|w| w.as_i64()).unwrap_or(0) as usize;
    let height = dict.get(b"Height").and_then(|h| h.as_i64()).unwrap_or(0) as usize;
    let bits_per_component = dict.get(b"BitsPerComponent").and_then(|b| b.as_i64()).unwrap_or(8) as usize;

    // Get color space to determine format
    let color_space = dict.get(b"ColorSpace").and_then(|c| c.as_name_str()).unwrap_or("DeviceRGB");

    // Try to get the image data
    let image_data = stream.content.clone();

    // Determine content type based on color space and bits
    let content_type = match color_space {
        "DeviceGray" if bits_per_component == 1 => "image/gif",
        "DeviceGray" => "image/jpeg", // Grayscale often stored as JPEG
        "DeviceRGB" => "image/jpeg",  // RGB often stored as JPEG
        "DeviceCMYK" => "image/tiff", // CMYK often stored as TIFF
        _ => "image/jpeg",
    };

    // If the data is empty or very small, we couldn't extract it
    if image_data.len() < 100 {
        return Err(DocumentError::ImageExtractionError("Image data too small".to_string()));
    }

    Ok(ExtractedImage {
        id: Uuid::new_v4().to_string(),
        original_ref: format!("{:?}", name),
        relationship_id: None,
        data: image_data,
        content_type: content_type.to_string(),
        caption: Some(format!("Image {}x{}", width, height)),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_document_type_detection() {
        assert_eq!(
            super::super::DocumentType::Pdf,
            super::super::DocumentType::from_extension("pdf")
        );
    }
}