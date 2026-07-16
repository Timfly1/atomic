//! Feishu (Lark) document fetching via Feishu Open Platform API.
//!
//! Supports both public shared links and internal documents (with API credentials).

use crate::executor::FETCH_SEMAPHORE;
use regex::Regex;
use serde::{Deserialize, Serialize};
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

/// Feishu document blocks response.
#[derive(Debug, Deserialize)]
struct BlocksResponse {
    data: BlocksData,
}

#[derive(Debug, Deserialize)]
struct BlocksData {
    items: Vec<Block>,
    #[serde(rename = "page_token")]
    page_token: Option<String>,
    #[serde(rename = "has_more")]
    has_more: bool,
}

#[derive(Debug, Deserialize, Clone)]
struct Block {
    #[serde(rename = "block_id")]
    block_id: String,
    #[serde(rename = "block_type")]
    block_type: u32,
    parent_id: Option<String>,
    children: Option<Vec<String>>,
    #[serde(rename = "block_style")]
    block_style: Option<BlockStyle>,
    #[serde(rename = "text")]
    text: Option<TextContent>,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct BlockStyle {
    #[serde(rename = "bold")]
    bold: Option<bool>,
    #[serde(rename = "italic")]
    italic: Option<bool>,
    #[serde(rename = "strikethrough")]
    strikethrough: Option<bool>,
    #[serde(rename = "underline")]
    underline: Option<bool>,
    #[serde(rename = "inline_code")]
    inline_code: Option<bool>,
    #[serde(rename = "link")]
    link: Option<LinkStyle>,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct LinkStyle {
    pub url: String,
}

#[derive(Debug, Deserialize, Clone)]
struct TextContent {
    #[serde(rename = "text_elements")]
    text_elements: Option<Vec<TextElement>>,
}

#[derive(Debug, Deserialize, Clone)]
struct TextElement {
    #[serde(rename = "text_run")]
    text_run: TextRun,
}

#[derive(Debug, Deserialize, Clone)]
struct TextRun {
    content: String,
    #[serde(rename = "text_element_style")]
    text_element_style: Option<TextElementStyle>,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct TextElementStyle {
    #[serde(rename = "bold")]
    bold: Option<bool>,
    #[serde(rename = "italic")]
    italic: Option<bool>,
    #[serde(rename = "strikethrough")]
    strikethrough: Option<bool>,
    #[serde(rename = "underline")]
    underline: Option<bool>,
    #[serde(rename = "inline_code")]
    inline_code: Option<bool>,
    #[serde(rename = "link")]
    link: Option<LinkStyle>,
    #[serde(rename = "text_color")]
    text_color: Option<u32>,
    #[serde(rename = "background_color")]
    background_color: Option<u32>,
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

    // Fetch document blocks and convert to markdown
    let markdown = fetch_document_blocks(&doc_id, token).await?;

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

/// Fetch all document blocks and convert to markdown.
async fn fetch_document_blocks(
    doc_id: &str,
    token: Option<&str>,
) -> Result<String, String> {
    let mut all_blocks = Vec::new();
    let mut page_token: Option<String> = None;

    loop {
        let blocks = fetch_blocks_page(doc_id, page_token.as_deref(), token)
            .await?;

        all_blocks.extend(blocks.items);

        if blocks.has_more {
            page_token = blocks.page_token;
        } else {
            break;
        }
    }

    // Fetch text content for blocks that don't have it
    let mut blocks_with_text = all_blocks.clone();
    for block in blocks_with_text.iter_mut() {
        let needs_fetch = block.text.is_none() || block.text.as_ref().and_then(|t| t.text_elements.as_ref()).map(|e| e.is_empty()).unwrap_or(true);
        if needs_fetch {
            eprintln!("[Feishu] Fetching text for block {} (type={})", block.block_id, block.block_type);
            match fetch_single_block(doc_id, &block.block_id, token).await {
                Ok(updated_block) => {
                    eprintln!("[Feishu] Got text for block {}: {:?}", block.block_id, updated_block.text);
                    block.text = updated_block.text;
                }
                Err(e) => {
                    eprintln!("[Feishu] Failed to fetch block {}: {}", block.block_id, e);
                }
            }
        }
    }

    Ok(blocks_to_markdown(&blocks_with_text))
}

/// Fetch a single block with its text content.
async fn fetch_single_block(
    doc_id: &str,
    block_id: &str,
    token: Option<&str>,
) -> Result<Block, String> {
    let _permit = FETCH_SEMAPHORE
        .acquire()
        .await
        .map_err(|_| "Fetch semaphore closed".to_string())?;

    let url = format!(
        "https://open.feishu.cn/open-apis/docx/v1/documents/{}/blocks/{}",
        doc_id, block_id
    );

    let mut request = FEISHU_CLIENT.get(&url);

    if let Some(t) = token {
        request = request.header("Authorization", format!("Bearer {}", t));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Feishu block: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Feishu block API error: {}", response.status()));
    }

    #[derive(Deserialize)]
    struct SingleBlockResponse {
        data: BlockData,
    }
    #[derive(Deserialize)]
    struct BlockData {
        block: Block,
    }

    let body = response.text().await.map_err(|e| format!("Failed to read block body: {}", e))?;
    let block_response: SingleBlockResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse block response: {}", e))?;

    Ok(block_response.data.block)
}

/// Fetch a single page of blocks.
async fn fetch_blocks_page(
    doc_id: &str,
    page_token: Option<&str>,
    token: Option<&str>,
) -> Result<BlocksData, String> {
    let _permit = FETCH_SEMAPHORE
        .acquire()
        .await
        .map_err(|_| "Fetch semaphore closed".to_string())?;

    let mut url = format!(
        "https://open.feishu.cn/open-apis/docx/v1/documents/{}/blocks?page_size=500",
        doc_id
    );

    if let Some(pt) = page_token {
        url.push_str(&format!("&page_token={}", pt));
    }

    let mut request = FEISHU_CLIENT.get(&url);

    if let Some(t) = token {
        request = request.header("Authorization", format!("Bearer {}", t));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Feishu blocks: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Feishu blocks API error ({}): {}", status, body));
    }

    let body = response.text().await.map_err(|e| format!("Failed to read Feishu blocks body: {}", e))?;

    let blocks_response: BlocksResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse Feishu blocks response: {} | Body: {}", e, &body[..body.len().min(500)]))?;

    Ok(blocks_response.data)
}

/// Convert Feishu blocks to markdown.
fn blocks_to_markdown(blocks: &[Block]) -> String {
    let mut result = String::new();

    // Build a map of block_id -> block for quick lookup
    let block_map: std::collections::HashMap<&str, &Block> = blocks
        .iter()
        .map(|b| (b.block_id.as_str(), b))
        .collect();

    // Find root blocks (blocks whose parent_id is empty or points to the document root)
    // The document root block typically has block_type 1 and is the first block
    let root_block_id = blocks.first().map(|b| b.block_id.as_str()).unwrap_or("");

    // Recursively render blocks starting from root
    render_block_tree(blocks, &block_map, root_block_id, &mut result, 0);

    result
}

/// Recursively render a block and its children.
fn render_block_tree(
    blocks: &[Block],
    block_map: &std::collections::HashMap<&str, &Block>,
    block_id: &str,
    result: &mut String,
    depth: usize,
) {
    let block = match block_map.get(block_id) {
        Some(b) => b,
        None => return,
    };

    // If this block has children, render them instead of this block
    if let Some(children) = &block.children {
        if !children.is_empty() {
            for child_id in children {
                render_block_tree(blocks, block_map, child_id, result, depth);
            }
            return;
        }
    }

    // This is a leaf block - convert it to markdown
    let markdown = block_to_markdown_leaf(block, depth);
    if !markdown.is_empty() {
        result.push_str(&markdown);
        result.push('\n');
    }
}

/// Convert a leaf block to markdown (without recursion into children).
fn block_to_markdown_leaf(block: &Block, _depth: usize) -> String {
    // Get text content from the block
    let text = block.text
        .as_ref()
        .and_then(|t| t.text_elements.as_ref())
        .map(|els| {
            els.iter()
                .map(|e| e.text_run.content.clone())
                .collect::<String>()
        })
        .unwrap_or_default();

    match block.block_type {
        1 => {
            // Paragraph - just return the text
            if text.is_empty() {
                String::new()
            } else {
                text
            }
        }
        2 => format!("# {}", text),           // Heading 1
        3 => format!("## {}", text),          // Heading 2
        4 => format!("### {}", text),         // Heading 3
        5 => format!("#### {}", text),        // Heading 4
        6 => format!("##### {}", text),       // Heading 5
        7 => format!("###### {}", text),      // Heading 6
        12 => format!("- {}", text),          // Bullet list
        13 => format!("1. {}", text),         // Ordered list
        14 => format!("```\n{}\n```", text),  // Code block
        15 => format!("> {}", text),          // Quote
        17 => format!("> [!NOTE]\n> {}", text), // Callout
        18 => format!("<details>\n<summary>{}</summary>\n\n</details>", text), // Toggle
        20 => {
            // Table - simplified
            if text.is_empty() {
                String::new()
            } else {
                format!("| {} |\n|--|\n| |", text)
            }
        }
        22 => {
            // Image
            if text.is_empty() {
                String::new()
            } else {
                format!("![{}]()", text)
            }
        }
        23 => {
            // Video
            if text.is_empty() {
                String::new()
            } else {
                format!("[Video: {}]()", text)
            }
        }
        24 => {
            // Embed
            if text.is_empty() {
                String::new()
            } else {
                format!("[Link: {}]()", text)
            }
        }
        27 => "---\n".to_string(),            // Divider
        _ => text,                            // Fallback
    }
}

/// Extract plain text content from text elements.
fn text_content(elements: Option<&Vec<TextElement>>) -> String {
    elements
        .map(|els| els.iter().map(|e| e.text_run.content.clone()).collect())
        .unwrap_or_default()
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