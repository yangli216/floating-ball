use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite};
use futures_util::{StreamExt, SinkExt};
use tokio::sync::oneshot;

const DASHSCOPE_WS_URL: &str = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/";

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

/// 通过 Rust 后端代理阿里云实时语音识别 WebSocket
/// 返回完整的识别文本
#[tauri::command]
pub async fn transcribe_realtime_aliyun(
    api_key: String,
    audio_data: Vec<u8>,
) -> Result<String, String> {
    println!("[Aliyun WS] Starting transcription, audio: {} bytes", audio_data.len());
    
    if api_key.is_empty() {
        return Err("DashScope API Key 未配置".to_string());
    }

    // 生成 task_id
    let task_id = uuid::Uuid::new_v4().to_string().replace("-", "");
    
    // 创建带认证 header 的请求
    let request = tungstenite::http::Request::builder()
        .uri(DASHSCOPE_WS_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Host", "dashscope.aliyuncs.com")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tungstenite::handshake::client::generate_key())
        .body(())
        .map_err(|e| format!("Request build error: {}", e))?;

    println!("[Aliyun WS] Connecting to WebSocket...");
    let start = std::time::Instant::now();
    
    let (ws_stream, _) = connect_async(request)
        .await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;
    
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
            model: "paraformer-realtime-v2".to_string(),
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
    let (tx_result, rx_result) = oneshot::channel::<Result<String, String>>();
    
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
