//! Feishu (Lark) document fetching via Feishu Open Platform API.
//!
//! Supports both public shared links and internal documents (with API credentials).

use crate::executor::FETCH_SEMAPHORE;
use regex::Regex;
use serde::Deserialize;
use std::sync::LazyLock;

/// Detect if a URL is a Feishu document URL.
pub fn is_feishu_url(url: &str) -> bool {
    url.contains("feishu.cn/docx/") || url.contains("larksuite.com/docx/")
}

/// Extract document ID from a Feishu URL.
/// Example: https://xxx.feishu.cn/docx/xxxxxxxxxxxxxxx -> xxxxxxxxxxxxxxx
pub fn extract_doc_id(url: &str) -> Option<String> {
    let re = Regex::new(r"/docx/([A-Za-z0-9_-]+)").ok()?;
    re.captures(url).map(|c| c.get(1).unwrap().as_str().to_string())
}

/// Feishu API token response.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    #[serde(rename = "tenant_access_token")]
    tenant_access_token: String,
    #[serde(rename = "expire")]
    expire: u64,
}

/// Feishu document response.
#[derive(Debug, Deserialize)]
struct DocResponse {
    data: DocData,
}

#[derive(Debug, Deserialize)]
struct DocData {
    document: FeishuDocument,
}

#[derive(Debug, Deserialize)]
struct FeishuDocument {
    #[serde(rename = "document_id")]
    document_id: String,
    title: String,
    #[serde(rename = "create_time")]
    create_time: Option<String>,
    #[serde(rename = "update_time")]
    update_time: Option<String>,
    #[serde(rename = "create_uid")]
    create_uid: Option<String>,
    #[serde(rename = "owner_id")]
    owner_id: Option<String>,
}

/// Shared reqwest client for Feishu API calls.
static FEISHU_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (compatible; Atomic/1.0; +https://github.com/atomic)")
        .build()
        .expect("Failed to build Feishu HTTP client")
});

/// Get Feishu access token from app_id and app_secret.
pub async fn get_access_token(
    app_id: &str,
    app_secret: &str,
) -> Result<String, String> {
    let _permit = FETCH_SEMAPHORE
        .acquire()
        .await
        .map_err(|_| "Fetch semaphore closed".to_string())?;

    let response = FEISHU_CLIENT
        .post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal")
        .json(&serde_json::json!({
            "app_id": app_id,
            "app_secret": app_secret
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to get Feishu token: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Feishu auth failed ({}): {}", status, body));
    }

    let body = response.text().await.map_err(|e| format!("Failed to read Feishu token body: {}", e))?;

    let token_data: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Feishu token response: {} | Body: {}", e, &body[..body.len().min(500)]))?;

    Ok(token_data.tenant_access_token)
}

/// Fetch a Feishu document and convert it to markdown.
pub async fn fetch_feishu_doc(
    url: &str,
    token: Option<&str>,
) -> Result<super::ResolvedContent, String> {
    let doc_id = extract_doc_id(url).ok_or("Invalid Feishu URL")?;

    // Fetch document metadata
    let doc = fetch_document_meta(&doc_id, token).await?;

    // Fetch raw document content (markdown format)
    let markdown = fetch_raw_content(&doc_id, token).await?;

    let title = doc.title.clone();
    let content = if title.is_empty() {
        markdown
    } else {
        format!("# {}\n\n{}", title, markdown)
    };

    Ok(super::ResolvedContent {
        title,
        markdown: content,
        byline: None,
        excerpt: None,
        site_name: Some("Feishu".to_string()),
    })
}

/// Fetch document metadata.
async fn fetch_document_meta(
    doc_id: &str,
    token: Option<&str>,
) -> Result<FeishuDocument, String> {
    let _permit = FETCH_SEMAPHORE
        .acquire()
        .await
        .map_err(|_| "Fetch semaphore closed".to_string())?;

    let mut request = FEISHU_CLIENT.get(&format!(
        "https://open.feishu.cn/open-apis/docx/v1/documents/{}",
        doc_id
    ));

    if let Some(t) = token {
        request = request.header("Authorization", format!("Bearer {}", t));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Feishu document: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Feishu API error ({}): {}", status, body));
    }

    let body = response.text().await.map_err(|e| format!("Failed to read Feishu response body: {}", e))?;

    let doc_response: DocResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Feishu document response: {} | Body: {}", e, &body[..body.len().min(500)]))?;

    Ok(doc_response.data.document)
}

/// Fetch raw document content (markdown format).
async fn fetch_raw_content(
    doc_id: &str,
    token: Option<&str>,
) -> Result<String, String> {
    let _permit = FETCH_SEMAPHORE
        .acquire()
        .await
        .map_err(|_| "Fetch semaphore closed".to_string())?;

    let url = format!(
        "https://open.feishu.cn/open-apis/docx/v1/documents/{}/raw_content?lang=0",
        doc_id
    );

    let mut request = FEISHU_CLIENT.get(&url);

    if let Some(t) = token {
        request = request.header("Authorization", format!("Bearer {}", t));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Feishu raw content: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Feishu raw content API error ({}): {}", status, body));
    }

    let body = response.text().await.map_err(|e| format!("Failed to read Feishu raw content body: {}", e))?;

    #[derive(Deserialize)]
    struct RawContentResponse {
        data: RawContentData,
    }
    #[derive(Deserialize)]
    struct RawContentData {
        content: String,
    }

    let content_response: RawContentResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Feishu raw content response: {} | Body: {}", e, &body[..body.len().min(500)]))?;

    Ok(content_response.data.content)
}

/// Validate Feishu credentials by attempting to get a token.
pub async fn validate_credentials(
    app_id: &str,
    app_secret: &str,
) -> Result<(), String> {
    get_access_token(app_id, app_secret).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_feishu_url() {
        assert!(is_feishu_url("https://xxx.feishu.cn/docx/abc123"));
        assert!(is_feishu_url("https://xxx.larksuite.com/docx/abc123"));
        assert!(!is_feishu_url("https://example.com/docx/abc123"));
        assert!(!is_feishu_url("https://feishu.cn/wiki/abc123"));
    }

    #[test]
    fn test_extract_doc_id() {
        assert_eq!(
            extract_doc_id("https://xxx.feishu.cn/docx/abc123XYZ"),
            Some("abc123XYZ".to_string())
        );
        assert_eq!(
            extract_doc_id("https://xxx.larksuite.com/docx/abc-123_XYZ"),
            Some("abc-123_XYZ".to_string())
        );
        assert_eq!(extract_doc_id("https://example.com/docx/abc"), None);
    }
}