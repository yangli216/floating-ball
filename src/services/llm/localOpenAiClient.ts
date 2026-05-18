import { invoke } from '@tauri-apps/api/core';
import { readErrorPayload, extractSseDataPayload } from './payload';
import type { ResolvedLLMConfig } from './types';

export async function streamLocalChatCompletion(
  config: ResolvedLLMConfig,
  payloadMessages: unknown[],
  onChunk: (chunk: string) => void
): Promise<void> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      "enable_thinking": config.enableThinking,
      messages: payloadMessages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const data = await readErrorPayload(res);
    const error: any = new Error(data?.error?.message || res.statusText);
    error.status = res.status;
    throw error;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("无法获取流式响应");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const dataStr = extractSseDataPayload(trimmed);
        if (dataStr == null) continue;
        if (dataStr === "[DONE]") return;

        try {
          const json = JSON.parse(dataStr);
          const content = json.choices?.[0]?.delta?.content || "";
          if (content) onChunk(content);
        } catch (e) {
          console.warn("解析流式数据失败:", e);
        }
      }
    }
  } catch (error) {
    reader.cancel();
    throw error;
  }
}

export async function requestLocalChatCompletion(
  config: ResolvedLLMConfig,
  payloadMessages: unknown[]
): Promise<string> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify({
      model: config.model,
      "enable_thinking": config.enableThinking,
      messages: payloadMessages,
    }),
  });

  const data = await readErrorPayload(res);
  if (!res.ok) {
    const error: any = new Error(data?.error?.message || res.statusText);
    error.status = res.status;
    throw error;
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

function canFallbackToFrontendTranscription(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const fallbackSignals = [
    '__TAURI_INTERNALS__',
    'window.__TAURI_INTERNALS__',
    'Command transcribe_audio not found',
    'unknown IPC command',
    'not running in Tauri',
  ];
  return fallbackSignals.some((signal) => message.includes(signal));
}

function mapTranscriptionNetworkError(error: unknown, endpoint: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  if (
    lowered.includes('load failed')
    || lowered.includes('failed to fetch')
    || lowered.includes('networkerror')
  ) {
    return new Error(
      `语音转写网络请求失败（${endpoint}）。请检查 Base URL 是否可访问，并优先使用 HTTPS。`
    );
  }
  return error instanceof Error ? error : new Error(message);
}

async function transcribeAudioViaTauri(
  blob: Blob,
  key: string,
  audioBaseUrl: string,
  audioModel: string
): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioData = Array.from(new Uint8Array(arrayBuffer));

  return invoke<string>('transcribe_audio', {
    apiKey: key,
    baseUrl: audioBaseUrl,
    audioModel,
    audioData,
    mimeType: blob.type || 'audio/webm',
  });
}

export async function transcribeLocalAudio(blob: Blob, config: ResolvedLLMConfig): Promise<string> {
  const file = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
  const endpoint = `${config.audioBaseUrl}/audio/transcriptions`;

  try {
    return await transcribeAudioViaTauri(file, config.key, config.audioBaseUrl, config.audioModel);
  } catch (tauriError) {
    if (!canFallbackToFrontendTranscription(tauriError)) {
      throw tauriError;
    }
    console.warn('[LLM] Tauri transcription unavailable, fallback to frontend fetch:', tauriError);
  }

  const form = new FormData();
  form.append("file", file);
  form.append("model", config.audioModel);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}` },
      body: form,
    });
  } catch (networkError) {
    throw mapTranscriptionNetworkError(networkError, endpoint);
  }

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data?.error?.message || res.statusText);
    error.status = res.status;
    throw error;
  }
  return data?.text ?? "";
}
