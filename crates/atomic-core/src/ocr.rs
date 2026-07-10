//! OCR integration using Tesseract
//!
//! Calls Tesseract OCR API to extract text from images.

use reqwest::Client;
use std::path::Path;

use crate::error::{AtomicCoreError, Result};

/// OCR result containing extracted text
#[derive(Debug, Clone)]
pub struct OcrResult {
    /// Extracted text from the image
    pub text: String,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f64,
}

/// Call Tesseract OCR API to extract text from an image file
///
/// # Arguments
/// * `tesseract_url` - Base URL of Tesseract API (e.g., "http://10.70.0.52:8080")
/// * `image_path` - Path to the image file
///
/// # Returns
/// OCR result with extracted text and confidence
pub async fn extract_text_from_image(
    tesseract_url: &str,
    image_path: &Path,
) -> Result<OcrResult> {
    let client = Client::new();
    let url = format!("{}/api/ocr", tesseract_url.trim_end_matches('/'));

    let image_bytes = tokio::fs::read(image_path).await.map_err(|e| {
        AtomicCoreError::Io(e)
    })?;

    let part = reqwest::multipart::Part::bytes(image_bytes)
        .file_name("image.png")
        .mime_str("image/png")
        .map_err(|e| AtomicCoreError::Configuration(format!("Invalid mime type: {}", e)))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| AtomicCoreError::Configuration(format!("OCR request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AtomicCoreError::Configuration(format!(
            "OCR API returned error {}: {}",
            status, body
        )));
    }

    #[derive(serde::Deserialize)]
    struct TesseractResponse {
        text: String,
        confidence: Option<f64>,
    }

    let ocr_response: TesseractResponse = response
        .json()
        .await
        .map_err(|e| AtomicCoreError::Configuration(format!("Failed to parse OCR response: {}", e)))?;

    Ok(OcrResult {
        text: ocr_response.text,
        confidence: ocr_response.confidence.unwrap_or(0.0),
    })
}

/// Extract text from image bytes
///
/// # Arguments
/// * `tesseract_url` - Base URL of Tesseract API
/// * `image_bytes` - Raw image bytes
/// * `mime_type` - MIME type of the image (e.g., "image/png", "image/jpeg")
///
/// # Returns
/// OCR result with extracted text and confidence
pub async fn extract_text_from_bytes(
    tesseract_url: &str,
    image_bytes: &[u8],
    mime_type: &str,
) -> Result<OcrResult> {
    let client = Client::new();
    let url = format!("{}/api/ocr", tesseract_url.trim_end_matches('/'));

    let part = reqwest::multipart::Part::bytes(image_bytes.to_vec())
        .file_name("image")
        .mime_str(mime_type)
        .map_err(|e| AtomicCoreError::Configuration(format!("Invalid mime type: {}", e)))?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| AtomicCoreError::Configuration(format!("OCR request failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AtomicCoreError::Configuration(format!(
            "OCR API returned error {}: {}",
            status, body
        )));
    }

    #[derive(serde::Deserialize)]
    struct TesseractResponse {
        text: String,
        confidence: Option<f64>,
    }

    let ocr_response: TesseractResponse = response
        .json()
        .await
        .map_err(|e| AtomicCoreError::Configuration(format!("Failed to parse OCR response: {}", e)))?;

    Ok(OcrResult {
        text: ocr_response.text,
        confidence: ocr_response.confidence.unwrap_or(0.0),
    })
}