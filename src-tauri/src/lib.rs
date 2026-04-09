use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

mod http_server;
use http_server::{ConsultationResult, PatientInfo};

mod aliyun_speech;
use aliyun_speech::{
    transcribe_realtime_aliyun, start_realtime_speech, send_speech_chunk, stop_realtime_speech,
    RealtimeSpeechSessionState,
};

mod whisper_speech;
use whisper_speech::{
    check_whisper_model, delete_whisper_model, download_whisper_model, transcribe_local_whisper,
};

mod commands;
mod db;

pub struct AppState {
    pub current_consultation: Mutex<Option<PatientInfo>>,
    pub last_result: Mutex<Option<ConsultationResult>>,
}

pub type SharedAppState = Arc<AppState>;

// 窗口拖拽命令
#[tauri::command]
async fn start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// 获取窗口位置
#[tauri::command]
async fn get_window_position(window: tauri::Window) -> Result<(i32, i32), String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    Ok((position.x, position.y))
}

// 设置窗口位置
#[tauri::command]
async fn set_window_position(window: tauri::Window, x: i32, y: i32) -> Result<(), String> {
    use tauri::Position;
    window
        .set_position(Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn complete_consultation(
    state: tauri::State<'_, SharedAppState>,
    result: ConsultationResult,
) -> Result<(), String> {
    let mut last_result = state.last_result.lock().map_err(|e| e.to_string())?;
    *last_result = Some(result);
    println!("Consultation completed, result saved.");
    Ok(())
}

#[tauri::command]
async fn save_templates(content: String) -> Result<(), String> {
    use std::io::Write;
    use std::path::Path;

    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    println!("Current working directory: {:?}", cwd);

    // Try multiple possible paths for development
    let paths = vec![
        "src/assets/templates.json",       // Run from project root
        "../src/assets/templates.json",    // Run from src-tauri
        "../../src/assets/templates.json", // Run from src-tauri/target/debug/...
    ];

    let mut target_path = std::path::PathBuf::new();
    let mut found = false;

    // First check if any exists (to overwrite)
    for p in &paths {
        if Path::new(p).exists() {
            target_path = Path::new(p).to_path_buf();
            found = true;
            break;
        }
    }

    // If not found, try to find a valid directory to create it in
    if !found {
        println!("templates.json not found in common paths. Checking parent directories...");
        for p in &paths {
            if let Some(parent) = Path::new(p).parent() {
                if parent.exists() {
                    target_path = Path::new(p).to_path_buf();
                    found = true;
                    break;
                }
            }
        }
    }

    if !found {
        return Err(format!(
            "Could not find src/assets/templates.json path. CWD: {:?}",
            cwd
        ));
    }

    let path_str = target_path.to_string_lossy().to_string();
    println!("Saving templates to: {}", path_str);

    let mut file = std::fs::File::create(&target_path)
        .map_err(|e| format!("Failed to create file at {}: {}", path_str, e))?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;

    println!("Templates saved successfully.");
    Ok(())
}

#[tauri::command]
async fn check_mouse_hover(window: tauri::Window) -> Result<bool, String> {
    let mouse = window.cursor_position().map_err(|e| e.to_string())?;
    let win_pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;

    let rel_x = mouse.x - win_pos.x as f64;
    let rel_y = mouse.y - win_pos.y as f64;

    let is_hovered =
        rel_x >= 0.0 && rel_x <= size.width as f64 && rel_y >= 0.0 && rel_y <= size.height as f64;

    Ok(is_hovered)
}

#[tauri::command]
async fn export_templates_with_dialog(content: String) -> Result<(), String> {
    let task = rfd::AsyncFileDialog::new()
        .set_file_name("templates_exported.json")
        .add_filter("JSON", &["json"])
        .save_file();

    let result = task.await;

    if let Some(handle) = result {
        let path = handle.path();
        std::fs::write(path, content).map_err(|e| e.to_string())?;
    }

    Ok(())
}

// 设置窗口毛玻璃效果 (macOS only)
#[tauri::command]
async fn set_vibrancy(window: tauri::Window, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if enabled {
            // 使用 HudWindow 效果，这是最透明的毛玻璃效果
            apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None)
                .map_err(|e| e.to_string())?;
        } else {
            // 清除 vibrancy 效果 - 设置为完全透明
            apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, None)
                .map_err(|_| "Failed to clear vibrancy".to_string())?;
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, enabled);
    }
    Ok(())
}

/// 通过 Rust 后端代理音频转写请求，绕过 WebView 的 CORS/ATS 限制。
#[tauri::command]
async fn transcribe_audio(
    api_key: String,
    base_url: String,
    audio_model: String,
    audio_data: Vec<u8>,
    mime_type: Option<String>,
) -> Result<String, String> {
    if api_key.trim().is_empty() {
        return Err("缺少 API Key".to_string());
    }
    if base_url.trim().is_empty() {
        return Err("缺少 Base URL".to_string());
    }
    if audio_model.trim().is_empty() {
        return Err("缺少音频模型名称".to_string());
    }
    if audio_data.is_empty() {
        return Err("音频数据为空".to_string());
    }

    let endpoint = format!("{}/audio/transcriptions", base_url.trim_end_matches('/'));
    let media_type = mime_type.unwrap_or_else(|| "audio/wav".to_string());

    let file_part = reqwest::multipart::Part::bytes(audio_data)
        .file_name("recording.wav")
        .mime_str(&media_type)
        .map_err(|e| format!("无效音频类型 {}: {}", media_type, e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", file_part)
        .text("model", audio_model);

    let client = reqwest::Client::new();
    let response = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("转写请求失败: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("读取转写响应失败: {}", e))?;

    let data: serde_json::Value =
        serde_json::from_str(&body).unwrap_or_else(|_| serde_json::json!({ "raw": body }));

    if !status.is_success() {
        let api_message = data
            .get("error")
            .and_then(|v| v.get("message"))
            .and_then(|v| v.as_str())
            .or_else(|| data.get("message").and_then(|v| v.as_str()))
            .or_else(|| data.get("raw").and_then(|v| v.as_str()))
            .unwrap_or("未知错误");
        return Err(format!("转写接口返回错误 ({}): {}", status.as_u16(), api_message));
    }

    if let Some(text) = data.get("text").and_then(|v| v.as_str()) {
        return Ok(text.to_string());
    }

    Err("转写响应中缺少 text 字段".to_string())
}

#[derive(Clone, serde::Serialize)]
struct MousePosPayload {
    x: f64,
    y: f64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        current_consultation: Mutex::new(None),
        last_result: Mutex::new(None),
    });

    tauri::Builder::default()
        .manage(state.clone())
        .manage(RealtimeSpeechSessionState::new())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            start_drag,
            get_window_position,
            set_window_position,
            complete_consultation,
            transcribe_realtime_aliyun,
            start_realtime_speech,
            send_speech_chunk,
            stop_realtime_speech,
            transcribe_local_whisper,
            check_whisper_model,
            download_whisper_model,
            delete_whisper_model,
            save_templates,
            check_mouse_hover,
            export_templates_with_dialog,
            set_vibrancy,
            transcribe_audio,
            // Feedback system commands
            commands::feedback::create_session,
            commands::feedback::update_session_status,
            commands::feedback::save_message,
            commands::feedback::save_feedback,
            commands::feedback::save_recommendation,
            commands::feedback::log_operation,
            commands::feedback::record_performance_metric,
            commands::feedback::get_session_statistics,
            commands::feedback::get_feedback_statistics,
            commands::feedback::get_performance_statistics,
            commands::feedback::get_recommendation_statistics,
            commands::feedback::get_operation_statistics,
            commands::feedback::export_data
        ])
        .setup(move |app| {
            // Initialize feedback database
            println!("[Feedback] Initializing feedback database...");
            match commands::feedback::init_database(app.handle()) {
                Ok(_) => println!("[Feedback] Database initialized successfully"),
                Err(e) => {
                    eprintln!("[Feedback] Failed to initialize feedback database: {}", e);
                    eprintln!("[Feedback] Error details: {:?}", e);
                }
            }

            // 获取主窗口
            let window = app.get_webview_window("main").unwrap();

            // 设置窗口为始终置顶
            window.set_always_on_top(true).unwrap();

            // 尝试在 Rust 层直接读取本地存储并恢复悬浮球坐标，避免前端 Vue 初始化带来的闪烁和 macOS 隐藏渲染 Bug
            let mut restored = false;
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let settings_path = app_data_dir.join(".settings.dat");
                if let Ok(content) = std::fs::read_to_string(&settings_path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(pos) = json.get("window_pos") {
                            if let (Some(x), Some(y)) = (
                                pos.get("x").and_then(|v| v.as_f64()),
                                pos.get("y").and_then(|v| v.as_f64()),
                            ) {
                                // 校验位置是否在任意显示器范围内，防止窗口跑到屏幕外不可见
                                let in_bounds = window.available_monitors().ok()
                                    .map(|monitors| monitors.iter().any(|m| {
                                        let mp = m.position();
                                        let ms = m.size();
                                        x >= mp.x as f64
                                            && y >= mp.y as f64
                                            && x < (mp.x as f64 + ms.width as f64)
                                            && y < (mp.y as f64 + ms.height as f64)
                                    }))
                                    .unwrap_or(false);
                                if in_bounds {
                                    println!("[Rust] Restoring position from .settings.dat: ({}, {})", x, y);
                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                        x: x as i32,
                                        y: y as i32,
                                    }));
                                    restored = true;
                                } else {
                                    println!("[Rust] Saved position ({}, {}) is off-screen, using safe default", x, y);
                                }
                            }
                        }
                    }
                }
            }
            // 无有效保存位置时，设到主显示器右上角安全区域（基准 1920×1080）
            if !restored {
                let (safe_x, safe_y) = if let Ok(Some(monitor)) = window.primary_monitor() {
                    let ms = monitor.size();
                    ((ms.width as i32).saturating_sub(200), 100)
                } else {
                    // 获取显示器信息失败，按 1920×1080 估算
                    (1720, 100)
                };
                println!("[Rust] Setting safe default position: ({}, {})", safe_x, safe_y);
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: safe_x,
                    y: safe_y,
                }));
            }
            // 位置就绪后再显示窗口，避免在错误位置闪烁
            let _ = window.show();

            // Start HTTP Server
            let handle = app.handle().clone();
            let state_for_server = state.clone();
            http_server::run_server(handle, state_for_server);

            // 启动鼠标位置轮询线程，解决失焦状态下无法检测 Hover 的问题
            let win_clone = window.clone();
            std::thread::spawn(move || {
                let mut was_hovered = false;
                loop {
                    // 动态调整轮询频率：
                    // - 未 Hover (待机模式): 降低到 100ms (10Hz)，极低功耗，足以捕获鼠标进入
                    // - Hover 中 (交互模式): 提高到 16ms (~60Hz)，确保按钮响应极致丝滑
                    let sleep_duration = if was_hovered {
                        std::time::Duration::from_millis(16)
                    } else {
                        std::time::Duration::from_millis(100)
                    };
                    std::thread::sleep(sleep_duration);

                    // 获取必要参数
                    let mouse_ret = win_clone.cursor_position();
                    let win_pos_ret = win_clone.outer_position();
                    let win_size_ret = win_clone.inner_size();

                    let (is_hovered, rel_x, rel_y) = if let (Ok(mouse), Ok(win_pos), Ok(size)) = (
                        mouse_ret.as_ref(),
                        win_pos_ret.as_ref(),
                        win_size_ret.as_ref(),
                    ) {
                        let rel_x = mouse.x - win_pos.x as f64;
                        let rel_y = mouse.y - win_pos.y as f64;

                        let hovered = rel_x >= 0.0
                            && rel_x <= size.width as f64
                            && rel_y >= 0.0
                            && rel_y <= size.height as f64;
                        (hovered, rel_x, rel_y)
                    } else {
                        (false, 0.0, 0.0)
                    };

                    if is_hovered != was_hovered {
                        let _ = win_clone.emit("hover-change", is_hovered);
                        was_hovered = is_hovered;
                    }

                    // 如果在窗口内，持续发送坐标用于前端模拟 Hover
                    if is_hovered {
                        let _ = win_clone.emit("mouse-pos", MousePosPayload { x: rel_x, y: rel_y });
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
