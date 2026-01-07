use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use actix_cors::Cors;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

use crate::SharedAppState;

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PatientInfo {
    #[serde(alias = "patientId")]
    pub id_pi: String,          // 对应 idPi
    #[serde(alias = "name")]
    pub na_pi: String,          // 对应 naPi
    #[serde(alias = "gender")]
    pub sd_sex_text: String,    // 对应 sdSexText
    #[serde(alias = "age")]
    pub age_text: String,       // 对应 ageText
    
    // 保留原有字段，但允许为空或通过别名映射
    pub department: Option<String>,
    pub chief_complaint: Option<String>,
    
    // 补充 ConsultationPage 需要的其他字段 (可选)
    pub mobile_phone: Option<String>,
    pub id_card: Option<String>,
    #[serde(alias = "allergyHistory")]
    pub allergy_history: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationResult {
    pub consultation_id: String,
    pub diagnosis: String,
    pub treatment_plan: String,
    pub medical_summary: String,
    pub timestamp: u64,
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
    pub patient_id: String,
    pub patient_name: String,
    pub gender: String,      // "M" or "F"
    pub age: u32,
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

async fn stop_consultation(
    app_handle: web::Data<tauri::AppHandle>,
    state: web::Data<SharedAppState>,
) -> impl Responder {
    println!("Received stop consultation request");
    
    // 1. Update State
    {
        let mut current = state.current_consultation.lock().unwrap();
        *current = None;
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
    HttpResponse::Ok().json(serde_json::json!({
        "status": "success",
        "message": "Consultation stopped"
    }))
}

async fn get_result(
    state: web::Data<SharedAppState>,
) -> impl Responder {
    let result = state.last_result.lock().unwrap();
    if let Some(res) = &*result {
        HttpResponse::Ok().json(res)
    } else {
        HttpResponse::NotFound().json(serde_json::json!({
            "error": "Consultation result not available",
            "code": "RESULT_NOT_READY"
        }))
    }
}

async fn show_patient_risks(
    data: web::Json<PatientRiskData>,
    app_handle: web::Data<tauri::AppHandle>,
) -> impl Responder {
    let risk_data = data.into_inner();
    println!("Received patient risks for: {} ({} risks)", risk_data.patient_name, risk_data.risks.len());

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
        "patientId": risk_data.patient_id
    }))
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
                    .route("/api/consultation/start", web::post().to(start_consultation))
                    .route("/api/consultation/stop", web::post().to(stop_consultation))
                    .route("/api/consultation/result", web::get().to(get_result))
                    .route("/api/patient/risks", web::post().to(show_patient_risks))
            })
            .bind(("127.0.0.1", 8081))
            .expect("Failed to bind port 8081")
            .run()
            .await
            .unwrap_or_else(|e| eprintln!("HTTP server error: {}", e));
        });
    });
}
