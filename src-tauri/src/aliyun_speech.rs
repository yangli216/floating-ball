use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite};
use futures_util::{StreamExt, SinkExt};
use tokio::sync::{mpsc, oneshot, Mutex as TokioMutex};
use tauri::Emitter;

const DASHSCOPE_WS_URL: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/";

// ===== Realtime streaming types =====

pub enum SpeechCmd {
    Audio(Vec<u8>),
    Finish,
}

pub struct RealtimeSpeechSessionState {
    pub cmd_tx: TokioMutex<Option<mpsc::Sender<SpeechCmd>>>,
    pub result_rx: TokioMutex<Option<oneshot::Receiver<String>>>,
}

impl RealtimeSpeechSessionState {
    pub fn new() -> Self {
        Self {
            cmd_tx: TokioMutex::new(None),
            result_rx: TokioMutex::new(None),
        }
    }
}

#[derive(Clone, Serialize)]
pub struct SpeechTextEvent {
    pub text: String,
    pub is_sentence_end: bool,
}

#[derive(Debug, Serialize)]
struct RunTaskMessage {
    header: RunTaskHeader,
    payload: RunTaskPayload,
}

#[derive(Debug, Serialize)]
struct RunTaskHeader {
    action: String,
    task_id: String,
    streaming: String,
}

#[derive(Debug, Serialize)]
struct RunTaskPayload {
    task_group: String,
    task: String,
    function: String,
    model: String,
    parameters: TaskParameters,
    input: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct TaskParameters {
    format: String,
    sample_rate: u32,
}

#[derive(Debug, Serialize)]
struct FinishTaskMessage {
    header: FinishTaskHeader,
    payload: FinishTaskPayload,
}

#[derive(Debug, Serialize)]
struct FinishTaskHeader {
    action: String,
    task_id: String,
    streaming: String,
}

#[derive(Debug, Serialize)]
struct FinishTaskPayload {
    input: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct ResponseMessage {
    header: Option<ResponseHeader>,
    payload: Option<ResponsePayload>,
}

#[derive(Debug, Deserialize)]
struct ResponseHeader {
    event: Option<String>,
    error_message: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResponsePayload {
    output: Option<ResponseOutput>,
}

#[derive(Debug, Deserialize)]
struct ResponseOutput {
    sentence: Option<Sentence>,
}

#[derive(Debug, Deserialize)]
struct Sentence {
    text: Option<String>,
    sentence_end: Option<bool>,
}

/// 创建 WebSocket 请求
fn build_ws_request(api_key: &str) -> Result<tungstenite::http::Request<()>, String> {
    tungstenite::http::Request::builder()
        .uri(DASHSCOPE_WS_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Host", "dashscope.aliyuncs.com")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tungstenite::handshake::client::generate_key())
        .body(())
        .map_err(|e| format!("Request build error: {}", e))
}

/// 带重试的 WebSocket 连接
async fn connect_with_retry(
    api_key: &str,
    max_retries: usize,
) -> Result<tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>, String> {
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        let request = build_ws_request(api_key)?;

        println!("[Aliyun WS] Connection attempt {} of {}", attempt + 1, max_retries + 1);

        match connect_async(request).await {
            Ok((ws_stream, _)) => {
                println!("[Aliyun WS] Connected successfully on attempt {}", attempt + 1);
                return Ok(ws_stream);
            }
            Err(e) => {
                last_error = format!("WebSocket connection failed: {}", e);
                println!("[Aliyun WS] {}", last_error);

                if attempt < max_retries {
                    // 指数退避：1s, 2s, 4s
                    let delay_ms = 1000 * (1 << attempt).min(4);
                    println!("[Aliyun WS] Retrying in {}ms...", delay_ms);
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }

    Err(last_error)
}

/// 通过 Rust 后端代理阿里云实时语音识别 WebSocket（带重试和错误处理增强）
/// 返回完整的识别文本
#[tauri::command]
pub async fn transcribe_realtime_aliyun(
    api_key: String,
    model: Option<String>,
    audio_data: Vec<u8>,
) -> Result<String, String> {
    println!("[Aliyun WS] Starting transcription, audio: {} bytes", audio_data.len());

    if api_key.is_empty() {
        return Err("DashScope API Key 未配置".to_string());
    }

    if audio_data.is_empty() {
        return Err("音频数据为空".to_string());
    }

    let speech_model = model
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "paraformer-realtime-v2".to_string());

    // 生成 task_id
    let task_id = uuid::Uuid::new_v4().to_string().replace("-", "");

    println!("[Aliyun WS] Connecting to WebSocket with retry...");
    let start = std::time::Instant::now();

    // 使用重试机制连接（最多3次尝试）
    let ws_stream = connect_with_retry(&api_key, 2).await?;

    println!("[Aliyun WS] Connected in {:?}", start.elapsed());
    
    let (mut write, mut read) = ws_stream.split();

    // 发送 run-task 指令
    let run_task = RunTaskMessage {
        header: RunTaskHeader {
            action: "run-task".to_string(),
            task_id: task_id.clone(),
            streaming: "duplex".to_string(),
        },
        payload: RunTaskPayload {
            task_group: "audio".to_string(),
            task: "asr".to_string(),
            function: "recognition".to_string(),
            model: speech_model,
            parameters: TaskParameters {
                format: "pcm".to_string(),
                sample_rate: 16000,
            },
            input: serde_json::json!({}),
        },
    };

    let run_task_json = serde_json::to_string(&run_task)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    
    println!("[Aliyun WS] Sending run-task...");
    write.send(tungstenite::Message::Text(run_task_json.into()))
        .await
        .map_err(|e| format!("Send run-task failed: {}", e))?;

    // 用于通知发送任务开始的 channel
    let (tx_start, rx_start) = oneshot::channel::<()>();
    oneshot::channel::<Result<String, String>>();
    
    // 克隆数据给发送任务
    let audio_for_send = audio_data.clone();
    let task_id_for_send = task_id.clone();

    // 启动发送任务（在收到 task-started 后执行）
    let send_task = tokio::spawn(async move {
        // 等待 task-started 信号
        if rx_start.await.is_err() {
            println!("[Aliyun WS] Send task cancelled");
            return;
        }
        
        println!("[Aliyun WS] Sending {} bytes of audio...", audio_for_send.len());
        
        // 分块发送音频
        let chunk_size = 3200; // ~100ms of 16kHz 16-bit audio
        for (i, chunk) in audio_for_send.chunks(chunk_size).enumerate() {
            if let Err(e) = write.send(tungstenite::Message::Binary(chunk.to_vec().into())).await {
                println!("[Aliyun WS] Send audio failed at chunk {}: {}", i, e);
                return;
            }
            // 短暂延迟，模拟实时发送
            tokio::time::sleep(tokio::time::Duration::from_millis(20)).await;
        }
        
        println!("[Aliyun WS] Audio sent, sending finish-task...");
        
        // 发送 finish-task
        let finish_task = FinishTaskMessage {
            header: FinishTaskHeader {
                action: "finish-task".to_string(),
                task_id: task_id_for_send,
                streaming: "duplex".to_string(),
            },
            payload: FinishTaskPayload {
                input: serde_json::json!({}),
            },
        };
        
        if let Ok(finish_json) = serde_json::to_string(&finish_task) {
            if let Err(e) = write.send(tungstenite::Message::Text(finish_json.into())).await {
                println!("[Aliyun WS] Send finish-task failed: {}", e);
            } else {
                println!("[Aliyun WS] finish-task sent");
            }
        }
    });

    // 接收任务
    let mut full_text = String::new();
    let mut tx_start = Some(tx_start);
    
    // 设置超时
    let timeout = tokio::time::Duration::from_secs(60);
    let start_time = std::time::Instant::now();
    
    while let Some(msg) = read.next().await {
        if start_time.elapsed() > timeout {
            println!("[Aliyun WS] Timeout!");
            break;
        }
        
        match msg {
            Ok(tungstenite::Message::Text(text)) => {
                let text_str = text.to_string();
                let preview_len = text_str.len().min(150);
                println!("[Aliyun WS] Received: {}...", &text_str[..preview_len]);
                
                if let Ok(response) = serde_json::from_str::<ResponseMessage>(&text_str) {
                    if let Some(header) = &response.header {
                        match header.event.as_deref() {
                            Some("task-started") => {
                                println!("[Aliyun WS] Task started!");
                                // 通知发送任务开始
                                if let Some(tx) = tx_start.take() {
                                    let _ = tx.send(());
                                }
                            }
                            Some("result-generated") => {
                                if let Some(payload) = &response.payload {
                                    if let Some(output) = &payload.output {
                                        if let Some(sentence) = &output.sentence {
                                            if sentence.sentence_end == Some(true) {
                                                if let Some(text) = &sentence.text {
                                                    full_text.push_str(text);
                                                    println!("[Aliyun WS] Sentence: {}", text);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            Some("task-finished") => {
                                println!("[Aliyun WS] Task finished, total time: {:?}", start.elapsed());
                                println!("[Aliyun WS] Full text: {}", full_text);
                                send_task.abort(); // 终止发送任务
                                return Ok(full_text);
                            }
                            Some("task-failed") => {
                                let error = header.error_message.as_ref()
                                    .or(header.message.as_ref())
                                    .map(|s| s.as_str())
                                    .unwrap_or("Unknown error");
                                println!("[Aliyun WS] Task failed: {}", error);
                                send_task.abort();
                                return Err(format!("识别失败: {}", error));
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(tungstenite::Message::Close(_)) => {
                println!("[Aliyun WS] Connection closed by server");
                break;
            }
            Err(e) => {
                println!("[Aliyun WS] Error: {}", e);
                send_task.abort();
                return Err(format!("WebSocket error: {}", e));
            }
            _ => {}
        }
    }

    send_task.abort();

    if full_text.is_empty() {
        Err("未能获取识别结果".to_string())
    } else {
        Ok(full_text)
    }
}

// ===== Realtime streaming commands =====

/// Start a realtime speech recognition session.
/// Opens WebSocket, sends run-task, and spawns a background task that:
/// - Receives audio chunks via mpsc channel
/// - Forwards them to the WebSocket
/// - Emits `speech-realtime-text` events with intermediate results
#[tauri::command]
pub async fn start_realtime_speech(
    api_key: String,
    model: Option<String>,
    state: tauri::State<'_, RealtimeSpeechSessionState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // Check if already running
    {
        let tx = state.cmd_tx.lock().await;
        if tx.is_some() {
            return Err("实时语音会话已在运行".to_string());
        }
    }

    if api_key.is_empty() {
        return Err("DashScope API Key 未配置".to_string());
    }

    let speech_model = model
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "paraformer-realtime-v2".to_string());

    let task_id = uuid::Uuid::new_v4().to_string().replace("-", "");

    println!("[RealtimeSpeech] Starting streaming session, task_id: {}", task_id);

    // Connect WebSocket
    let ws_stream = connect_with_retry(&api_key, 2).await?;
    let (mut ws_write, mut ws_read) = ws_stream.split();

    // Send run-task
    let run_task = RunTaskMessage {
        header: RunTaskHeader {
            action: "run-task".to_string(),
            task_id: task_id.clone(),
            streaming: "duplex".to_string(),
        },
        payload: RunTaskPayload {
            task_group: "audio".to_string(),
            task: "asr".to_string(),
            function: "recognition".to_string(),
            model: speech_model,
            parameters: TaskParameters {
                format: "pcm".to_string(),
                sample_rate: 16000,
            },
            input: serde_json::json!({}),
        },
    };

    let run_task_json = serde_json::to_string(&run_task)
        .map_err(|e| format!("JSON serialize error: {}", e))?;

    ws_write
        .send(tungstenite::Message::Text(run_task_json.into()))
        .await
        .map_err(|e| format!("Send run-task failed: {}", e))?;

    // Create channels
    let (cmd_tx, mut cmd_rx) = mpsc::channel::<SpeechCmd>(256);
    let (result_tx, result_rx) = oneshot::channel::<String>();

    // Store state
    *state.cmd_tx.lock().await = Some(cmd_tx);
    *state.result_rx.lock().await = Some(result_rx);

    let task_id_for_finish = task_id.clone();

    // Spawn background task
    tokio::spawn(async move {
        let mut full_text = String::new();
        let mut task_started = false;
        let mut audio_buffer: Vec<Vec<u8>> = Vec::new();

        loop {
            tokio::select! {
                cmd = cmd_rx.recv() => {
                    match cmd {
                        Some(SpeechCmd::Audio(data)) => {
                            if task_started {
                                if let Err(e) = ws_write.send(tungstenite::Message::Binary(data.into())).await {
                                    println!("[RealtimeSpeech] Send audio failed: {}", e);
                                    break;
                                }
                            } else {
                                audio_buffer.push(data);
                            }
                        }
                        Some(SpeechCmd::Finish) => {
                            println!("[RealtimeSpeech] Finish requested");
                            let finish_task = FinishTaskMessage {
                                header: FinishTaskHeader {
                                    action: "finish-task".to_string(),
                                    task_id: task_id_for_finish.clone(),
                                    streaming: "duplex".to_string(),
                                },
                                payload: FinishTaskPayload {
                                    input: serde_json::json!({}),
                                },
                            };
                            if let Ok(json) = serde_json::to_string(&finish_task) {
                                let _ = ws_write.send(tungstenite::Message::Text(json.into())).await;
                            }
                        }
                        None => {
                            println!("[RealtimeSpeech] Command channel closed");
                            break;
                        }
                    }
                }
                msg = ws_read.next() => {
                    match msg {
                        Some(Ok(tungstenite::Message::Text(text))) => {
                            let text_str = text.to_string();
                            if let Ok(response) = serde_json::from_str::<ResponseMessage>(&text_str) {
                                if let Some(header) = &response.header {
                                    match header.event.as_deref() {
                                        Some("task-started") => {
                                            println!("[RealtimeSpeech] Task started");
                                            task_started = true;
                                            // Flush buffered audio
                                            for chunk in audio_buffer.drain(..) {
                                                if let Err(e) = ws_write.send(tungstenite::Message::Binary(chunk.into())).await {
                                                    println!("[RealtimeSpeech] Flush buffered audio failed: {}", e);
                                                    break;
                                                }
                                            }
                                        }
                                        Some("result-generated") => {
                                            if let Some(payload) = &response.payload {
                                                if let Some(output) = &payload.output {
                                                    if let Some(sentence) = &output.sentence {
                                                        let is_end = sentence.sentence_end == Some(true);
                                                        if let Some(text) = &sentence.text {
                                                            if is_end {
                                                                full_text.push_str(text);
                                                            }
                                                            // Emit event to frontend
                                                            let _ = app_handle.emit("speech-realtime-text", SpeechTextEvent {
                                                                text: text.clone(),
                                                                is_sentence_end: is_end,
                                                            });
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Some("task-finished") => {
                                            println!("[RealtimeSpeech] Task finished, full text: {}", full_text);
                                            let _ = result_tx.send(full_text);
                                            return;
                                        }
                                        Some("task-failed") => {
                                            let error = header.error_message.as_ref()
                                                .or(header.message.as_ref())
                                                .map(|s| s.as_str())
                                                .unwrap_or("Unknown error");
                                            println!("[RealtimeSpeech] Task failed: {}", error);
                                            let _ = result_tx.send(full_text);
                                            return;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                        Some(Ok(tungstenite::Message::Close(_))) => {
                            println!("[RealtimeSpeech] WebSocket closed by server");
                            break;
                        }
                        Some(Err(e)) => {
                            println!("[RealtimeSpeech] WebSocket error: {}", e);
                            break;
                        }
                        None => {
                            println!("[RealtimeSpeech] WebSocket stream ended");
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        // If we break out of loop without sending result, send what we have
        let _ = result_tx.send(full_text);
    });

    Ok(())
}

/// Send an audio chunk to the active realtime speech session
#[tauri::command]
pub async fn send_speech_chunk(
    audio_data: Vec<u8>,
    state: tauri::State<'_, RealtimeSpeechSessionState>,
) -> Result<(), String> {
    let tx = state.cmd_tx.lock().await;
    if let Some(tx) = tx.as_ref() {
        tx.send(SpeechCmd::Audio(audio_data))
            .await
            .map_err(|_| "语音会话已关闭".to_string())?;
        Ok(())
    } else {
        Err("无活跃的语音会话".to_string())
    }
}

/// Stop the realtime speech session and return the final transcription
#[tauri::command]
pub async fn stop_realtime_speech(
    state: tauri::State<'_, RealtimeSpeechSessionState>,
) -> Result<String, String> {
    // Send finish command
    {
        let tx = state.cmd_tx.lock().await;
        if let Some(tx) = tx.as_ref() {
            let _ = tx.send(SpeechCmd::Finish).await;
        }
    }

    // Take the result receiver
    let rx = state.result_rx.lock().await.take();

    // Clean up cmd_tx
    *state.cmd_tx.lock().await = None;

    if let Some(rx) = rx {
        match tokio::time::timeout(tokio::time::Duration::from_secs(30), rx).await {
            Ok(Ok(text)) => Ok(text),
            Ok(Err(_)) => Err("语音会话结果通道已关闭".to_string()),
            Err(_) => Err("等待语音识别结果超时".to_string()),
        }
    } else {
        Err("无活跃的语音会话".to_string())
    }
}
