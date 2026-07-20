//! Reverse geocoding proxy for 高德地图 API

use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};

const AMAP_API_KEY: &str = "3f618b106298b99c656b2ed85f72ce23";

#[derive(Debug, Serialize)]
pub struct ReverseGeocodeResponse {
    pub address: String,
}

#[derive(Debug, Deserialize)]
pub struct QueryParams {
    pub lat: f64,
    pub lon: f64,
}

/// GET /api/geocode/reverse?lat=23.0874&lon=113.1802
///
/// Proxies to 高德地图 reverse geocoding API to convert GPS coordinates
/// to a Chinese address string.
pub async fn reverse_geocode(query: web::Query<QueryParams>) -> HttpResponse {
    let lat = query.lat;
    let lon = query.lon;

    // 高德地图 API: location=经度,纬度
    let url = format!(
        "https://restapi.amap.com/v3/geocode/regeo?key={}&location={},{}&extensions=base",
        AMAP_API_KEY, lon, lat
    );

    tracing::info!(url = %url, lat = lat, lon = lon, "Calling 高德 reverse geocoding API");

    let client = reqwest::Client::new();
    match client.get(&url).send().await {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            tracing::info!("高德 API response status: {}, headers: {:?}", status, headers);

            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!("高德 API returned error status: {}, body: {}", status, body);
                return HttpResponse::BadGateway().json(serde_json::json!({
                    "error": "高德 API 请求失败"
                }));
            }

            match resp.json::<serde_json::Value>().await {
                Ok(data) => {
                    tracing::info!("高德 API response: {:?}", data);

                    // 解析高德返回的地址
                    if let Some(regeocode) = data.get("regeocode").and_then(|r| r.as_object()) {
                        let address = extract_address(regeocode);
                        return HttpResponse::Ok().json(ReverseGeocodeResponse { address });
                    }

                    HttpResponse::BadGateway().json(serde_json::json!({
                        "error": "无法解析高德返回数据"
                    }))
                }
                Err(e) => {
                    tracing::error!("Failed to parse 高德 API response: {}", e);
                    HttpResponse::BadGateway().json(serde_json::json!({
                        "error": "解析高德返回数据失败"
                    }))
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to call 高德 API: {}", e);
            HttpResponse::BadGateway().json(serde_json::json!({
                "error": "调用高德 API 失败"
            }))
        }
    }
}

/// 从高德 regeocode 对象中提取中文地址
fn extract_address(regeocode: &serde_json::Map<String, serde_json::Value>) -> String {
    // 优先使用 formatted_address（包含街道、社区等详细信息）
    if let Some(formatted) = regeocode.get("formatted_address").and_then(|v| v.as_str()) {
        if !formatted.is_empty() && formatted != "[]" {
            return formatted.to_string();
        }
    }

    // 降级：使用省市区
    let address_component = regeocode.get("addressComponent").and_then(|ac| ac.as_object());

    let province = address_component
        .and_then(|ac| ac.get("province"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let city = address_component
        .and_then(|ac| ac.get("city"))
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let district = address_component
        .and_then(|ac| ac.get("district"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // 清理空值
    let mut parts: Vec<&str> = Vec::new();
    for s in [province, city, district] {
        if !s.is_empty() && s != "[]" {
            parts.push(s);
        }
    }

    if parts.is_empty() {
        "未知地址".to_string()
    } else {
        parts.join("")
    }
}