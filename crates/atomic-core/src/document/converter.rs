//! Document to Markdown+HTML converter
//!
//! Converts parsed document content to the Markdown + HTML inline style format
//! used by atomic notes (similar to RSS subscription notes).
//!
//! This format uses HTML tags with inline styles for rich formatting:
//! - `<span style="color:#FF0000;">` for colored text
//! - `<b>`, `<i>`, `<u>` for basic formatting
//! - `![Image](url)` for images
//! - Markdown tables for tabular data

use super::{ExtractedImage, ParseResult};

/// Configuration for document conversion
#[derive(Debug, Clone, Default)]
pub struct ConverterConfig {
    /// Whether to include image references inline
    pub inline_images: bool,
    /// Whether to preserve basic formatting
    pub preserve_formatting: bool,
    /// Maximum image width for display (in pixels)
    pub max_image_width: Option<u32>,
}

impl ConverterConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_inline_images(mut self, inline: bool) -> Self {
        self.inline_images = inline;
        self
    }

    pub fn with_formatting(mut self, preserve: bool) -> Self {
        self.preserve_formatting = preserve;
        self
    }

    pub fn with_max_width(mut self, width: u32) -> Self {
        self.max_image_width = Some(width);
        self
    }
}

/// Result of converting a document
#[derive(Debug, Clone)]
pub struct ConversionResult {
    /// The converted content (Markdown + HTML)
    pub content: String,
    /// Images that need to be stored
    pub images: Vec<StoredImage>,
}

/// An image that should be stored for inclusion in the content
#[derive(Debug, Clone)]
pub struct StoredImage {
    /// Unique ID for this image (used in Markdown reference)
    pub id: String,
    /// Original reference in the document
    pub original_ref: String,
    /// Image data bytes
    pub data: Vec<u8>,
    /// MIME content type
    pub content_type: String,
    /// The Markdown image tag to insert in content
    pub markdown_tag: String,
}

/// Convert a ParseResult to the final note content
pub fn convert(result: ParseResult, _config: ConverterConfig) -> ConversionResult {
    let mut content = result.content.clone();
    let mut stored_images = Vec::new();

    // Process each extracted image
    for image in &result.images {
        // Use atomic:// protocol for embedded images - frontend will resolve these
        // This avoids base64 bloat in content and keeps images accessible
        let atomic_url = format!("atomic://embedded-image/{}", image.id);

        let markdown_tag = format!(
            "\n![{}]({})\n",
            image.caption.as_deref().unwrap_or("Image"),
            atomic_url
        );

        stored_images.push(StoredImage {
            id: image.id.clone(),
            original_ref: image.original_ref.clone(),
            data: image.data.clone(),
            content_type: image.content_type.clone(),
            markdown_tag: markdown_tag.clone(),
        });

        // Replace atomic:// URLs in content with actual markdown image tags
        // The parser inserts atomic:// URLs at correct positions, but we need to
        // convert them to proper markdown image syntax
        content = content.replace(&atomic_url, &markdown_tag);
    }

    // Add metadata as a comment at the top if present
    let mut final_content = String::new();
    if let Some(title) = &result.metadata.title {
        final_content.push_str(&format!("<!-- Document Title: {} -->\n", title));
    }
    if let Some(author) = &result.metadata.author {
        final_content.push_str(&format!("<!-- Document Author: {} -->\n", author));
    }
    if let Some(page_count) = result.metadata.page_count {
        final_content.push_str(&format!("<!-- Page Count: {} -->\n", page_count));
    }
    if !result.metadata.sheet_names.is_empty() {
        final_content.push_str(&format!(
            "<!-- Sheets: {} -->\n",
            result.metadata.sheet_names.join(", ")
        ));
    }

    final_content.push_str(&content);

    ConversionResult {
        content: final_content,
        images: stored_images,
    }
}

/// Encode bytes to base64
fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();

    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = chunk.get(1).copied().unwrap_or(0) as usize;
        let b2 = chunk.get(2).copied().unwrap_or(0) as usize;

        result.push(ALPHABET[b0 >> 2] as char);
        result.push(ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)] as char);

        if chunk.len() > 1 {
            result.push(ALPHABET[((b1 & 0x0F) << 2) | (b2 >> 6)] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(ALPHABET[b2 & 0x3F] as char);
        } else {
            result.push('=');
        }
    }

    result
}

/// Get the Markdown image ID for an image
fn get_image_markdown_id(image_id: &str) -> String {
    format!("atomic://image/{}", image_id)
}

/// Convert plain text to HTML with basic formatting
/// This is a simplified version - real implementation would need
/// to parse the document's style information
pub fn text_to_html(text: &str) -> String {
    // For now, just escape HTML and preserve line breaks
    let escaped = escape_html(text);
    escaped.replace('\n', "<br>\n")
}

/// Escape HTML special characters
fn escape_html(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    for ch in text.chars() {
        match ch {
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '&' => result.push_str("&amp;"),
            '"' => result.push_str("&quot;"),
            '\'' => result.push_str("&#39;"),
            _ => result.push(ch),
        }
    }
    result
}

/// Apply inline style to text
pub fn styled_text(text: &str, style: &str) -> String {
    format!("<span style=\"{}\">{}</span>", style, text)
}

/// Create bold text
pub fn bold(text: &str) -> String {
    format!("<b>{}</b>", text)
}

/// Create italic text
pub fn italic(text: &str) -> String {
    format!("<i>{}</i>", text)
}

/// Create underlined text
pub fn underlined(text: &str) -> String {
    format!("<u>{}</u>", text)
}

/// Create colored text
pub fn colored(text: &str, color: &str) -> String {
    styled_text(text, &format!("color:{};", color))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_html() {
        assert_eq!(escape_html("<div>"), "&lt;div&gt;");
        assert_eq!(escape_html("a & b"), "a &amp; b");
    }

    #[test]
    fn test_styled_text() {
        assert_eq!(
            styled_text("hello", "color:#FF0000;"),
            "<span style=\"color:#FF0000;\">hello</span>"
        );
    }

    #[test]
    fn test_bold() {
        assert_eq!(bold("text"), "<b>text</b>");
    }

    #[test]
    fn test_colored() {
        assert_eq!(
            colored("text", "#FF0000"),
            "<span style=\"color:#FF0000;\">text</span>"
        );
    }
}