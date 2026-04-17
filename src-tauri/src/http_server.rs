use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use std::sync::Mutex;
use std::collections::HashMap;

use crate::{SharedAppState, BrowserContext, PatientInfo, ConsultationResult};

// PMPHAI Token Cache
#[allow(dead_code)]
struct PMPHAITokenCache {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_at: u64,
}

lazy_static::lazy_static! {
    static ref PMPHAI_TOKEN_CACHE: Mutex<PMPHAITokenCache> = Mutex::new(PMPHAITokenCache {
        access_token: None,
        refresh_token: None,
        expires_at: 0,
    });
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationAssistRequest {
    pub action: String,
    #[serde(flatten)]
    pub patient: PatientInfo,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationReferenceItem {
    pub name: String,
    pub code: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationReferenceFeedbackRequest {
    pub consultation_id: String,
    pub request_id: String,
    pub reference_type: Option<String>,
    pub action: Option<String>,
    pub status: String,
    pub message: Option<String>,
    #[serde(default)]
    pub items: Vec<ConsultationReferenceItem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RiskItem {
    pub level: u8,           // 1=红色, 2=橙色, 3=黄色
    pub category: String,    // allergy/chronic/medication/population/vital/other
    pub content: String,     // 显示文本
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PatientRiskData {
    pub id_pi: String,
    pub na_pi: String,
    pub sd_sex_text: String,
    pub age_text: String,

    pub chief_complaint: Option<String>,
    pub history_of_present_illness: Option<String>,
    pub past_medical_history: Option<String>,
    pub diagnosis: Option<String>,
    pub allergy_history: Option<String>,

    #[serde(default)]
    pub risks: Vec<RiskItem>,
}

async fn start_consultation(
    data: web::Json<PatientInfo>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let patient = data.into_inner();
    println!("Received consultation request for patient: {}", patient.na_pi);
    
    // 1. Update State
    {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(patient.clone());
        // Reset result
        let mut result = state.last_result.lock().unwrap();
        *result = None;
    }

    // 2. Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("start-consultation", &patient) {
            eprintln!("Failed to emit event: {}", e);
        } else {
            println!("Event 'start-consultation' emitted successfully to main window");
        }
        
        // Force window to front
        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        println!("Error: Main window not found");
    }

    // 3. Return response
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "consultationId": patient.id_pi 
    }))
}

async fn start_voice_consultation(
    data: Option<web::Json<PatientInfo>>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    println!("Received voice consultation request");

    let patient = data.map(|payload| payload.into_inner());

    if let Some(patient) = patient.as_ref() {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(patient.clone());
        let mut result = state.last_result.lock().unwrap();
        *result = None;
    }

    // Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("start-voice-consultation", &patient) {
             eprintln!("Failed to emit voice event: {}", e);
             return HttpResponse::InternalServerError().json(serde_json::json!({ "error": e.to_string() }));
        }
        // Force window to front
        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        return HttpResponse::InternalServerError().json(serde_json::json!({ "error": "Main window not found" }));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "consultationId": patient
            .as_ref()
            .map(|item| item.id_pi.clone())
            .unwrap_or_default()
    }))
}

async fn start_consultation_assist(
    data: web::Json<ConsultationAssistRequest>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let request = data.into_inner();
    println!(
        "Received consultation session assist request for patient: {}, action: {}",
        request.patient.na_pi, request.action
    );

    {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(request.patient.clone());
        let mut result = state.last_result.lock().unwrap();
        *result = None;
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("start-consultation-session", &request) {
            eprintln!("Failed to emit session event: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "status": "error",
                "message": format!("Failed to emit event: {}", e)
            }));
        }

        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "status": "error",
            "message": "Main window not found"
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "consultationId": request.patient.id_pi,
        "action": request.action
    }))
}

async fn stop_consultation(
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    println!("Received stop consultation request");
    
    // 1. Update State + Write cancelled result for SDK polling
    let consultation_id = {
        let mut current = state.current_consultation.lock().unwrap();
        let id = current.as_ref().map(|p| p.id_pi.clone()).unwrap_or_default();
        *current = None;
        id
    };

    // Write a cancelled result so SDK long-polling can detect the stop
    {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let mut last_result = state.last_result.lock().unwrap();
        *last_result = Some(ConsultationResult {
            status: Some("cancelled".to_string()),
            consultation_id: consultation_id.clone(),
            timestamp,
            record: serde_json::json!({
                "resultType": "cancelled",
                "reason": "Consultation stopped by user"
            }),
        });
    }
    // Notify any waiting long-poll requests
    let _ = state.result_tx.send(());

    // 2. Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("stop-consultation", ()) {
            eprintln!("Failed to emit event: {}", e);
        } else {
            println!("Event 'stop-consultation' emitted successfully to main window");
        }
    } else {
        println!("Error: Main window not found");
    }

    // 3. Return response
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "message": "Consultation stopped"
    }))
}

async fn get_result(
    state: web::Data<SharedAppState>,
) -> impl Responder {
    // 1. Check if result exists immediately
    {
        let result = state.last_result.lock().unwrap();
        if let Some(res) = &*result {
            return HttpResponse::Ok().json(res);
        }
    }

    // 2. Long polling: wait for notification or timeout
    let mut rx = state.result_tx.subscribe();
    let timeout = tokio::time::sleep(std::time::Duration::from_secs(10));

    let final_result = tokio::select! {
        recv_res = rx.recv() => {
            match recv_res {
                Ok(_) => {
                    let result = state.last_result.lock().unwrap();
                    result.clone()
                },
                Err(_) => None,
            }
        }
        _ = timeout => {
            None
        }
    };

    if let Some(res) = final_result {
        let mut val = serde_json::to_value(res).unwrap();
        if let Some(obj) = val.as_object_mut() {
            obj.insert("status".to_string(), serde_json::json!("success"));
        }
        HttpResponse::Ok().json(val)
    } else {
        HttpResponse::Ok().json(serde_json::json!({
            "status": "pending",
            "message": "Consultation result not available",
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64
        }))
    }
}

async fn reference_feedback(
    data: web::Json<ConsultationReferenceFeedbackRequest>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let request = data.into_inner();
    let resolved_reference_type = match (&request.reference_type, &request.action) {
        (Some(reference_type), Some(action)) if reference_type != action => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "status": "error",
                "code": "INVALID_REFERENCE_TYPE",
                "message": "referenceType and action must match when both are provided"
            }));
        }
        (Some(reference_type), _) => reference_type.clone(),
        (_, Some(action)) => action.clone(),
        _ => {
            return HttpResponse::BadRequest().json(serde_json::json!({
                "status": "error",
                "code": "INVALID_REFERENCE_TYPE",
                "message": "referenceType or action is required"
            }));
        }
    };
    println!(
        "Received consultation reference feedback: consultation={}, request={}, referenceType={}, status={}",
        request.consultation_id, request.request_id, resolved_reference_type, request.status
    );

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let feedback_payload = serde_json::json!({
        "consultationId": request.consultation_id,
        "requestId": request.request_id,
        "referenceType": resolved_reference_type,
        "action": resolved_reference_type,
        "status": request.status,
        "message": request.message,
        "items": request.items,
        "timestamp": timestamp
    });

    let base_record_map = {
        let last_result = state.last_result.lock().unwrap();
        let Some(existing_result) = last_result.as_ref() else {
            return HttpResponse::Conflict().json(serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result"
            }));
        };

        if existing_result.consultation_id != request.consultation_id {
            return HttpResponse::Conflict().json(serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result"
            }));
        }

        let Some(record_map) = existing_result.record.as_object().cloned() else {
            return HttpResponse::Conflict().json(serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result"
            }));
        };

        let existing_request_id = record_map
            .get("requestId")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let existing_result_type = record_map
            .get("resultType")
            .and_then(|value| value.as_str())
            .unwrap_or_default();
        let existing_reference_type = record_map
            .get("referenceType")
            .or_else(|| record_map.get("action"))
            .and_then(|value| value.as_str())
            .unwrap_or_default();

        if existing_request_id != request.request_id
            || existing_result_type != "reference-request"
            || existing_reference_type != feedback_payload["referenceType"].as_str().unwrap_or_default()
        {
            return HttpResponse::Conflict().json(serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result"
            }));
        }

        record_map
    };

    let merged_result = {
        let mut last_result = state.last_result.lock().unwrap();
        let mut record_map = base_record_map;

        record_map.insert(
            "resultType".to_string(),
            serde_json::Value::String("reference-feedback".to_string()),
        );
        record_map.insert(
            "requestId".to_string(),
            serde_json::Value::String(
                feedback_payload["requestId"].as_str().unwrap_or_default().to_string(),
            ),
        );
        record_map.insert(
            "referenceType".to_string(),
            serde_json::Value::String(
                feedback_payload["referenceType"].as_str().unwrap_or_default().to_string(),
            ),
        );
        record_map.insert(
            "action".to_string(),
            serde_json::Value::String(
                feedback_payload["action"].as_str().unwrap_or_default().to_string(),
            ),
        );
        record_map.insert(
            "referenceStatus".to_string(),
            serde_json::Value::String(
                feedback_payload["status"].as_str().unwrap_or_default().to_string(),
            ),
        );
        if !feedback_payload["items"].is_null() {
            record_map.insert(
                "referenceItems".to_string(),
                feedback_payload["items"].clone(),
            );
        }
        if let Some(message) = feedback_payload["message"].as_str() {
            record_map.insert(
                "referenceMessage".to_string(),
                serde_json::Value::String(message.to_string()),
            );
        } else {
            record_map.remove("referenceMessage");
        }

        let result = ConsultationResult {
            status: Some("success".to_string()),
            consultation_id: feedback_payload["consultationId"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            timestamp,
            record: serde_json::Value::Object(record_map),
        };
        *last_result = Some(result.clone());
        result
    };
    let _ = state.result_tx.send(());

    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("consultation-reference-feedback", &feedback_payload) {
            eprintln!("Failed to emit reference feedback event: {}", e);
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "consultationId": merged_result.consultation_id,
        "requestId": feedback_payload["requestId"],
        "referenceType": feedback_payload["referenceType"],
        "timestamp": timestamp
    }))
}

async fn show_patient_risks(
    data: web::Json<PatientRiskData>,
    app_handle: web::Data<tauri::AppHandle>,
) -> impl Responder {
    let risk_data = data.into_inner();
    println!("Received patient risk analysis request for: {}", risk_data.na_pi);

    // Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("show-patient-risks", &risk_data) {
            eprintln!("Failed to emit risk event: {}", e);
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "status": "error",
                "message": format!("Failed to emit event: {}", e)
            }));
        } else {
            println!("Event 'show-patient-risks' emitted successfully");
        }
        
        // Force window to front
        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        println!("Error: Main window not found");
        return HttpResponse::InternalServerError().json(serde_json::json!({
            "status": "error",
            "message": "Main window not found"
        }));
    }

    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "idPi": risk_data.id_pi
    }))
}

async fn handshake(
    data: web::Json<BrowserContext>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let ctx = data.into_inner();
    println!(
        "[Handshake] SDK connected from origin={}, sdk_version={}",
        ctx.origin, ctx.sdk_version
    );

    // Store browser context in shared state
    {
        let mut browser_ctx = state.browser_context.lock().unwrap();
        *browser_ctx = Some(ctx.clone());
    }

    // Emit event to frontend so it knows HIS SDK is connected
    if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.emit("sdk-handshake", &ctx);
    }

    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }))
}

// ==================== PMPHAI API Proxy ====================

const PMPHAI_TOKEN_URL: &str = "https://inside.pmphai.com/oauth2/access_token";
const PMPHAI_API_BASE_URL: &str = "https://inside.pmphai.com/gateway/cloud/cloudapi/rest/json";
const PMPHAI_API_STANDARD_URL: &str = "https://inside.pmphai.com/gateway/cloud/cloudapi/rest";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PMPHAITokenRequest {
    app_key: String,
    app_secret: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PMPHAISearchRequest {
    token: String,
    query: String,
    #[serde(rename = "type")]
    search_type: Option<i32>,
    limit: Option<i32>,
    score: Option<f64>,
    enable_abstract: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PMPHAIClipRequest {
    token: String,
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PMPHAIListRequest {
    token: String,
    key: Option<String>,
    kg_base_id: Option<String>,
    kg_base_name: Option<String>,
    tag_id: Option<String>,
    tag_name: Option<String>,
    page_size: Option<i32>,
    page: Option<i32>,
    sort_field: Option<String>,
    sort_rule: Option<String>,
}

fn generate_pmphai_sign(params: &HashMap<String, String>, app_secret: &str, app_key: &str) -> String {
    use md5::{Md5, Digest};

    // Sort parameters by key
    let mut sorted_keys: Vec<&String> = params.keys().collect();
    sorted_keys.sort();

    // Build param string
    let param_str: String = sorted_keys
        .iter()
        .map(|k| format!("{}={}", k, params.get(*k).unwrap_or(&String::new())))
        .collect::<Vec<_>>()
        .join("&");

    // Sign = MD5(param_str + app_secret + app_key)
    let sign_string = format!("{}{}{}", param_str, app_secret, app_key);

    let mut hasher = Md5::new();
    hasher.update(sign_string.as_bytes());
    format!("{:x}", hasher.finalize())
}

async fn pmphai_get_token(data: web::Json<PMPHAITokenRequest>) -> impl Responder {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let mut params = HashMap::new();
    params.insert("app_key".to_string(), data.app_key.clone());
    params.insert("grant_type".to_string(), "access_token".to_string());
    params.insert("timestamp".to_string(), timestamp.to_string());

    let sign = generate_pmphai_sign(&params, &data.app_secret, &data.app_key);
    params.insert("sign".to_string(), sign);

    let client = reqwest::Client::new();
    match client.post(PMPHAI_TOKEN_URL)
        .form(&params)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(json) => HttpResponse::Ok().json(json),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to parse response: {}", e)
                }))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "message": format!("Request failed: {}", e)
        }))
    }
}

async fn pmphai_search(data: web::Json<PMPHAISearchRequest>) -> impl Responder {
    let url = format!("{}?token={}&method=aiKnowledge", PMPHAI_API_BASE_URL, data.token);

    let mut body = serde_json::json!({
        "query": data.query,
        "type": data.search_type.unwrap_or(1),
        "limit": data.limit.unwrap_or(5)
    });

    if let Some(score) = data.score {
        if score > 0.0 {
            body["score"] = serde_json::json!(score);
        }
    }
    if let Some(enable_abstract) = data.enable_abstract {
        body["enableAbstract"] = serde_json::json!(enable_abstract);
    }

    let client = reqwest::Client::new();
    match client.post(&url)
        .json(&body)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(json) => HttpResponse::Ok().json(json),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to parse response: {}", e)
                }))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "message": format!("Request failed: {}", e)
        }))
    }
}

async fn pmphai_get_clip(data: web::Json<PMPHAIClipRequest>) -> impl Responder {
    let url = format!("{}?token={}&method=aiKnowledgeClip", PMPHAI_API_BASE_URL, data.token);

    let body = serde_json::json!({ "id": data.id });

    let client = reqwest::Client::new();
    match client.post(&url)
        .json(&body)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(json) => HttpResponse::Ok().json(json),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to parse response: {}", e)
                }))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "message": format!("Request failed: {}", e)
        }))
    }
}

// Page API request - for generating signed page URL
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PMPHAIPageUrlRequest {
    app_key: String,
    app_secret: String,
    page_name: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    kg_base_id: Option<String>,
    #[serde(default)]
    content_id: Option<String>,
    #[serde(default)]
    origin_url: Option<String>,
}

async fn pmphai_generate_page_url(data: web::Json<PMPHAIPageUrlRequest>) -> impl Responder {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    // Build redirect_url
    let mut redirect_url = String::from("https://inside.pmphai.com/gateway/cloud/pageapi/rest?");
    let mut redirect_params = vec![format!("pageName={}", data.page_name)];

    if let Some(ref kg_base_id) = data.kg_base_id {
        redirect_params.push(format!("kgBaseId={}", kg_base_id));
    }
    if let Some(ref id) = data.id {
        redirect_params.push(format!("id={}", id));
    }
    if let Some(ref content_id) = data.content_id {
        redirect_params.push(format!("contentId={}", content_id));
    }
    redirect_url.push_str(&redirect_params.join("&"));

    let final_origin_url = data.origin_url.clone().unwrap_or_else(|| "https://www.pmphai.com".to_string());

    // URL encode the parameters using percent-encoding
    fn percent_encode(s: &str) -> String {
        let mut result = String::new();
        for c in s.chars() {
            match c {
                'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => result.push(c),
                _ => {
                    for byte in c.to_string().as_bytes() {
                        result.push_str(&format!("%{:02X}", byte));
                    }
                }
            }
        }
        result
    }

    let encoded_redirect_url = percent_encode(&redirect_url);
    let encoded_origin_url = percent_encode(&final_origin_url);

    // Build sign params
    let mut sign_params = HashMap::new();
    sign_params.insert("app_key".to_string(), data.app_key.clone());
    sign_params.insert("grant_type".to_string(), "page_token".to_string());
    sign_params.insert("origin_url".to_string(), encoded_origin_url.to_string());
    sign_params.insert("redirect_url".to_string(), encoded_redirect_url.to_string());
    sign_params.insert("timestamp".to_string(), timestamp.to_string());

    let sign = generate_pmphai_sign(&sign_params, &data.app_secret, &data.app_key);

    // Build final authorization URL
    let auth_url = format!(
        "https://inside.pmphai.com/aip/oauth/authorize?app_key={}&grant_type=page_token&timestamp={}&sign={}&redirect_url={}&origin_url={}",
        data.app_key, timestamp, sign, encoded_redirect_url, encoded_origin_url
    );

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "data": {
            "url": auth_url,
            "redirectUrl": redirect_url,
            "sign": sign,
            "timestamp": timestamp
        }
    }))
}

async fn pmphai_list_search(data: web::Json<PMPHAIListRequest>) -> impl Responder {
    let url = format!("{}?token={}", PMPHAI_API_STANDARD_URL, data.token);

    let mut form_params = vec![("method", "list".to_string())];
    form_params.push(("pageSize", data.page_size.unwrap_or(10).to_string()));
    form_params.push(("page", data.page.unwrap_or(1).to_string()));

    if let Some(ref key) = data.key { form_params.push(("key", key.clone())); }
    if let Some(ref kg_base_id) = data.kg_base_id { form_params.push(("kgBaseId", kg_base_id.clone())); }
    if let Some(ref kg_base_name) = data.kg_base_name { form_params.push(("kgBaseName", kg_base_name.clone())); }
    if let Some(ref tag_id) = data.tag_id { form_params.push(("tagId", tag_id.clone())); }
    if let Some(ref tag_name) = data.tag_name { form_params.push(("tagName", tag_name.clone())); }
    if let Some(ref sort_field) = data.sort_field { form_params.push(("sortField", sort_field.clone())); }
    if let Some(ref sort_rule) = data.sort_rule { form_params.push(("sortRule", sort_rule.clone())); }

    let client = reqwest::Client::new();
    match client.post(&url)
        .form(&form_params)
        .send()
        .await
    {
        Ok(response) => {
            match response.json::<serde_json::Value>().await {
                Ok(json) => HttpResponse::Ok().json(json),
                Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to parse response: {}", e)
                }))
            }
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "success": false,
            "message": format!("Request failed: {}", e)
        }))
    }
}

pub fn run_server(app_handle: tauri::AppHandle, state: SharedAppState) {
    std::thread::spawn(move || {
        let sys = actix_web::rt::System::new();
        sys.block_on(async move {
            let app_handle = web::Data::new(app_handle);
            let state = web::Data::new(state);

            println!("Starting HTTP server on 127.0.0.1:8081");

            HttpServer::new(move || {
                let cors = Cors::permissive();

                App::new()
                    .wrap(cors)
                    .app_data(app_handle.clone())
                    .app_data(state.clone())
                    .route("/api/handshake", web::post().to(handshake))
                    .route("/api/consultation/start", web::post().to(start_consultation))
                    .route("/api/consultation/assist", web::post().to(start_consultation_assist))
                    .route("/api/consultation/start-voice", web::post().to(start_voice_consultation))
                    .route("/api/consultation/stop", web::post().to(stop_consultation))
                    .route("/api/consultation/reference-feedback", web::post().to(reference_feedback))
                    .route("/api/consultation/result", web::get().to(get_result))
                    .route("/api/patient/risks", web::post().to(show_patient_risks))
                    // PMPHAI API Proxy
                    .route("/api/pmphai/token", web::post().to(pmphai_get_token))
                    .route("/api/pmphai/search", web::post().to(pmphai_search))
                    .route("/api/pmphai/clip", web::post().to(pmphai_get_clip))
                    .route("/api/pmphai/list", web::post().to(pmphai_list_search))
                    .route("/api/pmphai/page-url", web::post().to(pmphai_generate_page_url))
            })
            .bind(("127.0.0.1", 8081))
            .expect("Failed to bind port 8081")
            .run()
            .await
            .unwrap_or_else(|e| eprintln!("HTTP server error: {}", e));
        });
    });
}
