use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

mod http_server;

use serde::{Deserialize, Serialize};
use serde_json;

// Browser context from HIS SDK handshake
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BrowserContext {
    #[serde(default)]
    pub origin: String,
    #[serde(default)]
    pub href: String,
    #[serde(default)]
    pub cookie: String,
    #[serde(default)]
    pub user_agent: String,
    #[serde(default)]
    pub timestamp: u64,
    #[serde(default)]
    pub sdk_version: String,
    #[serde(default)]
    pub extra: serde_json::Value,
}

impl BrowserContext {
    pub fn emr_access_token(&self) -> Option<String> {
        self.extra
            .get("emrAccessToken")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }
}

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
    pub history_of_present_illness: Option<String>,
    pub past_medical_history: Option<String>,
    pub allergy_history: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConsultationResult {
    pub status: Option<String>,
    pub consultation_id: String,
    pub timestamp: u64,
    #[serde(flatten)]
    pub record: serde_json::Value,
}

mod aliyun_speech;
use aliyun_speech::{
    transcribe_realtime_aliyun, start_realtime_speech, send_speech_chunk, stop_realtime_speech,
    RealtimeSpeechSessionState,
};

mod commands;
mod db;

pub struct AppState {
    pub current_consultation: Mutex<Option<PatientInfo>>,
    pub last_result: Mutex<Option<ConsultationResult>>,
    pub browser_context: Mutex<Option<BrowserContext>>,
    pub result_tx: tokio::sync::broadcast::Sender<()>,
}

pub type SharedAppState = Arc<AppState>;

pub fn validate_browser_context(ctx: &BrowserContext) -> Result<(), String> {
    if ctx.emr_access_token().is_none() {
        return Err("SDK 握手失败：缺少有效的 emrAccessToken，桌面应用服务调用已被拒绝".to_string());
    }

    Ok(())
}

pub fn ensure_desktop_service_access(app: &tauri::AppHandle) -> Result<BrowserContext, String> {
    let state = app.state::<SharedAppState>();
    let browser_context = state.browser_context.lock().map_err(|error| error.to_string())?;
    let ctx = browser_context
        .clone()
        .ok_or_else(|| "桌面应用服务调用被拒绝：尚未完成 SDK 授权握手".to_string())?;

    validate_browser_context(&ctx)?;
    Ok(ctx)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateMetadata {
    version: String,
    body: Option<String>,
    date: Option<String>,
    current_version: String,
    download_url: String,
    target: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateProgressPayload {
    downloaded: usize,
    content_length: Option<u64>,
    percent: u8,
    finished: bool,
}

fn build_runtime_updater(
    app: &tauri::AppHandle,
    endpoint: Option<String>,
) -> Result<tauri_plugin_updater::Updater, String> {
    let mut builder = app.updater_builder();

    if let Some(endpoint_value) = endpoint
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        let parsed = url::Url::parse(&endpoint_value)
            .map_err(|error| format!("无效更新地址: {}", error))?;
        builder = builder
            .endpoints(vec![parsed])
            .map_err(|error| format!("设置更新地址失败: {}", error))?;
    }

    builder
        .build()
        .map_err(|error| format!("构建更新器失败: {}", error))
}

const FLOATING_BALL_LOGICAL_SIZE: f64 = 160.0;
const FLOATING_BALL_MARGIN_LOGICAL: f64 = 16.0;

#[derive(Clone, Copy)]
struct FloatingBallWindowSize {
    width: i32,
    height: i32,
}

fn clamp_axis(value: i32, min: i32, max: i32) -> i32 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

fn scaled_pixels(logical_pixels: f64, monitor: Option<&tauri::Monitor>) -> i32 {
    let scale_factor = monitor.map(|m| m.scale_factor()).unwrap_or(1.0);
    (logical_pixels * scale_factor).round().max(1.0) as i32
}

fn floating_ball_window_size(
    window: &tauri::WebviewWindow,
    monitor: Option<&tauri::Monitor>,
) -> FloatingBallWindowSize {
    if let Ok(size) = window.outer_size() {
        if size.width > 0 && size.height > 0 {
            return FloatingBallWindowSize {
                width: size.width as i32,
                height: size.height as i32,
            };
        }
    }

    let fallback_size = scaled_pixels(FLOATING_BALL_LOGICAL_SIZE, monitor);
    FloatingBallWindowSize {
        width: fallback_size,
        height: fallback_size,
    }
}

fn floating_ball_margin(monitor: &tauri::Monitor) -> i32 {
    scaled_pixels(FLOATING_BALL_MARGIN_LOGICAL, Some(monitor))
}

fn clamp_position_to_work_area(
    x: i32,
    y: i32,
    monitor: &tauri::Monitor,
    window_size: FloatingBallWindowSize,
) -> (i32, i32) {
    let work_area = monitor.work_area();
    let margin = floating_ball_margin(monitor);
    let min_x = work_area.position.x + margin;
    let min_y = work_area.position.y + margin;
    let max_x = work_area.position.x + work_area.size.width as i32 - window_size.width - margin;
    let max_y = work_area.position.y + work_area.size.height as i32 - window_size.height - margin;

    (clamp_axis(x, min_x, max_x), clamp_axis(y, min_y, max_y))
}

fn snap_position_to_work_area(
    x: i32,
    y: i32,
    monitor: &tauri::Monitor,
    window_size: FloatingBallWindowSize,
) -> (i32, i32) {
    let work_area = monitor.work_area();
    let margin = floating_ball_margin(monitor);
    let left_x = work_area.position.x + margin;
    let right_x = work_area.position.x + work_area.size.width as i32 - window_size.width - margin;
    let window_center_x = x + window_size.width / 2;
    let work_area_center_x = work_area.position.x + work_area.size.width as i32 / 2;
    let snapped_x = if window_center_x < work_area_center_x {
        left_x
    } else {
        right_x
    };
    let (_, safe_y) = clamp_position_to_work_area(x, y, monitor, window_size);

    (clamp_axis(snapped_x, left_x, right_x), safe_y)
}

fn active_floating_ball_monitor(window: &tauri::WebviewWindow) -> Option<tauri::Monitor> {
    window
        .cursor_position()
        .ok()
        .and_then(|cursor| {
            window
                .monitor_from_point(cursor.x, cursor.y)
                .ok()
                .flatten()
        })
        .or_else(|| window.primary_monitor().ok().flatten())
        .or_else(|| {
            window
                .available_monitors()
                .ok()
                .and_then(|monitors| monitors.into_iter().next())
        })
}

fn restore_floating_ball_position(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
) -> Option<(i32, i32)> {
    let monitor = active_floating_ball_monitor(window)?;
    let window_size = floating_ball_window_size(window, Some(&monitor));
    Some(snap_position_to_work_area(x, y, &monitor, window_size))
}

fn default_floating_ball_position(window: &tauri::WebviewWindow) -> (i32, i32) {
    if let Some(monitor) = active_floating_ball_monitor(window) {
        let work_area = monitor.work_area();
        let window_size = floating_ball_window_size(window, Some(&monitor));
        let margin = floating_ball_margin(&monitor);
        let preferred_x =
            work_area.position.x + work_area.size.width as i32 - window_size.width - margin;
        let preferred_y =
            work_area.position.y + (work_area.size.height as i32 - window_size.height) / 2;
        return clamp_position_to_work_area(preferred_x, preferred_y, &monitor, window_size);
    }

    (1720, 100)
}

#[tauri::command]
async fn check_app_update(
    app: tauri::AppHandle,
    endpoint: Option<String>,
) -> Result<Option<UpdateMetadata>, String> {
    let updater = build_runtime_updater(&app, endpoint)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("检查更新失败: {}", error))?;

    Ok(update.map(|item| UpdateMetadata {
        version: item.version,
        body: item.body,
        date: item.date.map(|value| value.to_string()),
        current_version: item.current_version,
        download_url: item.download_url.to_string(),
        target: item.target,
    }))
}

#[tauri::command]
async fn install_app_update(app: tauri::AppHandle, endpoint: Option<String>) -> Result<(), String> {
    let updater = build_runtime_updater(&app, endpoint)?;
    let update = updater
        .check()
        .await
        .map_err(|error| format!("检查更新失败: {}", error))?
        .ok_or_else(|| "当前没有可安装的更新".to_string())?;

    let progress_app = app.clone();
    let finish_app = app.clone();
    let mut downloaded = 0usize;

    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded += chunk_length;
                let percent = content_length
                    .map(|total| {
                        if total == 0 {
                            0
                        } else {
                            ((downloaded as f64 / total as f64) * 100.0).round() as u8
                        }
                    })
                    .unwrap_or(0);

                let _ = progress_app.emit(
                    "update-download-progress",
                    UpdateProgressPayload {
                        downloaded,
                        content_length,
                        percent,
                        finished: false,
                    },
                );
            },
            move || {
                let _ = finish_app.emit(
                    "update-download-progress",
                    UpdateProgressPayload {
                        downloaded: 0,
                        content_length: None,
                        percent: 100,
                        finished: true,
                    },
                );
            },
        )
        .await
        .map_err(|error| format!("安装更新失败: {}", error))?;

    Ok(())
}

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
    {
        let mut last_result = state.last_result.lock().map_err(|e| e.to_string())?;
        *last_result = Some(result);
    }
    let _ = state.result_tx.send(());
    println!("Consultation completed, result saved and notified.");
    Ok(())
}

/// 仅在 last_result 为空时写入取消结果。
/// 用于 exitWork 时兜底：如果接诊已正常完成（已有 result），则不覆盖；
/// 如果用户直接关闭窗口导致没有结果，则写入 cancelled 通知 SDK 停止轮询。
#[tauri::command]
async fn cancel_consultation_if_pending(
    state: tauri::State<'_, SharedAppState>,
) -> Result<bool, String> {
    let consultation_id = {
        let current = state.current_consultation.lock().map_err(|e| e.to_string())?;
        current.as_ref().map(|p| p.id_pi.clone()).unwrap_or_default()
    };

    let mut last_result = state.last_result.lock().map_err(|e| e.to_string())?;
    if last_result.is_some() {
        // 已有结果（正常完成或已取消），不覆盖
        println!("cancel_consultation_if_pending: result already exists, skip.");
        return Ok(false);
    }

    // 没有结果 → 写入取消
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    *last_result = Some(ConsultationResult {
        status: Some("cancelled".to_string()),
        consultation_id,
        timestamp,
        record: serde_json::json!({
            "resultType": "cancelled",
            "reason": "User closed the consultation window"
        }),
    });
    drop(last_result); // release lock before send
    let _ = state.result_tx.send(());
    println!("cancel_consultation_if_pending: wrote cancelled result and notified.");
    Ok(true)
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

/// 选择语音录音保存目录
#[tauri::command]
async fn pick_voice_recording_dir() -> Result<Option<String>, String> {
    let task = rfd::AsyncFileDialog::new()
        .set_title("选择语音接诊录音保存目录")
        .pick_folder();

    let result = task.await;

    Ok(result.map(|h| h.path().to_string_lossy().to_string()))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRecordingSaveResult {
    pub audio_path: String,
    pub transcript_path: String,
}

/// 将语音录音及对应实时转写文本成对落盘
/// - `audio`: WAV 字节
/// - `transcript`: 实时转写文本（可能为空字符串）
/// - `save_dir`: 用户配置的目录；为 None/空则使用 `<app_data>/voice_recordings`
#[tauri::command]
async fn save_voice_recording(
    audio: Vec<u8>,
    transcript: String,
    save_dir: Option<String>,
    app: tauri::AppHandle,
) -> Result<VoiceRecordingSaveResult, String> {
    use std::path::PathBuf;

    let target_dir: PathBuf = match save_dir.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(dir) => PathBuf::from(dir),
        None => app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法解析应用数据目录: {}", e))?
            .join("voice_recordings"),
    };

    std::fs::create_dir_all(&target_dir)
        .map_err(|e| format!("创建保存目录失败 ({}): {}", target_dir.display(), e))?;

    // 时间戳：使用 epoch 毫秒，避免引入 chrono 依赖；同时生成可读时间字符串
    use std::time::{SystemTime, UNIX_EPOCH};
    let epoch_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let stamp = format!("{}", epoch_ms);
    let readable_time = format_local_datetime(epoch_ms);

    let audio_path = target_dir.join(format!("voice_{}.wav", stamp));
    let transcript_path = target_dir.join(format!("voice_{}.txt", stamp));

    std::fs::write(&audio_path, &audio)
        .map_err(|e| format!("写入音频文件失败 ({}): {}", audio_path.display(), e))?;

    let audio_filename = audio_path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    let transcript_body = if transcript.trim().is_empty() {
        format!(
            "# 语音接诊转写\n时间: {}\n音频: {}\n\n[未捕获到转写文本]\n",
            readable_time, audio_filename,
        )
    } else {
        format!(
            "# 语音接诊转写\n时间: {}\n音频: {}\n\n{}\n",
            readable_time, audio_filename, transcript,
        )
    };

    std::fs::write(&transcript_path, transcript_body)
        .map_err(|e| format!("写入转写文本失败 ({}): {}", transcript_path.display(), e))?;

    Ok(VoiceRecordingSaveResult {
        audio_path: audio_path.to_string_lossy().to_string(),
        transcript_path: transcript_path.to_string_lossy().to_string(),
    })
}

/// 把 epoch 毫秒转换为本地时间字符串（粗粒度，仅用于人类可读时间戳，不依赖 chrono）。
fn format_local_datetime(epoch_ms: u128) -> String {
    // 使用本地时区偏移：通过比较 SystemTime 与 UTC 没有现成 API，这里仅按 UTC 输出，
    // 在文件名以 epoch 毫秒标识、文件内附带 UTC 时间，避免歧义。
    let secs_total = (epoch_ms / 1000) as i64;
    let days = secs_total / 86_400;
    let mut remainder = secs_total - days * 86_400;
    if remainder < 0 {
        remainder += 86_400;
    }
    let hour = remainder / 3600;
    let minute = (remainder % 3600) / 60;
    let second = remainder % 60;

    // Civil-from-days (Howard Hinnant)
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        y, m, d, hour, minute, second
    )
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
    let (result_tx, _) = tokio::sync::broadcast::channel(16);
    let state = Arc::new(AppState {
        current_consultation: Mutex::new(None),
        last_result: Mutex::new(None),
        browser_context: Mutex::new(None),
        result_tx,
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
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            start_drag,
            get_window_position,
            set_window_position,
            complete_consultation,
            cancel_consultation_if_pending,
            check_app_update,
            install_app_update,
            transcribe_realtime_aliyun,
            start_realtime_speech,
            send_speech_chunk,
            stop_realtime_speech,
            save_templates,
            check_mouse_hover,
            export_templates_with_dialog,
            pick_voice_recording_dir,
            save_voice_recording,
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
            commands::feedback::export_data,
            commands::his_integration_log::record_his_integration_log,
            commands::his_integration_log::list_his_integration_logs,
            commands::his_integration_log::clear_his_integration_logs,
            commands::his_integration_log::export_his_integration_logs,
            commands::device::get_device_mac_address,
            // Medical catalog cache commands
            commands::medical_catalog::load_medical_catalog_snapshot,
            commands::medical_catalog::replace_diagnosis_catalog,
            commands::medical_catalog::replace_org_medical_item_catalog,
            commands::medical_catalog::replace_org_medicine_catalog,
            commands::medical_catalog::get_medical_catalog_debug_state,
            commands::medical_catalog::clear_medical_catalog_cache,
            // Patient long-term memory commands
            commands::patient_memory::patient_memory_get,
            commands::patient_memory::patient_memory_append_visit,
            commands::patient_memory::patient_memory_clear
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

            println!("[MedicalCatalog] Initializing medical catalog database...");
            match commands::medical_catalog::init_database(app.handle()) {
                Ok(_) => println!("[MedicalCatalog] Database initialized successfully"),
                Err(e) => {
                    eprintln!("[MedicalCatalog] Failed to initialize database: {}", e);
                    eprintln!("[MedicalCatalog] Error details: {:?}", e);
                }
            }

            println!("[PatientMemory] Initializing patient memory database...");
            match commands::patient_memory::init_database(app.handle()) {
                Ok(_) => println!("[PatientMemory] Database initialized successfully"),
                Err(e) => {
                    eprintln!("[PatientMemory] Failed to initialize database: {}", e);
                }
            }

            // 获取主窗口
            let window = app.get_webview_window("main").unwrap();

            // 设置窗口为始终置顶
            window.set_always_on_top(true).unwrap();
            let _ = window.set_visible_on_all_workspaces(true);
            let _ = window.set_skip_taskbar(true);
            let _ = window.set_resizable(false);
            let _ = window.set_size(tauri::LogicalSize::new(
                FLOATING_BALL_LOGICAL_SIZE,
                FLOATING_BALL_LOGICAL_SIZE,
            ));

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
                                if let Some((safe_x, safe_y)) = restore_floating_ball_position(&window, x as i32, y as i32) {
                                    println!("[Rust] Restoring position from .settings.dat: ({}, {}) -> ({}, {})", x, y, safe_x, safe_y);
                                    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                        x: safe_x,
                                        y: safe_y,
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
                let (safe_x, safe_y) = default_floating_ball_position(&window);
                println!("[Rust] Setting safe default position: ({}, {})", safe_x, safe_y);
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: safe_x,
                    y: safe_y,
                }));
            }
            // 位置就绪后再显示窗口，避免在错误位置闪烁
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_always_on_top(true);
            let _ = window.set_focus();

            // 显示后再校验一次实际窗口尺寸与位置。高 DPI、Dock/任务栏或系统延迟应用尺寸时，
            // 启动前计算出的安全坐标可能仍需要按最终 outer_size 再夹回 work area。
            if let Ok(current_pos) = window.outer_position() {
                let verified_pos =
                    restore_floating_ball_position(&window, current_pos.x, current_pos.y)
                        .unwrap_or_else(|| default_floating_ball_position(&window));
                if (current_pos.x - verified_pos.0).abs() > 4
                    || (current_pos.y - verified_pos.1).abs() > 4
                {
                    println!(
                        "[Rust] Rechecking floating ball position after show: ({}, {}) -> ({}, {})",
                        current_pos.x, current_pos.y, verified_pos.0, verified_pos.1
                    );
                    let _ = window.set_position(tauri::Position::Physical(
                        tauri::PhysicalPosition {
                            x: verified_pos.0,
                            y: verified_pos.1,
                        },
                    ));
                }
            }

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
