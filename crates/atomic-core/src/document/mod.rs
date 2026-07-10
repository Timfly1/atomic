//! Document parsing module for extracting content from Word, Excel, PDF, and other documents.
//!
//! This module provides a unified interface for parsing various document formats
//! and converting them to a standardized format for storage as atomic notes.

mod converter;
mod docx_parser;
mod pdf_parser;
mod xlsx_parser;

pub use converter::{convert, ConversionResult, ConverterConfig};
pub use docx_parser::DocxParser;
pub use pdf_parser::PdfParser;
pub use xlsx_parser::XlsxParser;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DocumentError {
    #[error("Failed to read document: {0}")]
    ReadError(String),
    #[error("Failed to parse document: {0}")]
    ParseError(String),
    #[error("Unsupported document type: {0}")]
    UnsupportedType(String),
    #[error("Failed to extract image: {0}")]
    ImageExtractionError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("XML error: {0}")]
    XmlError(#[from] quick_xml::Error),
    #[error("Image processing error: {0}")]
    ImageError(#[from] image::ImageError),
    #[error("ZIP error: {0}")]
    ZipError(#[from] zip::result::ZipError),
}

/// Result of parsing a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParseResult {
    /// Extracted text content
    pub content: String,
    /// Images embedded in the document
    pub images: Vec<ExtractedImage>,
    /// Document metadata
    pub metadata: DocumentMetadata,
}

/// An image extracted from a document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedImage {
    /// Unique identifier for this image
    pub id: String,
    /// Original reference in the document (e.g., filename or internal ID)
    pub original_ref: String,
    /// Relationship ID used to reference this image in the document XML
    pub relationship_id: Option<String>,
    /// Image data (raw bytes)
    pub data: Vec<u8>,
    /// MIME content type
    pub content_type: String,
    /// Optional caption or alt text from the document
    pub caption: Option<String>,
}

/// Metadata about the document
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocumentMetadata {
    /// Document title (if available)
    pub title: Option<String>,
    /// Author (if available)
    pub author: Option<String>,
    /// Number of pages (for PDF)
    pub page_count: Option<usize>,
    /// Sheet names (for Excel)
    pub sheet_names: Vec<String>,
}

/// Supported document types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DocumentType {
    Word,
    Excel,
    Pdf,
    Text,
    Unknown,
}

impl DocumentType {
    /// Detect document type from file extension
    pub fn from_extension(ext: &str) -> Self {
        match ext.to_lowercase().as_str() {
            "docx" | "doc" => DocumentType::Word,
            "xlsx" | "xls" => DocumentType::Excel,
            "pdf" => DocumentType::Pdf,
            "txt" | "text" => DocumentType::Text,
            _ => DocumentType::Unknown,
        }
    }

    /// Detect document type from MIME type
    pub fn from_mime_type(mime: &str) -> Self {
        match mime {
            mime if mime.contains("word") || mime.contains("document") => DocumentType::Word,
            mime if mime.contains("excel") || mime.contains("spreadsheet") => DocumentType::Excel,
            mime if mime.contains("pdf") => DocumentType::Pdf,
            mime if mime.contains("text") => DocumentType::Text,
            _ => DocumentType::Unknown,
        }
    }
}

/// Trait for document parsers
#[async_trait]
pub trait DocumentParser: Send + Sync {
    /// Parse a document and extract its content
    async fn parse(&self, data: &[u8]) -> Result<ParseResult, DocumentError>;

    /// Get the supported document type
    fn document_type(&self) -> DocumentType;
}

/// Create a parser for the given document type
pub fn create_parser(doc_type: DocumentType) -> Option<Box<dyn DocumentParser>> {
    match doc_type {
        DocumentType::Word => Some(Box::new(DocxParser::new())),
        DocumentType::Excel => Some(Box::new(XlsxParser::new())),
        DocumentType::Pdf => Some(Box::new(PdfParser::new())),
        DocumentType::Text => None, // Text doesn't need a special parser
        DocumentType::Unknown => None,
    }
}

/// Parse a document based on its type and data
pub async fn parse_document(
    data: &[u8],
    doc_type: DocumentType,
) -> Result<ParseResult, DocumentError> {
    match doc_type {
        DocumentType::Text => {
            // For plain text, just return the content as-is
            let content = String::from_utf8_lossy(data).to_string();
            Ok(ParseResult {
                content,
                images: vec![],
                metadata: DocumentMetadata::default(),
            })
        }
        _ => {
            let parser = create_parser(doc_type)
                .ok_or_else(|| DocumentError::UnsupportedType(format!("{:?}", doc_type)))?;
            parser.parse(data).await
        }
    }
}