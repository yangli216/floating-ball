use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::{Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

static WHISPER_CTX: OnceLock<WhisperContext> = OnceLock::new();

const MODEL_FILENAME: &str = "ggml-medium.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin";

fn models_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;
    Ok(data_dir.join("models"))
}

fn model_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(models_dir(app_handle)?.join(MODEL_FILENAME))
}

fn optimal_thread_count() -> i32 {
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let threads = (cores * 2 / 3).max(1).min(16);
    println!("[Whisper] CPU cores: {}, using {} threads", cores, threads);
    threads as i32
}

fn get_or_init_context(app_handle: &tauri::AppHandle) -> Result<&'static WhisperContext, String> {
    if let Some(ctx) = WHISPER_CTX.get() {
        return Ok(ctx);
    }

    let path = model_path(app_handle)?;
    if !path.exists() {
        return Err("本地语音模型未下载，请在设置中下载".to_string());
    }
    let params = WhisperContextParameters::default();
    println!("[Whisper] Loading model from {:?} ...", path);
    let start = std::time::Instant::now();
    let ctx = WhisperContext::new_with_params(
        path.to_str().ok_or("模型路径无效")?,
        params,
    )
    .map_err(|e| format!("加载 Whisper 模型失败: {}", e))?;
    println!("[Whisper] Model loaded in {:?}", start.elapsed());

    // If another thread beat us, that's fine -- use theirs
    let _ = WHISPER_CTX.set(ctx);
    Ok(WHISPER_CTX.get().unwrap())
}

fn pcm_i16_bytes_to_f32(data: &[u8]) -> Vec<f32> {
    data.chunks_exact(2)
        .map(|chunk| {
            let sample = i16::from_le_bytes([chunk[0], chunk[1]]);
            sample as f32 / 32768.0
        })
        .collect()
}

#[tauri::command]
pub async fn check_whisper_model(
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    let path = model_path(&app_handle)?;
    if path.exists() {
        let metadata = std::fs::metadata(&path)
            .map_err(|e| format!("读取模型文件信息失败: {}", e))?;
        let size_mb = metadata.len() as f64 / (1024.0 * 1024.0);
        Ok(serde_json::json!({
            "exists": true,
            "path": path.to_string_lossy(),
            "size_mb": (size_mb * 10.0).round() / 10.0
        }))
    } else {
        Ok(serde_json::json!({
            "exists": false,
            "path": path.to_string_lossy(),
            "size_mb": 0
        }))
    }
}

#[tauri::command]
pub async fn download_whisper_model(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = models_dir(&app_handle)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("创建模型目录失败: {}", e))?;

    let dest = dir.join(MODEL_FILENAME);

    println!("[Whisper] Downloading model to {:?}", dest);

    let client = reqwest::Client::new();
    let response = client
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|e| format!("下载请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP 状态: {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    println!("[Whisper] Total size: {} bytes", total_size);

    let tmp_dest = dir.join(format!("{}.downloading", MODEL_FILENAME));

    let mut file = tokio::fs::File::create(&tmp_dest)
        .await
        .map_err(|e| format!("创建临时文件失败: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_progress: u64 = 0;

    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("下载数据失败: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("写入文件失败: {}", e))?;
        downloaded += chunk.len() as u64;

        if downloaded - last_progress >= 1_048_576 {
            last_progress = downloaded;
            let progress = if total_size > 0 {
                (downloaded as f64 / total_size as f64 * 100.0).round()
            } else {
                0.0
            };
            let _ = app_handle.emit("whisper-download-progress", serde_json::json!({
                "downloaded_mb": (downloaded as f64 / 1_048_576.0).round(),
                "total_mb": (total_size as f64 / 1_048_576.0).round(),
                "progress": progress
            }));
        }
    }

    file.flush().await.map_err(|e| format!("刷新文件失败: {}", e))?;
    drop(file);

    tokio::fs::rename(&tmp_dest, &dest)
        .await
        .map_err(|e| format!("重命名模型文件失败: {}", e))?;

    println!("[Whisper] Download complete: {:?}", dest);
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_whisper_model(app_handle: tauri::AppHandle) -> Result<(), String> {
    let path = model_path(&app_handle)?;
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("删除模型文件失败: {}", e))?;
        println!("[Whisper] Model deleted: {:?}", path);
    }
    Ok(())
}

#[tauri::command]
pub async fn transcribe_local_whisper(
    app_handle: tauri::AppHandle,
    audio_data: Vec<u8>,
) -> Result<String, String> {
    if audio_data.is_empty() {
        return Err("音频数据为空".to_string());
    }

    let duration_secs = audio_data.len() as f64 / (16000.0 * 2.0);
    println!(
        "[Whisper] Starting transcription, audio: {} bytes ({:.1}s)",
        audio_data.len(),
        duration_secs
    );

    let n_threads = optimal_thread_count();

    let result = tokio::task::spawn_blocking(move || {
        let ctx = get_or_init_context(&app_handle)?;
        let samples = pcm_i16_bytes_to_f32(&audio_data);

        let mut state = ctx
            .create_state()
            .map_err(|e| format!("创建推理状态失败: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("zh"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_n_threads(n_threads);

        let start = std::time::Instant::now();
        state
            .full(params, &samples)
            .map_err(|e| format!("Whisper 推理失败: {}", e))?;

        let num_segments = state
            .full_n_segments()
            .map_err(|e| format!("获取分段失败: {}", e))?;
        let mut text = String::new();
        for i in 0..num_segments {
            if let Ok(segment_text) = state.full_get_segment_text(i) {
                text.push_str(&segment_text);
            }
        }

        println!(
            "[Whisper] Transcription complete in {:?}, {} segments, {} chars",
            start.elapsed(),
            num_segments,
            text.len()
        );

        Ok(text.trim().to_string())
    })
    .await
    .map_err(|e| format!("Whisper 任务异常: {}", e))?;

    result
}
