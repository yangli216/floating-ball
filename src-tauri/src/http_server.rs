use actix_cors::Cors;
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io;
use std::sync::Mutex;
use std::time::Instant;
use tauri::{Emitter, Manager};

use crate::{
    append_consultation_event, clear_consultation_events,
    commands::his_integration_log::{self, HisIntegrationLogInput},
    validate_browser_context, BrowserContext, ConsultationResult, PatientInfo, SharedAppState,
};

fn summarize_for_his_log<T: Serialize>(value: &T) -> serde_json::Value {
    serde_json::to_value(value)
        .map(his_integration_log::sanitize_for_log)
        .unwrap_or_else(|_| serde_json::Value::Null)
}

#[allow(clippy::too_many_arguments)]
fn record_bridge_log(
    app_handle: &web::Data<tauri::AppHandle>,
    trace_id: &str,
    operation: &str,
    method: &str,
    path: &str,
    status: &str,
    http_status: u16,
    started_at: Instant,
    request_summary: Option<serde_json::Value>,
    response_summary: Option<serde_json::Value>,
    patient_id: Option<String>,
    consultation_id: Option<String>,
    request_id: Option<String>,
    error_message: Option<String>,
) {
    let _ = his_integration_log::record_log_entry(
        app_handle.get_ref(),
        HisIntegrationLogInput {
            trace_id: Some(trace_id.to_string()),
            direction: "inbound".to_string(),
            operation: operation.to_string(),
            method: method.to_string(),
            path: path.to_string(),
            url: None,
            status: status.to_string(),
            http_status: Some(http_status),
            business_code: None,
            business_message: error_message.clone(),
            duration_ms: Some(started_at.elapsed().as_millis() as u64),
            request_summary,
            response_summary,
            patient_id,
            consultation_id,
            request_id,
            error_message,
        },
    );
}

fn ensure_http_service_access(state: &web::Data<SharedAppState>) -> Result<(), HttpResponse> {
    let browser_context = state.browser_context.lock().unwrap();
    let Some(ctx) = browser_context.as_ref() else {
        return Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "status": "error",
            "message": "桌面应用服务调用被拒绝：尚未完成 SDK 授权握手"
        })));
    };

    if let Err(message) = validate_browser_context(ctx) {
        return Err(HttpResponse::Unauthorized().json(serde_json::json!({
            "status": "error",
            "message": message
        })));
    }

    Ok(())
}

fn bridge_user_error(message: &str, trace_id: &str) -> serde_json::Value {
    serde_json::json!({
        "status": "error",
        "message": message,
        "traceId": trace_id
    })
}

fn bridge_dispatch_error(trace_id: &str) -> serde_json::Value {
    bridge_user_error(
        "桌面端暂时无法处理该请求，请确认 MedHermes 主窗口已启动后重试",
        trace_id,
    )
}

fn bridge_window_missing_error(trace_id: &str) -> serde_json::Value {
    bridge_user_error(
        "桌面端主窗口暂不可用，请确认 MedHermes 正常运行后重试",
        trace_id,
    )
}

fn pmphai_parse_error() -> serde_json::Value {
    serde_json::json!({
        "success": false,
        "message": "知识库服务返回内容格式异常，请稍后重试"
    })
}

fn pmphai_request_error() -> serde_json::Value {
    serde_json::json!({
        "success": false,
        "message": "知识库服务暂时无法连接，请检查网络或知识库配置后重试"
    })
}

fn is_normal_websocket_disconnect(error: &actix_ws::ProtocolError) -> bool {
    match error {
        actix_ws::ProtocolError::Io(err) => {
            err.kind() == io::ErrorKind::UnexpectedEof
                || err
                    .to_string()
                    .contains("payload reached EOF before completing")
        }
        _ => false,
    }
}

fn derive_result_state(
    result: &ConsultationResult,
    payload: &serde_json::Map<String, serde_json::Value>,
) -> &'static str {
    let result_type = payload
        .get("resultType")
        .and_then(|value| value.as_str())
        .unwrap_or_default();

    if result.status.as_deref() == Some("cancelled") || result_type == "cancelled" {
        return "cancelled";
    }

    "ready"
}

fn is_terminal_result(result_type: &str, reference_status: Option<&str>, state: &str) -> bool {
    if state == "pending" {
        return false;
    }

    if state == "cancelled" {
        return true;
    }

    match result_type {
        "reference-request" => false,
        "record-confirmed" => reference_status != Some("pending"),
        _ => true,
    }
}

fn build_consultation_event(result: &ConsultationResult) -> serde_json::Value {
    let payload_map = match &result.record {
        serde_json::Value::Object(map) => map.clone(),
        other => {
            let mut fallback = serde_json::Map::new();
            fallback.insert("value".to_string(), other.clone());
            fallback
        }
    };

    let result_type = payload_map
        .get("resultType")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let reference_status = payload_map
        .get("referenceStatus")
        .and_then(|value| value.as_str());
    let state = derive_result_state(result, &payload_map);
    let terminal = is_terminal_result(&result_type, reference_status, state);
    let request_id = payload_map
        .get("requestId")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let event_id = format!(
        "{}:{}:{}:{}",
        result.consultation_id,
        if request_id.is_empty() {
            "-"
        } else {
            request_id
        },
        if result_type.is_empty() {
            "-"
        } else {
            &result_type
        },
        result.timestamp
    );

    serde_json::json!({
        "id": event_id,
        "type": if result_type.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(result_type) },
        "consultationId": result.consultation_id,
        "requestId": if request_id.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(request_id.to_string()) },
        "timestamp": result.timestamp,
        "terminal": terminal,
        "payload": payload_map,
    })
}

fn current_event_id(result: &ConsultationResult) -> String {
    let payload_map = match &result.record {
        serde_json::Value::Object(map) => map,
        _ => return format!("{}:-:-:{}", result.consultation_id, result.timestamp),
    };

    let result_type = payload_map
        .get("resultType")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let request_id = payload_map
        .get("requestId")
        .and_then(|value| value.as_str())
        .unwrap_or_default();

    format!(
        "{}:{}:{}:{}",
        result.consultation_id,
        if request_id.is_empty() {
            "-"
        } else {
            request_id
        },
        if result_type.is_empty() {
            "-"
        } else {
            result_type
        },
        result.timestamp
    )
}

fn parse_after_event_id(req: &HttpRequest) -> Option<String> {
    web::Query::<HashMap<String, String>>::from_query(req.query_string())
        .ok()
        .and_then(|query| query.get("after").cloned())
        .filter(|value| !value.trim().is_empty())
}

fn queued_events_after(
    state: &SharedAppState,
    after_event_id: Option<&str>,
    include_latest_without_cursor: bool,
) -> Vec<ConsultationResult> {
    let Ok(event_queue) = state.event_queue.lock() else {
        return Vec::new();
    };

    if event_queue.is_empty() {
        return Vec::new();
    }

    if let Some(after_event_id) = after_event_id.filter(|value| !value.trim().is_empty()) {
        if let Some(index) = event_queue
            .iter()
            .position(|result| current_event_id(result) == after_event_id)
        {
            return event_queue.iter().skip(index + 1).cloned().collect();
        }

        return event_queue.iter().cloned().collect();
    }

    if include_latest_without_cursor {
        return event_queue.back().cloned().into_iter().collect::<Vec<_>>();
    }

    Vec::new()
}

fn next_queued_event_after(
    state: &SharedAppState,
    after_event_id: Option<&str>,
) -> Option<ConsultationResult> {
    queued_events_after(state, after_event_id, true)
        .into_iter()
        .next()
}

fn build_event_poll_response(result: &ConsultationResult, trace_id: &str) -> serde_json::Value {
    let event = build_consultation_event(result);
    let payload = event
        .get("payload")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();
    let state = derive_result_state(result, &payload);

    serde_json::json!({
        "state": state,
        "traceId": trace_id,
        "event": event,
    })
}

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

#[derive(Debug, Deserialize, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReportInterpretationPatientInput {
    #[serde(default, alias = "patientId")]
    pub id_pi: Option<String>,
    #[serde(default, alias = "visitId")]
    pub id_vis: Option<String>,
    #[serde(default, alias = "name")]
    pub na_pi: Option<String>,
    #[serde(default, alias = "gender")]
    pub sd_sex_text: Option<String>,
    #[serde(default, alias = "age")]
    pub age_text: Option<String>,
    #[serde(default)]
    pub chief_complaint: Option<String>,
    #[serde(default)]
    pub history_of_present_illness: Option<String>,
    #[serde(default)]
    pub past_medical_history: Option<String>,
    #[serde(default)]
    pub allergy_history: Option<String>,
    #[serde(default)]
    pub diagnosis: Option<String>,
    #[serde(default, flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReportInterpretationRequest {
    pub task_id: String,
    pub query: String,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub patient: Option<ReportInterpretationPatientInput>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InpatientEmrGenerationRequest {
    pub admission_id: String,
    pub template_id: String,
    pub html_content: String,
    #[serde(default)]
    pub template_name: Option<String>,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub patient: Option<ReportInterpretationPatientInput>,
    #[serde(default, flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
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
    pub level: u8,        // 1=红色, 2=橙色, 3=黄色
    pub category: String, // allergy/chronic/medication/population/vital/other
    pub content: String,  // 显示文本
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PatientRiskData {
    #[serde(alias = "patientId")]
    pub id_pi: String,
    #[serde(default, alias = "visitId")]
    pub id_vis: Option<String>,
    #[serde(default, alias = "name")]
    pub na_pi: String,
    #[serde(default, alias = "gender")]
    pub sd_sex_text: String,
    #[serde(default, alias = "age")]
    pub age_text: String,

    pub chief_complaint: Option<String>,
    pub history_of_present_illness: Option<String>,
    pub past_medical_history: Option<String>,
    pub diagnosis: Option<String>,
    pub allergy_history: Option<String>,

    #[serde(default)]
    pub risks: Vec<RiskItem>,

    /// 保留未显式建模的患者扩展字段，继续透传给前端标准化层。
    #[serde(default, flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

async fn receive_patient(
    data: web::Json<PatientInfo>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let patient = data.into_inner();
    let request_summary = summarize_for_his_log(&patient);
    println!(
        "Received patient reception request for patient ID: {}",
        patient.id_pi
    );

    {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(patient.clone());
    }
    if let Err(error) = clear_consultation_events(state.get_ref()) {
        eprintln!("Failed to clear consultation events: {}", error);
    }

    // Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("receive-patient", &patient) {
            eprintln!("Failed to emit event: {}", e);
        } else {
            println!("Event 'receive-patient' emitted successfully to main window");
        }
    } else {
        println!("Error: Main window not found");
    }

    // Return response
    let response_body = serde_json::json!({
        "status": "success",
        "consultationId": patient.id_pi,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "consultation.receive",
        "POST",
        "/api/consultation/receive",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        Some(patient.id_pi.clone()),
        Some(patient.id_pi.clone()),
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn start_consultation(
    data: web::Json<PatientInfo>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let patient = data.into_inner();
    let request_summary = summarize_for_his_log(&patient);
    let patient_label = if patient.na_pi.trim().is_empty() {
        patient.id_pi.as_str()
    } else {
        patient.na_pi.as_str()
    };
    println!(
        "Received consultation request for patient: {}",
        patient_label
    );

    // 1. Update State
    {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(patient.clone());
    }
    if let Err(error) = clear_consultation_events(state.get_ref()) {
        eprintln!("Failed to clear consultation events: {}", error);
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
    let response_body = serde_json::json!({
        "status": "success",
        "consultationId": patient.id_pi,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "consultation.start",
        "POST",
        "/api/consultation/start",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        Some(patient.id_pi.clone()),
        Some(patient.id_pi.clone()),
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn start_voice_consultation(
    data: Option<web::Json<PatientInfo>>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    println!("Received voice consultation request");

    let patient = data.map(|payload| payload.into_inner());
    let request_summary = summarize_for_his_log(&patient);

    if let Err(error) = clear_consultation_events(state.get_ref()) {
        eprintln!("Failed to clear consultation events: {}", error);
    }

    if let Some(patient) = patient.as_ref() {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(patient.clone());
    }

    // Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("start-voice-consultation", &patient) {
            eprintln!("Failed to emit voice event: {}", e);
            let response_body = bridge_dispatch_error(&trace_id);
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.startVoice",
                "POST",
                "/api/consultation/start-voice",
                "error",
                500,
                started_at,
                Some(request_summary),
                Some(response_body.clone()),
                patient.as_ref().map(|item| item.id_pi.clone()),
                patient.as_ref().map(|item| item.id_pi.clone()),
                None,
                Some(e.to_string()),
            );
            return HttpResponse::InternalServerError().json(response_body);
        }
        // Force window to front
        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        let response_body = bridge_window_missing_error(&trace_id);
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "consultation.startVoice",
            "POST",
            "/api/consultation/start-voice",
            "error",
            500,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            patient.as_ref().map(|item| item.id_pi.clone()),
            patient.as_ref().map(|item| item.id_pi.clone()),
            None,
            Some("Main window not found".to_string()),
        );
        return HttpResponse::InternalServerError().json(response_body);
    }

    let consultation_id = patient
        .as_ref()
        .map(|item| item.id_pi.clone())
        .unwrap_or_default();
    let response_body = serde_json::json!({
        "status": "success",
        "consultationId": consultation_id,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "consultation.startVoice",
        "POST",
        "/api/consultation/start-voice",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        patient.as_ref().map(|item| item.id_pi.clone()),
        Some(consultation_id),
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn start_consultation_assist(
    data: web::Json<ConsultationAssistRequest>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let request = data.into_inner();
    let request_summary = summarize_for_his_log(&request);
    let patient_label = if request.patient.na_pi.trim().is_empty() {
        request.patient.id_pi.as_str()
    } else {
        request.patient.na_pi.as_str()
    };
    println!(
        "Received consultation session assist request for patient: {}, action: {}",
        patient_label, request.action
    );

    {
        let mut current = state.current_consultation.lock().unwrap();
        *current = Some(request.patient.clone());
    }
    if let Err(error) = clear_consultation_events(state.get_ref()) {
        eprintln!("Failed to clear consultation events: {}", error);
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("start-consultation-session", &request) {
            eprintln!("Failed to emit session event: {}", e);
            let response_body = bridge_dispatch_error(&trace_id);
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.assist",
                "POST",
                "/api/consultation/assist",
                "error",
                500,
                started_at,
                Some(request_summary),
                Some(response_body.clone()),
                Some(request.patient.id_pi.clone()),
                Some(request.patient.id_pi.clone()),
                None,
                Some(e.to_string()),
            );
            return HttpResponse::InternalServerError().json(response_body);
        }

        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        let response_body = bridge_window_missing_error(&trace_id);
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "consultation.assist",
            "POST",
            "/api/consultation/assist",
            "error",
            500,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            Some(request.patient.id_pi.clone()),
            Some(request.patient.id_pi.clone()),
            None,
            Some("Main window not found".to_string()),
        );
        return HttpResponse::InternalServerError().json(response_body);
    }

    let response_body = serde_json::json!({
        "status": "success",
        "consultationId": request.patient.id_pi,
        "action": request.action,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "consultation.assist",
        "POST",
        "/api/consultation/assist",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        Some(request.patient.id_pi.clone()),
        Some(request.patient.id_pi.clone()),
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn start_report_interpretation(
    data: web::Json<ReportInterpretationRequest>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let request = data.into_inner();
    let request_summary = summarize_for_his_log(&request);
    let task_id = request.task_id.trim().to_string();
    let query = request.query.trim().to_string();

    if task_id != "inspectReport" && task_id != "checkReport" {
        let response_body = serde_json::json!({
            "status": "error",
            "message": "taskId 仅支持 inspectReport 或 checkReport",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "report.interpret",
            "POST",
            "/api/report/interpret",
            "error",
            400,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            None,
            request.request_id.clone(),
            Some("taskId 仅支持 inspectReport 或 checkReport".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if query.is_empty() {
        let response_body = serde_json::json!({
            "status": "error",
            "message": "query 不能为空",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "report.interpret",
            "POST",
            "/api/report/interpret",
            "error",
            400,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            None,
            request.request_id.clone(),
            Some("query 不能为空".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(error) = window.emit("start-report-interpretation", &request) {
            let response_body = bridge_dispatch_error(&trace_id);
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "report.interpret",
                "POST",
                "/api/report/interpret",
                "error",
                500,
                started_at,
                Some(request_summary),
                Some(response_body.clone()),
                request.patient.as_ref().and_then(|item| item.id_pi.clone()),
                None,
                request.request_id.clone(),
                Some(error.to_string()),
            );
            return HttpResponse::InternalServerError().json(response_body);
        }

        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        let response_body = bridge_window_missing_error(&trace_id);
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "report.interpret",
            "POST",
            "/api/report/interpret",
            "error",
            500,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            None,
            request.request_id.clone(),
            Some("Main window not found".to_string()),
        );
        return HttpResponse::InternalServerError().json(response_body);
    }

    let response_body = serde_json::json!({
        "status": "success",
        "taskId": task_id,
        "traceId": trace_id,
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "report.interpret",
        "POST",
        "/api/report/interpret",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        request.patient.as_ref().and_then(|item| item.id_pi.clone()),
        None,
        request.request_id.clone(),
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn start_inpatient_emr_generation(
    data: web::Json<InpatientEmrGenerationRequest>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let mut request = data.into_inner();
    let request_summary = summarize_for_his_log(&request);
    request.admission_id = request.admission_id.trim().to_string();
    request.template_id = request.template_id.trim().to_string();
    request.html_content = request.html_content.trim().to_string();
    request.template_name = request
        .template_name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if request.request_id.as_deref().unwrap_or_default().trim().is_empty() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        request.request_id = Some(format!("inpatient-emr-{}", timestamp));
    }

    if request.admission_id.is_empty() {
        let response_body = serde_json::json!({
            "status": "error",
            "message": "admissionId 不能为空",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "inpatientEmr.generate",
            "POST",
            "/api/inpatient/emr/generate",
            "error",
            400,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            Some(request.admission_id.clone()),
            request.request_id.clone(),
            Some("admissionId 不能为空".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if request.template_id.is_empty() {
        let response_body = serde_json::json!({
            "status": "error",
            "message": "templateId 不能为空",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "inpatientEmr.generate",
            "POST",
            "/api/inpatient/emr/generate",
            "error",
            400,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            Some(request.admission_id.clone()),
            request.request_id.clone(),
            Some("templateId 不能为空".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if request.template_name.is_none() {
        let response_body = serde_json::json!({
            "status": "error",
            "message": "templateName 不能为空",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "inpatientEmr.generate",
            "POST",
            "/api/inpatient/emr/generate",
            "error",
            400,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            Some(request.admission_id.clone()),
            request.request_id.clone(),
            Some("templateName 不能为空".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if request.html_content.is_empty() {
        let response_body = serde_json::json!({
            "status": "error",
            "message": "htmlContent 不能为空",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "inpatientEmr.generate",
            "POST",
            "/api/inpatient/emr/generate",
            "error",
            400,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            Some(request.admission_id.clone()),
            request.request_id.clone(),
            Some("htmlContent 不能为空".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(error) = window.emit("start-inpatient-emr-generation", &request) {
            let response_body = bridge_dispatch_error(&trace_id);
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "inpatientEmr.generate",
                "POST",
                "/api/inpatient/emr/generate",
                "error",
                500,
                started_at,
                Some(request_summary),
                Some(response_body.clone()),
                request.patient.as_ref().and_then(|item| item.id_pi.clone()),
                Some(request.admission_id.clone()),
                request.request_id.clone(),
                Some(error.to_string()),
            );
            return HttpResponse::InternalServerError().json(response_body);
        }

        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        let response_body = bridge_window_missing_error(&trace_id);
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "inpatientEmr.generate",
            "POST",
            "/api/inpatient/emr/generate",
            "error",
            500,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            request.patient.as_ref().and_then(|item| item.id_pi.clone()),
            Some(request.admission_id.clone()),
            request.request_id.clone(),
            Some("Main window not found".to_string()),
        );
        return HttpResponse::InternalServerError().json(response_body);
    }

    let response_body = serde_json::json!({
        "status": "success",
        "admissionId": request.admission_id,
        "requestId": request.request_id,
        "traceId": trace_id,
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "inpatientEmr.generate",
        "POST",
        "/api/inpatient/emr/generate",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        request.patient.as_ref().and_then(|item| item.id_pi.clone()),
        Some(request.admission_id.clone()),
        request.request_id.clone(),
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn stop_consultation(
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    println!("Received stop consultation request");

    // 1. Update State + Write cancelled result for SDK polling
    let consultation_id = {
        let mut current = state.current_consultation.lock().unwrap();
        let id = current
            .as_ref()
            .map(|p| p.id_pi.clone())
            .unwrap_or_default();
        *current = None;
        id
    };

    // Write a cancelled result so SDK long-polling can detect the stop
    {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        if let Err(error) = append_consultation_event(
            state.get_ref(),
            ConsultationResult {
                status: Some("cancelled".to_string()),
                consultation_id: consultation_id.clone(),
                timestamp,
                record: serde_json::json!({
                    "resultType": "cancelled",
                    "reason": "Consultation stopped by user"
                }),
            },
        ) {
            eprintln!("Failed to append cancelled consultation event: {}", error);
        }
    }

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
    let response_body = serde_json::json!({
        "status": "success",
        "message": "Consultation stopped",
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "consultation.stop",
        "POST",
        "/api/consultation/stop",
        "success",
        200,
        started_at,
        None,
        Some(response_body.clone()),
        None,
        Some(consultation_id),
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn poll_consultation_event(
    req: HttpRequest,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let after_event_id = parse_after_event_id(&req);

    // 1. Check if a queued event exists immediately
    if let Some(res) = next_queued_event_after(state.get_ref(), after_event_id.as_deref()) {
        let response_body = build_event_poll_response(&res, &trace_id);
        let is_cancelled = res.status.as_deref() == Some("cancelled");
        if !is_cancelled {
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.eventPoll",
                "GET",
                "/api/consultation/events/poll",
                "success",
                200,
                started_at,
                None,
                Some(response_body.clone()),
                None,
                Some(res.consultation_id.clone()),
                res.record
                    .get("requestId")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                None,
            );
        }
        return HttpResponse::Ok().json(response_body);
    }

    // 2. Long polling: wait for notification or timeout
    let mut rx = state.result_tx.subscribe();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(10);

    let final_result = loop {
        let sleep = tokio::time::sleep_until(deadline);
        tokio::pin!(sleep);

        let maybe_result = tokio::select! {
            recv_res = rx.recv() => {
                match recv_res {
                    Ok(_) => next_queued_event_after(state.get_ref(), after_event_id.as_deref()),
                    Err(_) => None,
                }
            }
            _ = &mut sleep => {
                None
            }
        };

        let Some(result) = maybe_result else {
            break None;
        };

        break Some(result);
    };

    if let Some(res) = final_result {
        let val = build_event_poll_response(&res, &trace_id);

        let is_cancelled = res.status.as_deref() == Some("cancelled");
        if !is_cancelled {
            record_bridge_log(
                &app_handle,
                val["traceId"].as_str().unwrap_or_default(),
                "consultation.eventPoll",
                "GET",
                "/api/consultation/events/poll",
                "success",
                200,
                started_at,
                None,
                Some(val.clone()),
                None,
                Some(res.consultation_id.clone()),
                res.record
                    .get("requestId")
                    .and_then(|value| value.as_str())
                    .map(str::to_string),
                None,
            );
        }
        HttpResponse::Ok().json(val)
    } else {
        let response_body = serde_json::json!({
            "state": "pending",
            "event": null,
            "message": "Consultation event not available",
            "code": "EVENT_NOT_READY",
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "consultation.eventPoll",
            "GET",
            "/api/consultation/events/poll",
            "pending",
            200,
            started_at,
            None,
            Some(response_body.clone()),
            None,
            None,
            None,
            None,
        );
        HttpResponse::Ok().json(response_body)
    }
}

async fn consultation_events_ws(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<SharedAppState>,
) -> Result<HttpResponse, actix_web::Error> {
    if let Err(response) = ensure_http_service_access(&state) {
        return Ok(response);
    }

    let after_event_id = parse_after_event_id(&req).unwrap_or_default();
    let (response, mut session, mut msg_stream) = actix_ws::handle(&req, stream)?;
    let state = state.get_ref().clone();

    actix_web::rt::spawn(async move {
        let mut last_event_id = after_event_id;

        let replay_events = if last_event_id.is_empty() {
            queued_events_after(&state, None, true)
        } else {
            queued_events_after(&state, Some(&last_event_id), false)
        };
        for result in replay_events {
            let trace_id = his_integration_log::new_trace_id();
            let envelope = build_event_poll_response(&result, &trace_id);
            let Ok(payload) = serde_json::to_string(&envelope) else {
                continue;
            };
            if session.text(payload).await.is_err() {
                return;
            }
            last_event_id = current_event_id(&result);
        }

        let mut rx = state.result_tx.subscribe();
        let mut heartbeat = tokio::time::interval(std::time::Duration::from_secs(30));

        'ws: loop {
            tokio::select! {
                message = msg_stream.next() => {
                    match message {
                        Some(Ok(actix_ws::Message::Ping(bytes))) => {
                            if session.pong(&bytes).await.is_err() {
                                break 'ws;
                            }
                        }
                        Some(Ok(actix_ws::Message::Text(text))) => {
                            if text.trim().eq_ignore_ascii_case("ping") && session.text("pong").await.is_err() {
                                break 'ws;
                            }
                        }
                        Some(Ok(actix_ws::Message::Close(reason))) => {
                            let _ = session.close(reason).await;
                            break 'ws;
                        }
                        Some(Ok(_)) => {}
                        Some(Err(error)) => {
                            if is_normal_websocket_disconnect(&error) {
                                println!("Consultation WebSocket disconnected by peer");
                            } else {
                                eprintln!("Consultation WebSocket receive error: {}", error);
                            }
                            break 'ws;
                        }
                        None => break 'ws,
                    }
                }
                _ = heartbeat.tick() => {
                    if session.ping(b"heartbeat").await.is_err() {
                        break 'ws;
                    }
                }
                recv_result = rx.recv() => {
                    match recv_result {
                        Ok(_) | Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                            let events = if last_event_id.is_empty() {
                                queued_events_after(&state, None, true)
                            } else {
                                queued_events_after(&state, Some(&last_event_id), false)
                            };

                            for result in events {
                                let trace_id = his_integration_log::new_trace_id();
                                let envelope = build_event_poll_response(&result, &trace_id);
                                let Ok(payload) = serde_json::to_string(&envelope) else {
                                    continue;
                                };
                                if session.text(payload).await.is_err() {
                                    break 'ws;
                                }
                                last_event_id = current_event_id(&result);
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break 'ws,
                    }
                }
            }
        }
    });

    Ok(response)
}

async fn reference_feedback(
    data: web::Json<ConsultationReferenceFeedbackRequest>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let request = data.into_inner();
    let request_summary = summarize_for_his_log(&request);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let (base_record_map, existing_result_type, existing_reference_type) = {
        let last_result = state.last_result.lock().unwrap();
        let Some(existing_result) = last_result.as_ref() else {
            let response_body = serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result",
                "traceId": trace_id
            });
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.referenceFeedback",
                "POST",
                "/api/consultation/reference-feedback",
                "error",
                409,
                started_at,
                Some(request_summary.clone()),
                Some(response_body.clone()),
                None,
                Some(request.consultation_id.clone()),
                Some(request.request_id.clone()),
                Some(
                    "No matching pending reference request for current consultation result"
                        .to_string(),
                ),
            );
            return HttpResponse::Conflict().json(response_body);
        };

        if existing_result.consultation_id != request.consultation_id {
            let response_body = serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result",
                "traceId": trace_id
            });
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.referenceFeedback",
                "POST",
                "/api/consultation/reference-feedback",
                "error",
                409,
                started_at,
                Some(request_summary.clone()),
                Some(response_body.clone()),
                None,
                Some(request.consultation_id.clone()),
                Some(request.request_id.clone()),
                Some(
                    "No matching pending reference request for current consultation result"
                        .to_string(),
                ),
            );
            return HttpResponse::Conflict().json(response_body);
        }

        let Some(record_map) = existing_result.record.as_object().cloned() else {
            let response_body = serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result",
                "traceId": trace_id
            });
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.referenceFeedback",
                "POST",
                "/api/consultation/reference-feedback",
                "error",
                409,
                started_at,
                Some(request_summary.clone()),
                Some(response_body.clone()),
                None,
                Some(request.consultation_id.clone()),
                Some(request.request_id.clone()),
                Some(
                    "No matching pending reference request for current consultation result"
                        .to_string(),
                ),
            );
            return HttpResponse::Conflict().json(response_body);
        };

        let existing_request_id = record_map
            .get("requestId")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let existing_result_type = record_map
            .get("resultType")
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();
        let existing_reference_type = record_map
            .get("referenceType")
            .or_else(|| record_map.get("action"))
            .and_then(|value| value.as_str())
            .unwrap_or_default()
            .to_string();

        if existing_request_id != request.request_id
            || (existing_result_type != "reference-request"
                && existing_result_type != "record-confirmed")
        {
            let response_body = serde_json::json!({
                "status": "error",
                "code": "REFERENCE_REQUEST_MISMATCH",
                "message": "No matching pending reference request for current consultation result",
                "traceId": trace_id
            });
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.referenceFeedback",
                "POST",
                "/api/consultation/reference-feedback",
                "error",
                409,
                started_at,
                Some(request_summary.clone()),
                Some(response_body.clone()),
                None,
                Some(request.consultation_id.clone()),
                Some(request.request_id.clone()),
                Some(
                    "No matching pending reference request for current consultation result"
                        .to_string(),
                ),
            );
            return HttpResponse::Conflict().json(response_body);
        }

        (
            record_map.clone(),
            existing_result_type,
            existing_reference_type,
        )
    };

    let resolved_reference_type = match (&request.reference_type, &request.action) {
        (Some(reference_type), Some(action)) if reference_type != action => {
            let response_body = serde_json::json!({
                "status": "error",
                "code": "INVALID_REFERENCE_TYPE",
                "message": "referenceType and action must match when both are provided",
                "traceId": trace_id
            });
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.referenceFeedback",
                "POST",
                "/api/consultation/reference-feedback",
                "error",
                400,
                started_at,
                Some(request_summary.clone()),
                Some(response_body.clone()),
                None,
                Some(request.consultation_id.clone()),
                Some(request.request_id.clone()),
                Some("referenceType and action must match when both are provided".to_string()),
            );
            return HttpResponse::BadRequest().json(response_body);
        }
        (Some(reference_type), _) => reference_type.clone(),
        (_, Some(action)) => action.clone(),
        _ if existing_result_type == "record-confirmed" => "batch".to_string(),
        _ => {
            let response_body = serde_json::json!({
                "status": "error",
                "code": "INVALID_REFERENCE_TYPE",
                "message": "referenceType or action is required",
                "traceId": trace_id
            });
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "consultation.referenceFeedback",
                "POST",
                "/api/consultation/reference-feedback",
                "error",
                400,
                started_at,
                Some(request_summary.clone()),
                Some(response_body.clone()),
                None,
                Some(request.consultation_id.clone()),
                Some(request.request_id.clone()),
                Some("referenceType or action is required".to_string()),
            );
            return HttpResponse::BadRequest().json(response_body);
        }
    };

    if existing_result_type == "record-confirmed" && resolved_reference_type != "batch" {
        let response_body = serde_json::json!({
            "status": "error",
            "code": "INVALID_REFERENCE_TYPE",
            "message": "record-confirmed feedback only supports batch referenceType",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "consultation.referenceFeedback",
            "POST",
            "/api/consultation/reference-feedback",
            "error",
            400,
            started_at,
            Some(request_summary.clone()),
            Some(response_body.clone()),
            None,
            Some(request.consultation_id.clone()),
            Some(request.request_id.clone()),
            Some("record-confirmed feedback only supports batch referenceType".to_string()),
        );
        return HttpResponse::BadRequest().json(response_body);
    }

    if existing_result_type == "reference-request"
        && existing_reference_type != resolved_reference_type
    {
        let response_body = serde_json::json!({
            "status": "error",
            "code": "REFERENCE_REQUEST_MISMATCH",
            "message": "No matching pending reference request for current consultation result",
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "consultation.referenceFeedback",
            "POST",
            "/api/consultation/reference-feedback",
            "error",
            409,
            started_at,
            Some(request_summary.clone()),
            Some(response_body.clone()),
            None,
            Some(request.consultation_id.clone()),
            Some(request.request_id.clone()),
            Some(
                "No matching pending reference request for current consultation result".to_string(),
            ),
        );
        return HttpResponse::Conflict().json(response_body);
    }

    println!(
        "Received consultation reference feedback: consultation={}, request={}, resultType={}, referenceType={}, status={}",
        request.consultation_id, request.request_id, existing_result_type, resolved_reference_type, request.status
    );

    let feedback_payload = serde_json::json!({
        "consultationId": request.consultation_id.clone(),
        "requestId": request.request_id.clone(),
        "referenceType": resolved_reference_type.clone(),
        "action": resolved_reference_type.clone(),
        "status": request.status.clone(),
        "message": request.message.clone(),
        "items": request.items.clone(),
        "timestamp": timestamp
    });

    let merged_result = {
        let mut record_map = base_record_map;

        record_map.insert(
            "resultType".to_string(),
            serde_json::Value::String("reference-feedback".to_string()),
        );
        record_map.insert(
            "requestId".to_string(),
            serde_json::Value::String(
                feedback_payload["requestId"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
            ),
        );
        record_map.insert(
            "referenceType".to_string(),
            serde_json::Value::String(
                feedback_payload["referenceType"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
            ),
        );
        record_map.insert(
            "action".to_string(),
            serde_json::Value::String(
                feedback_payload["action"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
            ),
        );
        record_map.insert(
            "referenceStatus".to_string(),
            serde_json::Value::String(
                feedback_payload["status"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
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
        result
    };
    if let Err(error) = append_consultation_event(state.get_ref(), merged_result.clone()) {
        eprintln!("Failed to append reference feedback event: {}", error);
    }

    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("consultation-reference-feedback", &feedback_payload) {
            eprintln!("Failed to emit reference feedback event: {}", e);
        }
    }

    let response_body = serde_json::json!({
        "status": "success",
        "consultationId": merged_result.consultation_id,
        "requestId": feedback_payload["requestId"],
        "referenceType": feedback_payload["referenceType"],
        "timestamp": timestamp,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "consultation.referenceFeedback",
        "POST",
        "/api/consultation/reference-feedback",
        if request.status == "success" {
            "success"
        } else {
            "business_error"
        },
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        None,
        Some(merged_result.consultation_id),
        feedback_payload["requestId"].as_str().map(str::to_string),
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn show_patient_risks(
    data: web::Json<PatientRiskData>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let risk_data = data.into_inner();
    let request_summary = summarize_for_his_log(&risk_data);
    let patient_label = if risk_data.na_pi.trim().is_empty() {
        risk_data.id_pi.as_str()
    } else {
        risk_data.na_pi.as_str()
    };
    println!(
        "Received patient risk analysis request for: {}",
        patient_label
    );

    // Emit event to Frontend
    if let Some(window) = app_handle.get_webview_window("main") {
        if let Err(e) = window.emit("show-patient-risks", &risk_data) {
            eprintln!("Failed to emit risk event: {}", e);
            let response_body = bridge_dispatch_error(&trace_id);
            record_bridge_log(
                &app_handle,
                response_body["traceId"].as_str().unwrap_or_default(),
                "patient.risks",
                "POST",
                "/api/patient/risks",
                "error",
                500,
                started_at,
                Some(request_summary),
                Some(response_body.clone()),
                Some(risk_data.id_pi.clone()),
                None,
                None,
                Some(e.to_string()),
            );
            return HttpResponse::InternalServerError().json(response_body);
        } else {
            println!("Event 'show-patient-risks' emitted successfully");
        }

        // Force window to front
        let _ = window.set_focus();
        let _ = window.unminimize();
        let _ = window.show();
    } else {
        println!("Error: Main window not found");
        let response_body = bridge_window_missing_error(&trace_id);
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "patient.risks",
            "POST",
            "/api/patient/risks",
            "error",
            500,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            Some(risk_data.id_pi.clone()),
            None,
            None,
            Some("Main window not found".to_string()),
        );
        return HttpResponse::InternalServerError().json(response_body);
    }

    let response_body = serde_json::json!({
        "status": "success",
        "idPi": risk_data.id_pi,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "patient.risks",
        "POST",
        "/api/patient/risks",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        Some(risk_data.id_pi.clone()),
        None,
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }))
}

async fn handshake(
    data: web::Json<BrowserContext>,
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let started_at = Instant::now();
    let trace_id = his_integration_log::new_trace_id();
    let ctx = data.into_inner();
    let request_summary = summarize_for_his_log(&ctx);

    if let Err(message) = validate_browser_context(&ctx) {
        {
            let mut browser_ctx = state.browser_context.lock().unwrap();
            *browser_ctx = None;
        }

        println!(
            "[Handshake] Rejected unauthorized SDK handshake: {}",
            message
        );
        let response_body = serde_json::json!({
            "status": "error",
            "message": message,
            "traceId": trace_id
        });
        record_bridge_log(
            &app_handle,
            response_body["traceId"].as_str().unwrap_or_default(),
            "handshake",
            "POST",
            "/api/handshake",
            "error",
            401,
            started_at,
            Some(request_summary),
            Some(response_body.clone()),
            None,
            None,
            None,
            response_body["message"].as_str().map(str::to_string),
        );
        return HttpResponse::Unauthorized().json(response_body);
    }

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

    let response_body = serde_json::json!({
        "status": "success",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        "traceId": trace_id
    });
    record_bridge_log(
        &app_handle,
        response_body["traceId"].as_str().unwrap_or_default(),
        "handshake",
        "POST",
        "/api/handshake",
        "success",
        200,
        started_at,
        Some(request_summary),
        Some(response_body.clone()),
        None,
        None,
        None,
        None,
    );
    HttpResponse::Ok().json(response_body)
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

fn generate_pmphai_sign(
    params: &HashMap<String, String>,
    app_secret: &str,
    app_key: &str,
) -> String {
    use md5::{Digest, Md5};

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

async fn pmphai_get_token(
    data: web::Json<PMPHAITokenRequest>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

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
    match client.post(PMPHAI_TOKEN_URL).form(&params).send().await {
        Ok(response) => match response.json::<serde_json::Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(e) => {
                eprintln!("PMPHAI token response parse failed: {}", e);
                HttpResponse::InternalServerError().json(pmphai_parse_error())
            }
        },
        Err(e) => {
            eprintln!("PMPHAI token request failed: {}", e);
            HttpResponse::InternalServerError().json(pmphai_request_error())
        }
    }
}

async fn pmphai_search(
    data: web::Json<PMPHAISearchRequest>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let url = format!(
        "{}?token={}&method=aiKnowledge",
        PMPHAI_API_BASE_URL, data.token
    );

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
    match client.post(&url).json(&body).send().await {
        Ok(response) => match response.json::<serde_json::Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(e) => {
                eprintln!("PMPHAI search response parse failed: {}", e);
                HttpResponse::InternalServerError().json(pmphai_parse_error())
            }
        },
        Err(e) => {
            eprintln!("PMPHAI search request failed: {}", e);
            HttpResponse::InternalServerError().json(pmphai_request_error())
        }
    }
}

async fn pmphai_get_clip(
    data: web::Json<PMPHAIClipRequest>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let url = format!(
        "{}?token={}&method=aiKnowledgeClip",
        PMPHAI_API_BASE_URL, data.token
    );

    let body = serde_json::json!({ "id": data.id });

    let client = reqwest::Client::new();
    match client.post(&url).json(&body).send().await {
        Ok(response) => match response.json::<serde_json::Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(e) => {
                eprintln!("PMPHAI clip response parse failed: {}", e);
                HttpResponse::InternalServerError().json(pmphai_parse_error())
            }
        },
        Err(e) => {
            eprintln!("PMPHAI clip request failed: {}", e);
            HttpResponse::InternalServerError().json(pmphai_request_error())
        }
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

async fn pmphai_generate_page_url(
    data: web::Json<PMPHAIPageUrlRequest>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

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

    let final_origin_url = data
        .origin_url
        .clone()
        .unwrap_or_else(|| "https://www.pmphai.com".to_string());

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

async fn pmphai_list_search(
    data: web::Json<PMPHAIListRequest>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    if let Err(response) = ensure_http_service_access(&state) {
        return response;
    }

    let url = format!("{}?token={}", PMPHAI_API_STANDARD_URL, data.token);

    let mut form_params = vec![("method", "list".to_string())];
    form_params.push(("pageSize", data.page_size.unwrap_or(10).to_string()));
    form_params.push(("page", data.page.unwrap_or(1).to_string()));

    if let Some(ref key) = data.key {
        form_params.push(("key", key.clone()));
    }
    if let Some(ref kg_base_id) = data.kg_base_id {
        form_params.push(("kgBaseId", kg_base_id.clone()));
    }
    if let Some(ref kg_base_name) = data.kg_base_name {
        form_params.push(("kgBaseName", kg_base_name.clone()));
    }
    if let Some(ref tag_id) = data.tag_id {
        form_params.push(("tagId", tag_id.clone()));
    }
    if let Some(ref tag_name) = data.tag_name {
        form_params.push(("tagName", tag_name.clone()));
    }
    if let Some(ref sort_field) = data.sort_field {
        form_params.push(("sortField", sort_field.clone()));
    }
    if let Some(ref sort_rule) = data.sort_rule {
        form_params.push(("sortRule", sort_rule.clone()));
    }

    let client = reqwest::Client::new();
    match client.post(&url).form(&form_params).send().await {
        Ok(response) => match response.json::<serde_json::Value>().await {
            Ok(json) => HttpResponse::Ok().json(json),
            Err(e) => {
                eprintln!("PMPHAI list response parse failed: {}", e);
                HttpResponse::InternalServerError().json(pmphai_parse_error())
            }
        },
        Err(e) => {
            eprintln!("PMPHAI list request failed: {}", e);
            HttpResponse::InternalServerError().json(pmphai_request_error())
        }
    }
}

// ==================== SDK Static File Serving ====================

/// 提供 med-hermes-sdk.js 静态文件，供第三方 HIS 通过 HTTP 获取 SDK
async fn serve_sdk_js() -> impl Responder {
    const SDK_JS: &str = include_str!("../../sdk/med-hermes-sdk.js");
    HttpResponse::Ok()
        .content_type("application/javascript; charset=utf-8")
        .insert_header(("Cache-Control", "public, max-age=3600"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .body(SDK_JS)
}

/// 提供 med-hermes-loader.js 引导加载器
async fn serve_loader_js() -> impl Responder {
    const LOADER_JS: &str = include_str!("../../sdk/med-hermes-loader.js");
    HttpResponse::Ok()
        .content_type("application/javascript; charset=utf-8")
        .insert_header(("Cache-Control", "public, max-age=86400"))
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .body(LOADER_JS)
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
                    .route("/api/health", web::get().to(health_check))
                    .route("/api/handshake", web::post().to(handshake))
                    .route("/api/consultation/receive", web::post().to(receive_patient))
                    .route(
                        "/api/consultation/start",
                        web::post().to(start_consultation),
                    )
                    .route(
                        "/api/consultation/assist",
                        web::post().to(start_consultation_assist),
                    )
                    .route(
                        "/api/report/interpret",
                        web::post().to(start_report_interpretation),
                    )
                    .route(
                        "/api/inpatient/emr/generate",
                        web::post().to(start_inpatient_emr_generation),
                    )
                    .route(
                        "/api/consultation/start-voice",
                        web::post().to(start_voice_consultation),
                    )
                    .route("/api/consultation/stop", web::post().to(stop_consultation))
                    .route(
                        "/api/consultation/reference-feedback",
                        web::post().to(reference_feedback),
                    )
                    .route(
                        "/api/consultation/events/poll",
                        web::get().to(poll_consultation_event),
                    )
                    .route(
                        "/api/consultation/events/ws",
                        web::get().to(consultation_events_ws),
                    )
                    .route("/api/patient/risks", web::post().to(show_patient_risks))
                    // PMPHAI API Proxy
                    .route("/api/pmphai/token", web::post().to(pmphai_get_token))
                    .route("/api/pmphai/search", web::post().to(pmphai_search))
                    .route("/api/pmphai/clip", web::post().to(pmphai_get_clip))
                    .route("/api/pmphai/list", web::post().to(pmphai_list_search))
                    .route(
                        "/api/pmphai/page-url",
                        web::post().to(pmphai_generate_page_url),
                    )
                    // SDK static files
                    .route("/sdk/med-hermes-sdk.js", web::get().to(serve_sdk_js))
                    .route("/sdk/med-hermes-loader.js", web::get().to(serve_loader_js))
            })
            .bind(("127.0.0.1", 8081))
            .expect("Failed to bind port 8081")
            .run()
            .await
            .unwrap_or_else(|e| eprintln!("HTTP server error: {}", e));
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normal_websocket_disconnect_detects_payload_eof() {
        let error = actix_ws::ProtocolError::Io(io::Error::other(
            "payload reached EOF before completing: None",
        ));

        assert!(is_normal_websocket_disconnect(&error));
    }

    #[test]
    fn normal_websocket_disconnect_keeps_protocol_errors_visible() {
        let error = actix_ws::ProtocolError::Overflow;

        assert!(!is_normal_websocket_disconnect(&error));
    }
}
