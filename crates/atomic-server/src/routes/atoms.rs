//! Atom and Tag CRUD routes

use crate::db_extractor::Db;
use crate::error::{ok_or_error, ApiErrorResponse};
use crate::event_bridge::embedding_event_callback;
use crate::state::{AppState, ServerEvent};
use actix_web::{web, HttpResponse};
use atomic_core::{
    AtomLink, AtomWithTags, BulkCreateResult, PaginatedAtoms,
    PaginatedTagChildren, SourceInfo, Tag, TagWithCount, UpdateAtomRequest,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use utoipa::{IntoParams, ToSchema};

// ==================== Atoms ====================

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetAtomsQuery {
    /// Filter by tag ID
    pub tag_id: Option<String>,
    /// Max results to return (default: 50)
    pub limit: Option<i32>,
    /// Offset for pagination
    pub offset: Option<i32>,
    /// Cursor for keyset pagination (updated_at value)
    pub cursor: Option<String>,
    /// Cursor tiebreaker (atom id)
    pub cursor_id: Option<String>,
    /// Source filter: "all", "manual", or "external"
    pub source: Option<String>,
    /// Filter by specific source domain (e.g. "nytimes.com")
    pub source_value: Option<String>,
    /// Sort field: "updated", "created", "published", or "title"
    pub sort_by: Option<String>,
    /// Sort direction: "desc" or "asc"
    pub sort_order: Option<String>,
    /// Optional `kind` filter for external consumers (MCP exports, future
    /// sync clients) that want to exclude report-generated finding atoms.
    /// CSV of `captured` / `report`. Missing/empty = no filter (returns all
    /// kinds, preserving the UI's read shape — the React app does not pass
    /// this parameter). Invalid value → 400.
    pub kinds: Option<String>,
}

/// Parse the `?kinds=` CSV into a `KindFilter`. `None` and empty strings
/// resolve to `KindFilter::All` (backwards compatible). Any unknown token
/// returns a 400-ready error. Whitespace around individual tokens is
/// trimmed so `?kinds=captured, report` works.
fn parse_kinds(raw: Option<&str>) -> Result<atomic_core::models::KindFilter, HttpResponse> {
    use atomic_core::models::{AtomKind, KindFilter};
    use std::str::FromStr;
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(KindFilter::All);
    };
    let mut kinds = Vec::new();
    for token in raw.split(',') {
        let token = token.trim();
        if token.is_empty() {
            continue;
        }
        match AtomKind::from_str(token) {
            Ok(k) if !kinds.contains(&k) => kinds.push(k),
            Ok(_) => {}
            Err(_) => {
                return Err(HttpResponse::BadRequest().json(ApiErrorResponse {
                    error: format!(
                        "invalid kinds value '{token}': expected 'captured' or 'report'"
                    ),
                }));
            }
        }
    }
    if kinds.is_empty() {
        return Ok(KindFilter::All);
    }
    Ok(KindFilter::Only(kinds))
}

#[utoipa::path(
    get,
    path = "/api/atoms",
    params(GetAtomsQuery),
    responses(
        (status = 200, description = "Paginated list of atoms", body = PaginatedAtoms),
        (status = 500, description = "Internal error", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn get_atoms(db: Db, query: web::Query<GetAtomsQuery>) -> HttpResponse {
    let source_filter = match query.source.as_deref() {
        Some("manual") => atomic_core::SourceFilter::Manual,
        Some("external") => atomic_core::SourceFilter::External,
        _ => atomic_core::SourceFilter::All,
    };
    let sort_by = match query.sort_by.as_deref() {
        Some("created") => atomic_core::SortField::Created,
        Some("published") => atomic_core::SortField::Published,
        Some("title") => atomic_core::SortField::Title,
        _ => atomic_core::SortField::Updated,
    };
    let sort_order = match query.sort_order.as_deref() {
        Some("asc") => atomic_core::SortOrder::Asc,
        _ => atomic_core::SortOrder::Desc,
    };
    let params = atomic_core::ListAtomsParams {
        tag_id: query.tag_id.clone(),
        limit: query.limit.unwrap_or(50),
        offset: query.offset.unwrap_or(0),
        cursor: query.cursor.clone(),
        cursor_id: query.cursor_id.clone(),
        source_filter,
        source_value: query.source_value.clone(),
        sort_by,
        sort_order,
    };
    // The default (missing `kinds`) stays `KindFilter::All` so the React
    // app — which does not pass this parameter — keeps showing findings
    // alongside captured atoms. External consumers that don't want
    // findings in their export must opt in with `?kinds=captured`. This
    // is deliberately backwards compatible; restricting the default would
    // hide finding atoms from the UI that already renders them.
    let kinds = match parse_kinds(query.kinds.as_deref()) {
        Ok(k) => k,
        Err(resp) => return resp,
    };
    ok_or_error(db.0.list_atoms(&params, &kinds).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use atomic_core::models::{AtomKind, KindFilter};

    #[test]
    fn kinds_query_filter_parses_captured() {
        let f = parse_kinds(Some("captured")).expect("parses");
        assert!(matches!(f, KindFilter::Only(ref ks) if ks == &vec![AtomKind::Captured]));
    }

    #[test]
    fn kinds_query_filter_parses_csv_both() {
        let f = parse_kinds(Some("captured,report")).expect("parses");
        match f {
            KindFilter::Only(ks) => {
                assert_eq!(ks, vec![AtomKind::Captured, AtomKind::Report]);
            }
            _ => panic!("expected Only"),
        }
    }

    #[test]
    fn kinds_query_filter_dedupes_duplicates() {
        // Defensive: `?kinds=captured,captured` collapses, not duplicates.
        let f = parse_kinds(Some("captured,captured")).expect("parses");
        assert!(matches!(f, KindFilter::Only(ref ks) if ks == &vec![AtomKind::Captured]));
    }

    #[test]
    fn kinds_query_invalid_returns_400() {
        let err = parse_kinds(Some("banana")).expect_err("rejected");
        assert_eq!(err.status(), actix_web::http::StatusCode::BAD_REQUEST);
    }

    #[test]
    fn kinds_query_missing_returns_all_kinds() {
        assert!(matches!(
            parse_kinds(None).expect("none ok"),
            KindFilter::All
        ));
        // Empty / whitespace-only matches None semantics.
        assert!(matches!(
            parse_kinds(Some("")).expect("empty ok"),
            KindFilter::All
        ));
        assert!(matches!(
            parse_kinds(Some("   ")).expect("ws ok"),
            KindFilter::All
        ));
    }

    #[test]
    fn kinds_query_tolerates_whitespace_around_tokens() {
        let f = parse_kinds(Some(" captured , report ")).expect("parses");
        match f {
            KindFilter::Only(ks) => {
                assert_eq!(ks, vec![AtomKind::Captured, AtomKind::Report]);
            }
            _ => panic!("expected Only"),
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/atoms/sources",
    responses(
        (status = 200, description = "List of sources with counts", body = Vec<SourceInfo>),
    ),
    tag = "atoms",
)]
pub async fn get_source_list(db: Db) -> HttpResponse {
    ok_or_error(db.0.get_source_list().await)
}

#[utoipa::path(
    get,
    path = "/api/atoms/{id}",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Atom with tags", body = AtomWithTags),
        (status = 404, description = "Atom not found", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn get_atom(db: Db, path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    match db.0.get_atom(&id).await {
        Ok(Some(atom)) => HttpResponse::Ok().json(atom),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({"error": "Atom not found"})),
        Err(e) => crate::error::error_response(e),
    }
}

#[utoipa::path(
    get,
    path = "/api/atoms/{id}/links",
    params(
        ("id" = String, Path, description = "Source atom ID"),
    ),
    responses(
        (status = 200, description = "Materialized atom links emitted by this atom", body = Vec<AtomLink>),
        (status = 500, description = "Internal error", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn get_atom_links(db: Db, path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();
    ok_or_error(db.0.get_atom_links(&id).await)
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct LinkSuggestionsQuery {
    /// Title query. Empty returns recent atoms.
    pub q: Option<String>,
    /// Max results to return (default: 10, max: 50)
    pub limit: Option<i32>,
}

#[utoipa::path(
    get,
    path = "/api/atoms/link-suggestions",
    params(LinkSuggestionsQuery),
    responses(
        (status = 200, description = "Recent atoms or title matches for editor link completion", body = Vec<atomic_core::AtomLinkSuggestion>),
        (status = 500, description = "Internal error", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn get_atom_link_suggestions(
    db: Db,
    query: web::Query<LinkSuggestionsQuery>,
) -> HttpResponse {
    ok_or_error(
        db.0.suggest_atom_links(
            query.q.as_deref().unwrap_or_default(),
            query.limit.unwrap_or(10),
        )
        .await,
    )
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetAtomBySourceUrlQuery {
    /// The source URL to look up
    pub url: String,
}

#[utoipa::path(
    get,
    path = "/api/atoms/by-source-url",
    params(GetAtomBySourceUrlQuery),
    responses(
        (status = 200, description = "Atom found", body = AtomWithTags),
        (status = 404, description = "No atom with this source URL", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn get_atom_by_source_url(
    db: Db,
    query: web::Query<GetAtomBySourceUrlQuery>,
) -> HttpResponse {
    let url = query.into_inner().url;
    match db.0.get_atom_by_source_url(&url).await {
        Ok(Some(atom)) => HttpResponse::Ok().json(atom),
        Ok(None) => HttpResponse::NotFound()
            .json(serde_json::json!({"error": "No atom found with this source URL"})),
        Err(e) => crate::error::error_response(e),
    }
}

#[derive(Deserialize, Serialize, ToSchema)]
pub struct CreateAtomRequest {
    /// Markdown content of the atom
    pub content: String,
    /// Optional source URL
    pub source_url: Option<String>,
    /// Optional publication date (ISO 8601)
    pub published_at: Option<String>,
    /// Tag IDs to assign
    #[serde(default)]
    pub tag_ids: Vec<String>,
    /// When true, skip creation if an atom with the same source_url already exists
    #[serde(default)]
    pub skip_if_source_exists: bool,
}

#[utoipa::path(
    post,
    path = "/api/atoms",
    request_body = CreateAtomRequest,
    responses(
        (status = 201, description = "Created atom", body = AtomWithTags),
        (status = 400, description = "Validation error", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn create_atom(
    state: web::Data<AppState>,
    db: Db,
    body: web::Json<CreateAtomRequest>,
) -> HttpResponse {
    let req = body.into_inner();
    let on_event = embedding_event_callback(state.event_tx.clone());
    let event_tx = state.event_tx.clone();
    match db
        .0
        .create_atom(
            atomic_core::CreateAtomRequest {
                content: req.content,
                source_url: req.source_url,
                published_at: req.published_at,
                tag_ids: req.tag_ids,
                skip_if_source_exists: req.skip_if_source_exists,
            },
            on_event,
        )
        .await
    {
        Ok(Some(atom)) => {
            let _ = event_tx.send(ServerEvent::AtomCreated { atom: atom.clone() });
            HttpResponse::Created().json(atom)
        }
        Ok(None) => HttpResponse::Ok().json(serde_json::json!({"skipped": true})),
        Err(e) => crate::error::error_response(e),
    }
}

#[utoipa::path(
    post,
    path = "/api/atoms/bulk",
    request_body = Vec<CreateAtomRequest>,
    responses(
        (status = 201, description = "Bulk create result", body = BulkCreateResult),
        (status = 400, description = "Validation error", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn bulk_create_atoms(
    state: web::Data<AppState>,
    db: Db,
    body: web::Json<Vec<CreateAtomRequest>>,
) -> HttpResponse {
    let requests: Vec<atomic_core::CreateAtomRequest> = body
        .into_inner()
        .into_iter()
        .map(|r| atomic_core::CreateAtomRequest {
            content: r.content,
            source_url: r.source_url,
            published_at: r.published_at,
            tag_ids: r.tag_ids,
            skip_if_source_exists: r.skip_if_source_exists,
        })
        .collect();
    let on_event = embedding_event_callback(state.event_tx.clone());
    let event_tx = state.event_tx.clone();
    match db.0.create_atoms_bulk(requests, on_event).await {
        Ok(result) => {
            for atom in &result.atoms {
                let _ = event_tx.send(ServerEvent::AtomCreated { atom: atom.clone() });
            }
            HttpResponse::Created().json(result)
        }
        Err(e) => crate::error::error_response(e),
    }
}

#[utoipa::path(
    put,
    path = "/api/atoms/{id}",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    request_body = UpdateAtomRequest,
    responses(
        (status = 200, description = "Updated atom", body = AtomWithTags),
        (status = 404, description = "Atom not found", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn update_atom(
    state: web::Data<AppState>,
    db: Db,
    path: web::Path<String>,
    body: web::Json<UpdateAtomRequest>,
) -> HttpResponse {
    let id = path.into_inner();
    let req = body.into_inner();
    let on_event = embedding_event_callback(state.event_tx.clone());
    let event_tx = state.event_tx.clone();
    match db
        .0
        .update_atom(
            &id,
            atomic_core::UpdateAtomRequest {
                content: req.content,
                source_url: req.source_url,
                published_at: req.published_at,
                tag_ids: req.tag_ids,
                image_path: req.image_path.clone(),
                document_path: None,
                document_name: None,
                document_type: None,
                embedded_images: None,
            },
            on_event,
        )
        .await
    {
        Ok(atom) => {
            let _ = event_tx.send(ServerEvent::AtomUpdated { atom: atom.clone() });
            HttpResponse::Ok().json(atom)
        }
        Err(e) => crate::error::error_response(e),
    }
}

/// Update atom content/metadata without triggering embedding or tagging pipeline.
/// Used by auto-save during inline editing.
#[utoipa::path(
    put,
    path = "/api/atoms/{id}/content",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    request_body = UpdateAtomRequest,
    responses(
        (status = 200, description = "Updated atom (no pipeline triggered)", body = AtomWithTags),
        (status = 404, description = "Atom not found", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn update_atom_content_only(
    db: Db,
    path: web::Path<String>,
    body: web::Json<UpdateAtomRequest>,
) -> HttpResponse {
    let id = path.into_inner();
    let req = body.into_inner();
    ok_or_error(
        db.0.update_atom_content_only(
            &id,
            atomic_core::UpdateAtomRequest {
                content: req.content,
                source_url: req.source_url,
                published_at: req.published_at,
                tag_ids: req.tag_ids,
                image_path: req.image_path.clone(),
                document_path: None,
                document_name: None,
                document_type: None,
                embedded_images: None,
            },
        )
        .await,
    )
}

#[utoipa::path(
    post,
    path = "/api/atoms/{id}/process",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Queued atom pipeline processing"),
        (status = 404, description = "Atom not found", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn process_atom_pipeline(
    state: web::Data<AppState>,
    db: Db,
    path: web::Path<String>,
) -> HttpResponse {
    let id = path.into_inner();
    tracing::info!(atom_id = %id, "Received explicit atom pipeline request");
    let on_event = embedding_event_callback(state.event_tx.clone());
    ok_or_error(db.0.process_atom_pipeline(&id, on_event).await)
}

#[utoipa::path(
    delete,
    path = "/api/atoms/{id}",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Atom deleted"),
        (status = 404, description = "Atom not found", body = ApiErrorResponse),
    ),
    tag = "atoms",
)]
pub async fn delete_atom(db: Db, path: web::Path<String>) -> HttpResponse {
    let id = path.into_inner();

    // Get atom before deleting to retrieve file paths
    if let Ok(Some(atom)) = db.0.get_atom(&id).await {
        let storage_path = db.0.db_path();

        // Delete image file
        if let Some(img_path_str) = &atom.atom.image_path {
            let images_dir = get_images_dir(&storage_path);
            let extension = std::path::Path::new(img_path_str)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("png");
            let image_filename = format!("{}.{}", id, extension);
            let image_path = images_dir.join(&image_filename);
            if image_path.exists() {
                let _ = tokio::fs::remove_file(&image_path).await;
            } else {
                let fallback = std::path::Path::new(img_path_str);
                if fallback.exists() {
                    let _ = tokio::fs::remove_file(fallback).await;
                }
            }
        }

        // Delete document file
        if let Some(doc_path_str) = &atom.atom.document_path {
            let doc_path = std::path::Path::new(doc_path_str);
            if doc_path.exists() {
                let _ = tokio::fs::remove_file(doc_path).await;
            }
        }

        // Delete embedded images
        for img in &atom.atom.embedded_images {
            let img_path = std::path::Path::new(&img.stored_path);
            if img_path.exists() {
                let _ = tokio::fs::remove_file(img_path).await;
            }
        }
    }

    ok_or_error(db.0.delete_atom(&id).await)
}

// ==================== Tags ====================

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetTagsQuery {
    /// Minimum atom count to include (default: 2)
    pub min_count: Option<i32>,
}

#[derive(Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct GetTagChildrenQuery {
    /// Minimum atom count to include (default: 0)
    pub min_count: Option<i32>,
    /// Max results (default: 100)
    pub limit: Option<i32>,
    /// Offset for pagination
    pub offset: Option<i32>,
}

#[utoipa::path(
    get,
    path = "/api/tags",
    params(GetTagsQuery),
    responses(
        (status = 200, description = "Hierarchical tag tree", body = Vec<TagWithCount>),
    ),
    tag = "tags",
)]
pub async fn get_tags(db: Db, query: web::Query<GetTagsQuery>) -> HttpResponse {
    let min_count = query.min_count.unwrap_or(2);
    ok_or_error(db.0.get_all_tags_filtered(min_count).await)
}

#[utoipa::path(
    get,
    path = "/api/tags/{id}/children",
    params(
        ("id" = String, Path, description = "Parent tag ID"),
        GetTagChildrenQuery,
    ),
    responses(
        (status = 200, description = "Paginated tag children", body = PaginatedTagChildren),
    ),
    tag = "tags",
)]
pub async fn get_tag_children(
    db: Db,
    path: web::Path<String>,
    query: web::Query<GetTagChildrenQuery>,
) -> HttpResponse {
    let parent_id = path.into_inner();
    let min_count = query.min_count.unwrap_or(0);
    let limit = query.limit.unwrap_or(100);
    let offset = query.offset.unwrap_or(0);
    ok_or_error(
        db.0.get_tag_children(&parent_id, min_count, limit, offset)
            .await,
    )
}

#[derive(Deserialize, Serialize, ToSchema)]
pub struct CreateTagRequest {
    /// Tag name
    pub name: String,
    /// Parent tag ID for hierarchy
    pub parent_id: Option<String>,
}

#[utoipa::path(
    post,
    path = "/api/tags",
    request_body = CreateTagRequest,
    responses(
        (status = 201, description = "Created tag", body = Tag),
        (status = 400, description = "Validation error", body = ApiErrorResponse),
    ),
    tag = "tags",
)]
pub async fn create_tag(db: Db, body: web::Json<CreateTagRequest>) -> HttpResponse {
    let req = body.into_inner();
    match db.0.create_tag(&req.name, req.parent_id.as_deref()).await {
        Ok(tag) => HttpResponse::Created().json(tag),
        Err(e) => crate::error::error_response(e),
    }
}

#[derive(Deserialize, Serialize, ToSchema)]
pub struct UpdateTagRequest {
    /// Updated tag name
    pub name: String,
    /// Updated parent tag ID
    pub parent_id: Option<String>,
}

#[utoipa::path(
    put,
    path = "/api/tags/{id}",
    params(
        ("id" = String, Path, description = "Tag ID"),
    ),
    request_body = UpdateTagRequest,
    responses(
        (status = 200, description = "Updated tag", body = Tag),
        (status = 404, description = "Tag not found", body = ApiErrorResponse),
    ),
    tag = "tags",
)]
pub async fn update_tag(
    db: Db,
    path: web::Path<String>,
    body: web::Json<UpdateTagRequest>,
) -> HttpResponse {
    let id = path.into_inner();
    let req = body.into_inner();
    ok_or_error(
        db.0.update_tag(&id, &req.name, req.parent_id.as_deref())
            .await,
    )
}

#[utoipa::path(
    delete,
    path = "/api/tags/{id}",
    params(
        ("id" = String, Path, description = "Tag ID"),
        ("recursive" = Option<bool>, Query, description = "Delete child tags recursively"),
    ),
    responses(
        (status = 200, description = "Tag deleted"),
        (status = 404, description = "Tag not found", body = ApiErrorResponse),
    ),
    tag = "tags",
)]
pub async fn delete_tag(
    db: Db,
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
) -> HttpResponse {
    let id = path.into_inner();
    let recursive = query.get("recursive").map(|v| v == "true").unwrap_or(false);
    ok_or_error(db.0.delete_tag(&id, recursive).await)
}

#[derive(Deserialize, Serialize, ToSchema)]
pub struct SetAutotagTargetRequest {
    /// Whether the tag should be a candidate for AI auto-tagging.
    pub value: bool,
}

#[derive(Deserialize, Serialize, ToSchema)]
pub struct SetAutotagDescriptionRequest {
    /// Optional guidance injected next to this top-level auto-tag target.
    pub description: String,
}

#[utoipa::path(
    put,
    path = "/api/tags/{id}/autotag-target",
    params(
        ("id" = String, Path, description = "Tag ID"),
    ),
    request_body = SetAutotagTargetRequest,
    responses(
        (status = 204, description = "Flag updated"),
        (status = 404, description = "Tag not found", body = ApiErrorResponse),
    ),
    tag = "tags",
)]
pub async fn set_tag_autotag_target(
    db: Db,
    path: web::Path<String>,
    body: web::Json<SetAutotagTargetRequest>,
) -> HttpResponse {
    let id = path.into_inner();
    let value = body.into_inner().value;
    match db.0.set_tag_autotag_target(&id, value).await {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(e) => crate::error::error_response(e),
    }
}

#[utoipa::path(
    put,
    path = "/api/tags/{id}/autotag-description",
    params(
        ("id" = String, Path, description = "Tag ID"),
    ),
    request_body = SetAutotagDescriptionRequest,
    responses(
        (status = 204, description = "Description updated"),
        (status = 404, description = "Top-level tag not found", body = ApiErrorResponse),
    ),
    tag = "tags",
)]
pub async fn set_tag_autotag_description(
    db: Db,
    path: web::Path<String>,
    body: web::Json<SetAutotagDescriptionRequest>,
) -> HttpResponse {
    let id = path.into_inner();
    let description = body.into_inner().description;
    match db.0.set_tag_autotag_description(&id, &description).await {
        Ok(()) => HttpResponse::NoContent().finish(),
        Err(e) => crate::error::error_response(e),
    }
}

#[derive(Deserialize, Serialize, ToSchema)]
pub struct ConfigureAutotagTargetsRequest {
    /// Names of seeded default categories to keep flagged.
    /// Any seeded default not in this list is unflagged.
    pub keep_defaults: Vec<String>,
    /// Names of new top-level tags to create with the flag set.
    /// Existing top-level tags with matching names are flagged in place.
    pub add_custom: Vec<String>,
}

#[utoipa::path(
    post,
    path = "/api/tags/configure-autotag-targets",
    request_body = ConfigureAutotagTargetsRequest,
    responses(
        (status = 200, description = "Newly created/flagged custom tags", body = Vec<Tag>),
    ),
    tag = "tags",
)]
pub async fn configure_autotag_targets(
    db: Db,
    body: web::Json<ConfigureAutotagTargetsRequest>,
) -> HttpResponse {
    let req = body.into_inner();
    ok_or_error(
        db.0.configure_autotag_targets(&req.keep_defaults, &req.add_custom)
            .await,
    )
}

// ==================== Image Upload/Download ====================

fn detect_image_content_type(data: &[u8]) -> Option<&'static str> {
    if data.len() >= 2 {
        if data[0] == 0xFF && data[1] == 0xD8 {
            return Some("image/jpeg");
        }
        if data.len() >= 4 {
            if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
                return Some("image/png");
            }
            if data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 {
                return Some("image/gif");
            }
            if data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 {
                return Some("image/webp");
            }
        }
    }
    None
}

fn get_image_extension(content_type: &str) -> &'static str {
    match content_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "bin",
    }
}

fn get_images_dir(storage_path: &std::path::Path) -> PathBuf {
    // Use parent directory of the database file for images
    storage_path.parent().unwrap_or(storage_path).join("images")
}

pub async fn upload_atom_image(
    db: Db,
    path: web::Path<String>,
    body: web::Bytes,
) -> HttpResponse {
    let atom_id = path.into_inner();

    // Verify atom exists and get current content
    let existing_atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(atom)) => atom,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(e) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: format!("Atom not found: {}", e),
            });
        }
    };
    let existing_content = existing_atom.atom.content.clone();

    // Detect content type
    let content_type = match detect_image_content_type(&body) {
        Some(ct) => ct,
        None => {
            return HttpResponse::BadRequest().json(ApiErrorResponse {
                error: "Unsupported image format. Supported: JPEG, PNG, GIF, WebP".to_string(),
            });
        }
    };

    // Get storage path for images
    let storage_path = db.0.db_path();
    let images_dir = get_images_dir(storage_path);

    // Create images directory if it doesn't exist
    if images_dir.exists() {
        if !images_dir.is_dir() {
            // Remove the file and create directory
            if let Err(e) = std::fs::remove_file(&images_dir) {
                return HttpResponse::InternalServerError().json(ApiErrorResponse {
                    error: format!("Failed to remove conflicting file: {}", e),
                });
            }
        }
    }
    if let Err(e) = std::fs::create_dir_all(&images_dir) {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to create images directory: {}", e),
        });
    }

    // Determine file extension and path
    let extension = get_image_extension(content_type);
    let image_filename = format!("{}.{}", atom_id, extension);
    let image_path = images_dir.join(&image_filename);

    tracing::debug!(
        "upload_atom_image: atom_id={}, content_type={}, images_dir={}, image_path={}",
        atom_id, content_type, images_dir.display(), image_path.display()
    );

    // Delete existing image if present
    if image_path.exists() {
        if let Err(e) = std::fs::remove_file(&image_path) {
            tracing::warn!("Failed to remove existing image: {}", e);
        }
    }

    // Save the image file (blocking I/O in spawn_blocking)
    let image_path_clone = image_path.clone();
    let result = tokio::task::spawn_blocking(move || {
        std::fs::write(&image_path_clone, &body)
    })
    .await;

    if let Err(e) = result {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to save image: {}", e),
        });
    }
    if let Err(e) = result.unwrap() {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to write image file: {}", e),
        });
    }

    // Get tesseract_host from settings
    let settings = match db.0.get_settings().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Failed to get settings for OCR: {}", e);
            // Continue without OCR if settings fail
            let image_path_str = image_path.to_string_lossy().to_string();
            let update_req = UpdateAtomRequest {
                content: existing_content,
                source_url: None,
                published_at: None,
                tag_ids: None,
                image_path: Some(image_path_str.clone()),
                document_path: None,
                document_name: None,
                document_type: None,
                embedded_images: None,
            };
            if let Err(e) = db.0.update_atom(&atom_id, update_req, |_| {}).await {
                return HttpResponse::InternalServerError().json(ApiErrorResponse {
                    error: format!("Failed to update atom: {}", e),
                });
            }
            return HttpResponse::Ok().json(serde_json::json!({
                "image_path": image_path_str,
                "content_type": content_type,
            }));
        }
    };

    let tesseract_host = settings.get("tesseract_host").cloned().unwrap_or_else(|| {
        "http://10.70.0.52:8080".to_string()
    });

    // Run OCR on the image
    let ocr_result = atomic_core::extract_text_from_image(&tesseract_host, &image_path).await;
    let ocr_text = match ocr_result {
        Ok(ocr) => {
            tracing::info!("OCR extracted {} chars from image for atom {}", ocr.text.len(), atom_id);
            ocr.text
        }
        Err(e) => {
            tracing::warn!("OCR failed for atom {}: {}", atom_id, e);
            // Continue without OCR text if OCR fails
            String::new()
        }
    };

    // Combine existing content with OCR text (don't add image reference - it's already in the sidebar)
    let new_content = if ocr_text.is_empty() {
        existing_content
    } else if existing_content.is_empty() {
        format!("[OCR from image]\n{}", ocr_text)
    } else {
        format!("{}\n\n[OCR from image]\n{}", existing_content, ocr_text)
    };

    // Update atom's Image_path and content
    let image_path_str = image_path.to_string_lossy().to_string();
    let update_req = UpdateAtomRequest {
        content: new_content,
        source_url: None,
        published_at: None,
        tag_ids: None,
        image_path: Some(image_path_str.clone()),
        document_path: None,
        document_name: None,
        document_type: None,
        embedded_images: None,
    };

    if let Err(e) = db.0.update_atom(&atom_id, update_req, |_| {}).await {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to update atom: {}", e),
        });
    }

    HttpResponse::Ok().json(serde_json::json!({
        "image_path": image_path_str,
        "content_type": content_type,
        "ocr_text_length": ocr_text.len(),
    }))
}

#[utoipa::path(
    get,
    path = "/api/atoms/{id}/image",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Image file"),
        (status = 404, description = "Atom or image not found"),
    ),
    tag = "atoms",
    security(()),
)]
pub async fn get_atom_image(
    db: Db,
    path: web::Path<String>,
) -> HttpResponse {
    let atom_id = path.into_inner();

    // Get atom to retrieve image_path
    let atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(_) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
    };

    let stored_path = match &atom.atom.image_path {
        Some(p) => p,
        None => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "No image attached to this atom".to_string(),
            });
        }
    };

    // Compute the correct path using the same logic as upload_atom_image
    let storage_path = db.0.db_path();
    let images_dir = get_images_dir(&storage_path);

    tracing::debug!(
        "get_atom_image: atom_id={}, stored_path={}, db_path={}, images_dir={}",
        atom_id, stored_path, storage_path.display(), images_dir.display()
    );

    // Get extension from stored path
    let extension = std::path::Path::new(stored_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");

    let image_filename = format!("{}.{}", atom_id, extension);
    let image_path = images_dir.join(&image_filename);

    tracing::debug!(
        "get_atom_image: extension={}, image_filename={}, image_path={}, exists={}",
        extension, image_filename, image_path.display(), image_path.exists()
    );

    if !image_path.exists() {
        // Try the stored path directly (for backwards compatibility)
        let fallback_path = std::path::Path::new(stored_path);
        if fallback_path.exists() {
            // Read and serve from fallback path
            let body = match tokio::fs::read(fallback_path).await {
                Ok(b) => b,
                Err(e) => {
                    return HttpResponse::InternalServerError().json(ApiErrorResponse {
                        error: format!("Failed to read image: {}", e),
                    });
                }
            };
            let content_type = detect_image_content_type(&body).unwrap_or("application/octet-stream");
            return HttpResponse::Ok()
                .content_type(content_type)
                .body(body);
        }
        return HttpResponse::NotFound().json(ApiErrorResponse {
            error: "Image file not found on disk".to_string(),
        });
    }

    // Read file and determine content type
    let body = match tokio::fs::read(&image_path).await {
        Ok(b) => b,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiErrorResponse {
                error: format!("Failed to read image: {}", e),
            });
        }
    };

    let content_type = detect_image_content_type(&body).unwrap_or("application/octet-stream");

    HttpResponse::Ok()
        .content_type(content_type)
        .body(body)
}

#[utoipa::path(
    delete,
    path = "/api/atoms/{id}/image",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Image deleted successfully"),
        (status = 404, description = "Atom or image not found"),
    ),
    tag = "atoms",
)]
pub async fn delete_atom_image(
    db: Db,
    path: web::Path<String>,
) -> HttpResponse {
    let atom_id = path.into_inner();

    // Get atom to retrieve image_path and document_path
    let atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(_) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
    };

    let storage_path = db.0.db_path();

    // Delete image file if exists
    if let Some(stored_path) = &atom.atom.image_path {
        let images_dir = get_images_dir(&storage_path);
        let extension = std::path::Path::new(stored_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let image_filename = format!("{}.{}", atom_id, extension);
        let image_path = images_dir.join(&image_filename);

        if image_path.exists() {
            if let Err(e) = tokio::fs::remove_file(&image_path).await {
                tracing::warn!("Failed to delete image file: {}", e);
            }
        } else {
            let fallback_path = std::path::Path::new(stored_path);
            if fallback_path.exists() {
                if let Err(e) = tokio::fs::remove_file(fallback_path).await {
                    tracing::warn!("Failed to delete image file: {}", e);
                }
            }
        }
    }

    // Delete document file if exists
    if let Some(doc_path_str) = &atom.atom.document_path {
        let doc_path = std::path::Path::new(doc_path_str);
        if doc_path.exists() {
            if let Err(e) = tokio::fs::remove_file(doc_path).await {
                tracing::warn!("Failed to delete document file: {}", e);
            }
        }
    }

    // Delete embedded images
    for img in &atom.atom.embedded_images {
        let img_path = std::path::Path::new(&img.stored_path);
        if img_path.exists() {
            let _ = tokio::fs::remove_file(img_path).await;
        }
    }

    // Clear ALL attachment fields in atom
    if let Err(e) = db.0.clear_image(&atom_id).await {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to clear attachment fields: {}", e),
        });
    }

    HttpResponse::Ok().json(serde_json::json!({
        "message": "Image deleted successfully",
    }))
}

// ==================== Document Upload/Download ====================

fn get_documents_dir(storage_path: &std::path::Path) -> PathBuf {
    storage_path.parent().unwrap_or(storage_path).join("documents")
}

fn detect_document_content_type(data: &[u8], filename: &str) -> Option<String> {
    let lower = filename.to_lowercase();

    // Check by extension first
    if lower.ends_with(".docx") {
        return Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string());
    }
    if lower.ends_with(".doc") {
        return Some("application/msword".to_string());
    }
    if lower.ends_with(".xlsx") {
        return Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string());
    }
    if lower.ends_with(".xls") {
        return Some("application/vnd.ms-excel".to_string());
    }
    if lower.ends_with(".pdf") {
        return Some("application/pdf".to_string());
    }
    if lower.ends_with(".txt") {
        return Some("text/plain".to_string());
    }

    // Check magic bytes
    if data.len() >= 4 {
        if data[0] == 0x50 && data[1] == 0x4B {
            // ZIP-based (docx, xlsx)
            if lower.ends_with(".docx") {
                return Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string());
            }
            if lower.ends_with(".xlsx") {
                return Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string());
            }
            // ZIP magic but unknown extension - assume docx by default for Word XML
            return Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string());
        }
        if data[0] == 0x25 && data[1] == 0x50 && data[2] == 0x44 && data[3] == 0x46 {
            return Some("application/pdf".to_string());
        }
        // OLE2 compound document (old Office formats: .doc, .xls, .ppt)
        // Note: These are not supported by our current parsers
        if data[0] == 0xD0 && data[1] == 0xCF {
            // Return None to indicate unsupported format
            return None;
        }
    }

    None
}

fn get_document_extension(content_type: &str) -> &'static str {
    if content_type.contains("wordprocessingml") {
        "docx"
    } else if content_type.contains("msword") {
        "doc"
    } else if content_type.contains("spreadsheetml") {
        "xlsx"
    } else if content_type.contains("excel") {
        "xls"
    } else if content_type.contains("pdf") {
        "pdf"
    } else if content_type.contains("text") {
        "txt"
    } else {
        "bin"
    }
}

#[utoipa::path(
    post,
    path = "/api/atoms/{id}/document",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    request_body = String,
    responses(
        (status = 200, description = "Document uploaded successfully"),
        (status = 400, description = "Unsupported document format"),
        (status = 404, description = "Atom not found"),
    ),
    tag = "atoms",
    security(()),
)]
pub async fn upload_atom_document(
    db: Db,
    path: web::Path<String>,
    body: web::Bytes,
    filename: Option<String>,
) -> HttpResponse {
    let atom_id = path.into_inner();

    // Verify atom exists
    let existing_atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(atom)) => atom,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(e) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: format!("Atom not found: {}", e),
            });
        }
    };
    let existing_content = existing_atom.atom.content.clone();

    // Get filename from header or use default
    let fname = filename.unwrap_or_else(|| "document".to_string());

    // Detect content type
    let content_type = match detect_document_content_type(&body, &fname) {
        Some(ct) => ct,
        None => {
            return HttpResponse::BadRequest().json(ApiErrorResponse {
                error: "Unsupported document format. Supported: Word (.docx), Excel (.xlsx), PDF (.pdf), Text (.txt)".to_string(),
            });
        }
    };

    // Get storage path for documents
    let storage_path = db.0.db_path();
    let documents_dir = get_documents_dir(storage_path);

    // Create documents directory if it doesn't exist
    if !documents_dir.exists() {
        if let Err(e) = std::fs::create_dir_all(&documents_dir) {
            return HttpResponse::InternalServerError().json(ApiErrorResponse {
                error: format!("Failed to create documents directory: {}", e),
            });
        }
    }

    // Determine file extension and path
    let extension = get_document_extension(&content_type);
    let doc_filename = format!("{}.{}", atom_id, extension);
    let doc_path = documents_dir.join(&doc_filename);

    // Store original filename for display/download
    let original_filename = fname.clone();

    tracing::debug!(
        "upload_atom_document: atom_id={}, content_type={}, documents_dir={}, doc_path={}",
        atom_id, content_type, documents_dir.display(), doc_path.display()
    );

    // Delete existing document if present
    if doc_path.exists() {
        if let Err(e) = std::fs::remove_file(&doc_path) {
            tracing::warn!("Failed to remove existing document: {}", e);
        }
    }

    // Save the document file
    let doc_path_clone = doc_path.clone();
    let body_vec = body.to_vec();
    let body_vec_clone = body_vec.clone();
    let result = tokio::task::spawn_blocking(move || {
        std::fs::write(&doc_path_clone, &body_vec_clone)
    })
    .await;

    if let Err(e) = result {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to save document: {}", e),
        });
    }
    if let Err(e) = result.unwrap() {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to write document file: {}", e),
        });
    }

    // Parse document and extract content
    let parse_result = atomic_core::parse_document(&body_vec, atomic_core::DocumentType::from_mime_type(&content_type)).await;

    let (new_content, embedded_images_json) = match parse_result {
        Ok(result) => {
            tracing::info!("Document parsed successfully for atom {}: {} chars, {} images",
                atom_id, result.content.len(), result.images.len());

            // Store embedded images
            let mut stored_images = Vec::new();
            let images_dir = get_images_dir(&storage_path);

            for img in &result.images {
                let img_filename = format!("{}-{}.img", atom_id, img.id);
                let img_path = images_dir.join(&img_filename);

                if let Err(e) = std::fs::write(&img_path, &img.data) {
                    tracing::warn!("Failed to save embedded image {}: {}", img.id, e);
                    continue;
                }

                stored_images.push(atomic_core::EmbeddedImage {
                    id: img.id.clone(),
                    original_ref: img.original_ref.clone(),
                    stored_path: img_path.to_string_lossy().to_string(),
                    content_type: img.content_type.clone(),
                });
            }

            let embedded_json = serde_json::to_string(&stored_images).unwrap_or_default();

            // Convert to Markdown format
            let converter_config = atomic_core::document::ConverterConfig::new();
            let conversion = atomic_core::document::convert(
                result.clone(),
                converter_config,
            );

            // Append to existing content if any
            let final_content = if existing_content.is_empty() {
                conversion.content
            } else {
                format!("{}\n\n---\n\n{}", existing_content, conversion.content)
            };

            (final_content, embedded_json)
        }
        Err(e) => {
            tracing::warn!("Failed to parse document for atom {}: {}", atom_id, e);
            // Keep existing content if parsing fails
            (existing_content.clone(), String::from("[]"))
        }
    };

    // Update atom's document_path and content
    let doc_path_str = doc_path.to_string_lossy().to_string();
    let update_req = UpdateAtomRequest {
        content: new_content,
        source_url: None,
        published_at: None,
        tag_ids: None,
        image_path: None,
        document_path: Some(doc_path_str.clone()),
        document_name: Some(original_filename),
        document_type: Some(content_type.clone()),
        embedded_images: Some(embedded_images_json),
    };

    if let Err(e) = db.0.update_atom(&atom_id, update_req, |_| {}).await {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to update atom: {}", e),
        });
    }

    HttpResponse::Ok().json(serde_json::json!({
        "document_path": doc_path_str,
        "content_type": content_type,
    }))
}

#[utoipa::path(
    get,
    path = "/api/atoms/{id}/document",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Document file"),
        (status = 404, description = "Atom or document not found"),
    ),
    tag = "atoms",
    security(()),
)]
pub async fn get_atom_document(
    db: Db,
    path: web::Path<String>,
) -> HttpResponse {
    let atom_id = path.into_inner();

    let atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(_) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
    };

    let stored_path = match &atom.atom.document_path {
        Some(p) => p,
        None => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "No document attached to this atom".to_string(),
            });
        }
    };

    let doc_path = std::path::Path::new(stored_path);

    if !doc_path.exists() {
        return HttpResponse::NotFound().json(ApiErrorResponse {
            error: "Document file not found on disk".to_string(),
        });
    }

    let body = match tokio::fs::read(doc_path).await {
        Ok(b) => b,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiErrorResponse {
                error: format!("Failed to read document: {}", e),
            });
        }
    };

    let content_type = atom.atom.document_type.clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Use original filename if available, otherwise fall back to atom_id with extension
    let download_filename = atom.atom.document_name.clone()
        .unwrap_or_else(|| {
            let extension = get_document_extension(&content_type);
            format!("{}.{}", atom_id, extension)
        });

    HttpResponse::Ok()
        .content_type(content_type.as_str())
        .insert_header(("Content-Disposition", format!("attachment; filename=\"{}\"", download_filename)))
        .body(body)
}

#[utoipa::path(
    delete,
    path = "/api/atoms/{id}/document",
    params(
        ("id" = String, Path, description = "Atom ID"),
    ),
    responses(
        (status = 200, description = "Document deleted successfully"),
        (status = 404, description = "Atom or document not found"),
    ),
    tag = "atoms",
)]
pub async fn delete_atom_document(
    db: Db,
    path: web::Path<String>,
) -> HttpResponse {
    let atom_id = path.into_inner();

    let atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(_) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
    };

    let storage_path = db.0.db_path();

    // Delete document file if exists
    if let Some(stored_path) = &atom.atom.document_path {
        let doc_path = std::path::Path::new(stored_path);
        if doc_path.exists() {
            if let Err(e) = tokio::fs::remove_file(doc_path).await {
                tracing::warn!("Failed to delete document file: {}", e);
            }
        }
    }

    // Delete image file if exists
    if let Some(img_path_str) = &atom.atom.image_path {
        let images_dir = get_images_dir(&storage_path);
        let extension = std::path::Path::new(img_path_str)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");
        let image_filename = format!("{}.{}", atom_id, extension);
        let image_path = images_dir.join(&image_filename);

        if image_path.exists() {
            if let Err(e) = tokio::fs::remove_file(&image_path).await {
                tracing::warn!("Failed to delete image file: {}", e);
            }
        } else {
            let fallback_path = std::path::Path::new(img_path_str);
            if fallback_path.exists() {
                if let Err(e) = tokio::fs::remove_file(fallback_path).await {
                    tracing::warn!("Failed to delete image file: {}", e);
                }
            }
        }
    }

    // Delete embedded images
    for img in &atom.atom.embedded_images {
        let img_path = std::path::Path::new(&img.stored_path);
        if img_path.exists() {
            let _ = tokio::fs::remove_file(img_path).await;
        }
    }

    // Clear ALL attachment fields in atom
    if let Err(e) = db.0.clear_document(&atom_id).await {
        return HttpResponse::InternalServerError().json(ApiErrorResponse {
            error: format!("Failed to clear attachment fields: {}", e),
        });
    }

    HttpResponse::Ok().json(serde_json::json!({
        "message": "Document deleted successfully",
    }))
}

#[derive(serde::Deserialize)]
pub struct EmbeddedImagePath {
    pub id: String,
    #[serde(rename = "imageId")]
    pub image_id: String,
}

#[utoipa::path(
    get,
    path = "/api/atoms/{id}/embedded-images/{imageId}",
    params(
        ("id" = String, Path, description = "Atom ID"),
        ("imageId" = String, Path, description = "Embedded Image ID"),
    ),
    responses(
        (status = 200, description = "Embedded image file"),
        (status = 404, description = "Atom or image not found"),
    ),
    tag = "atoms",
)]
pub async fn get_atom_embedded_image(
    db: Db,
    path: web::Path<EmbeddedImagePath>,
) -> HttpResponse {
    let EmbeddedImagePath { id: atom_id, image_id } = path.into_inner();

    let atom = match db.0.get_atom(&atom_id).await {
        Ok(Some(a)) => a,
        Ok(None) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
        Err(_) => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Atom not found".to_string(),
            });
        }
    };

    // Find the embedded image with matching id
    let embedded_image = match atom.atom.embedded_images.iter().find(|img| img.id == image_id) {
        Some(img) => img,
        None => {
            return HttpResponse::NotFound().json(ApiErrorResponse {
                error: "Embedded image not found".to_string(),
            });
        }
    };

    let img_path = std::path::Path::new(&embedded_image.stored_path);

    if !img_path.exists() {
        return HttpResponse::NotFound().json(ApiErrorResponse {
            error: "Image file not found on disk".to_string(),
        });
    }

    let body = match tokio::fs::read(img_path).await {
        Ok(b) => b,
        Err(e) => {
            return HttpResponse::InternalServerError().json(ApiErrorResponse {
                error: format!("Failed to read image: {}", e),
            });
        }
    };

    HttpResponse::Ok()
        .content_type(embedded_image.content_type.as_str())
        .body(body)
}
