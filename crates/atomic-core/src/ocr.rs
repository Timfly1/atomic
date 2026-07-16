//! OCR integration using pluggable providers (Tesseract, PaddleOCR, etc.)
//!
//! Provides a trait-based abstraction for OCR operations.

use reqwest::Client;
use std::path::Path;
use std::sync::Arc;

use crate::error::{AtomicCoreError, Result};

/// OCR result containing extracted text
#[derive(Debug, Clone)]
pub struct OcrResult {
    /// Extracted text from the image
    pub text: String,
    /// Confidence score (0.0 - 1.0)
    pub confidence: f64,
}

/// OCR Provider trait - implemented by different OCR backends
#[async_trait::async_trait]
pub trait OcrProvider: Send + Sync {
    /// Extract text from an image file
    async fn extract_text(&self, image_path: &Path) -> Result<OcrResult>;

    /// Extract text from raw image bytes
    async fn extract_text_from_bytes(&self, image_bytes: &[u8], mime_type: &str) -> Result<OcrResult>;
}

/// Tesseract OCR provider
pub struct TesseractProvider {
    base_url: String,
    client: Client,
}

impl TesseractProvider {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: Client::new(),
        }
    }
}

#[async_trait::async_trait]
impl OcrProvider for TesseractProvider {
    async fn extract_text(&self, image_path: &Path) -> Result<OcrResult> {
        let image_bytes = tokio::fs::read(image_path).await.map_err(|e| {
            AtomicCoreError::Io(e)
        })?;
        self.extract_text_from_bytes(&image_bytes, "image/png").await
    }

    async fn extract_text_from_bytes(&self, image_bytes: &[u8], mime_type: &str) -> Result<OcrResult> {
        let url = format!("{}/api/ocr", self.base_url.trim_end_matches('/'));

        let part = reqwest::multipart::Part::bytes(image_bytes.to_vec())
            .file_name("image")
            .mime_str(mime_type)
            .map_err(|e| AtomicCoreError::Configuration(format!("Invalid mime type: {}", e)))?;

        let form = reqwest::multipart::Form::new().part("file", part);

        let response = self.client
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
}

/// PaddleOCR provider
pub struct PaddleOcrProvider {
    base_url: String,
    client: Client,
}

impl PaddleOcrProvider {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            client: Client::new(),
        }
    }
}

#[async_trait::async_trait]
impl OcrProvider for PaddleOcrProvider {
    async fn extract_text(&self, image_path: &Path) -> Result<OcrResult> {
        let image_bytes = tokio::fs::read(image_path).await.map_err(|e| {
            AtomicCoreError::Io(e)
        })?;
        self.extract_text_from_bytes(&image_bytes, "image/png").await
    }

    async fn extract_text_from_bytes(&self, image_bytes: &[u8], mime_type: &str) -> Result<OcrResult> {
        let url = format!("{}/api/ocr", self.base_url.trim_end_matches('/'));

        let part = reqwest::multipart::Part::bytes(image_bytes.to_vec())
            .file_name("image")
            .mime_str(mime_type)
            .map_err(|e| AtomicCoreError::Configuration(format!("Invalid mime type: {}", e)))?;

        let form = reqwest::multipart::Form::new().part("image", part);

        let response = self.client
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
        struct PaddleOcrResponse {
            text: String,
            confidence: Option<f64>,
        }

        let ocr_response: PaddleOcrResponse = response
            .json()
            .await
            .map_err(|e| AtomicCoreError::Configuration(format!("Failed to parse OCR response: {}", e)))?;

        Ok(OcrResult {
            text: ocr_response.text,
            confidence: ocr_response.confidence.unwrap_or(0.0),
        })
    }
}

/// Create an OCR provider based on settings
pub fn create_ocr_provider(settings: &std::collections::HashMap<String, String>) -> Result<Arc<dyn OcrProvider>> {
    let provider_type = settings.get("ocr_provider_type").map(|s| s.as_str()).unwrap_or("paddleocr");

    match provider_type {
        "tesseract" => {
            let host = settings.get("tesseract_host").cloned()
                .unwrap_or_else(|| crate::settings::DEFAULT_TESSERACT_HOST.to_string());
            Ok(Arc::new(TesseractProvider::new(host)))
        }
        "paddleocr" | _ => {
            let host = settings.get("paddleocr_host").cloned()
                .unwrap_or_else(|| crate::settings::DEFAULT_PADDLEOCR_HOST.to_string());
            Ok(Arc::new(PaddleOcrProvider::new(host)))
        }
    }
}