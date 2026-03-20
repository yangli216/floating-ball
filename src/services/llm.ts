export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[]; // data URLs or public URLs
  // Feedback tracking fields (optional, backward compatible)
  messageId?: string;
  sessionId?: string;
  tokenCount?: number;
  llmModel?: string;
  latencyMs?: number;
  createdAt?: number;
}

export const DEFAULT_LLM_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  audioBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  audioModel: "whisper-1"
};

// 重试配置
export interface RetryConfig {
  maxRetries: number;        // 最大重试次数
  initialDelay: number;      // 初始延迟（毫秒）
  maxDelay: number;          // 最大延迟（毫秒）
  backoffMultiplier: number; // 退避倍数
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};

// 判断错误是否可重试
function isRetryableError(error: any): boolean {
  // 网络错误
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // HTTP 状态码：429 (速率限制), 500, 502, 503, 504 (服务器错误)
  if (error.status) {
    return [429, 500, 502, 503, 504].includes(error.status);
  }

  // 错误消息中包含速率限制或服务器错误关键词
  const errorMessage = error.message?.toLowerCase() || '';
  const retryableKeywords = ['rate limit', 'timeout', 'overloaded', 'unavailable', 'server error'];
  return retryableKeywords.some(keyword => errorMessage.includes(keyword));
}

// 通用重试函数（指数退避）
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: any) => void
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // 如果是最后一次尝试或错误不可重试，直接抛出
      if (attempt === config.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      // 计算延迟时间（指数退避）
      const delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
        config.maxDelay
      );

      // 回调通知重试
      if (onRetry) {
        onRetry(attempt + 1, error);
      }

      console.warn(`API 调用失败，${delay}ms 后进行第 ${attempt + 1} 次重试:`, error.message || error);

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// 获取配置信息
export function getLLMConfig() {
  const apiKey = localStorage.getItem("OPENAI_API_KEY") || import.meta.env.VITE_OPENAI_API_KEY || "";
  // 默认为 OpenAI 官方地址和模型
  const baseUrl = (localStorage.getItem("LLM_BASE_URL") || import.meta.env.VITE_LLM_BASE_URL || DEFAULT_LLM_CONFIG.baseUrl).replace(/\/+$/, "");
  const audioBaseUrl = (
    localStorage.getItem("LLM_AUDIO_BASE_URL")
    || import.meta.env.VITE_LLM_AUDIO_BASE_URL
    || baseUrl
  ).replace(/\/+$/, "");
  const model = localStorage.getItem("LLM_MODEL") || import.meta.env.VITE_LLM_MODEL || DEFAULT_LLM_CONFIG.model;
  const audioModel = localStorage.getItem("LLM_AUDIO_MODEL") || import.meta.env.VITE_LLM_AUDIO_MODEL || DEFAULT_LLM_CONFIG.audioModel;

  return { apiKey, baseUrl, audioBaseUrl, model, audioModel };
}

export interface LLMConfigOverride {
  apiKey?: string;
  baseUrl?: string;
  audioBaseUrl?: string;
  model?: string;
  audioModel?: string;
}

export function getReviewerLLMConfig(): LLMConfigOverride {
  const apiKey = localStorage.getItem("REVIEWER_API_KEY") || undefined;
  const baseUrl = localStorage.getItem("REVIEWER_BASE_URL") || undefined;
  const model = localStorage.getItem("REVIEWER_MODEL") || undefined;
  return { apiKey, baseUrl, model };
}

function getConfigAndKey(explicitKey?: string, customConfig?: LLMConfigOverride) {
  const baseConfig = getLLMConfig();
  const apiKey = customConfig?.apiKey || explicitKey || baseConfig.apiKey;
  const baseUrl = customConfig?.baseUrl || baseConfig.baseUrl;
  const audioBaseUrl = customConfig?.audioBaseUrl || baseConfig.audioBaseUrl;
  const model = customConfig?.model || baseConfig.model;
  const audioModel = customConfig?.audioModel || baseConfig.audioModel;

  if (!apiKey) throw new Error("缺少 API Key。请在 .env 设置 VITE_OPENAI_API_KEY 或在 localStorage 设置 OPENAI_API_KEY（以及独立审查AI的配置）。");
  return { key: apiKey, baseUrl, audioBaseUrl, model, audioModel };
}

function createPayloadMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.images && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });
}

async function readErrorPayload(res: Response): Promise<any> {
  const rawText = await res.text();
  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch {
    return { error: { message: rawText } };
  }
}

export async function chatStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  apiKey?: string,
  retryConfig?: RetryConfig,
  onRetry?: (attempt: number, error: any) => void,
  customConfig?: LLMConfigOverride
): Promise<void> {
  const { key, baseUrl, model } = getConfigAndKey(apiKey, customConfig);
  const payloadMessages = createPayloadMessages(messages);

  // 使用重试机制包装整个流式请求
  await retryWithBackoff(async () => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model,
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

        // 处理多行数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // 保留未完整的最后一行

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const dataStr = trimmed.slice(6);
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
      // 流式读取过程中的错误也应该可重试
      reader.cancel();
      throw error;
    }
  }, retryConfig || DEFAULT_RETRY_CONFIG, onRetry);
}

// 带自动降级的流式对话（如果流式失败，自动回退到普通请求）
export async function chatStreamWithFallback(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  apiKey?: string,
  retryConfig?: RetryConfig,
  onRetry?: (attempt: number, error: any) => void,
  customConfig?: LLMConfigOverride
): Promise<void> {
  try {
    // 尝试流式请求
    await chatStream(messages, onChunk, apiKey, retryConfig, onRetry, customConfig);
  } catch (error) {
    console.warn("流式请求失败，降级到普通请求:", error);

    try {
      // 降级到普通请求
      const response = await chat(messages, apiKey, retryConfig, onRetry);
      // 模拟流式输出（按字符或按词输出）
      const chunkSize = 10; // 每次发送10个字符
      for (let i = 0; i < response.length; i += chunkSize) {
        onChunk(response.slice(i, i + chunkSize));
        // 添加小延迟以模拟流式效果
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    } catch (fallbackError) {
      console.error("降级请求也失败:", fallbackError);
      throw fallbackError;
    }
  }
}

// 文本与图像的对话（基于 Chat Completions）
export async function chat(
  messages: ChatMessage[],
  apiKey?: string,
  retryConfig?: RetryConfig,
  onRetry?: (attempt: number, error: any) => void,
  customConfig?: LLMConfigOverride
): Promise<string> {
  const { key, baseUrl, model } = getConfigAndKey(apiKey, customConfig);
  const payloadMessages = createPayloadMessages(messages);

  return await retryWithBackoff(async () => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model,
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
  }, retryConfig || DEFAULT_RETRY_CONFIG, onRetry);
}

// 语音转文字（Whisper）
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
  const { invoke } = await import('@tauri-apps/api/core');
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

export async function transcribeAudio(
  blob: Blob,
  apiKey?: string,
  retryConfig?: RetryConfig,
  onRetry?: (attempt: number, error: any) => void,
  customConfig?: LLMConfigOverride
): Promise<string> {
  const { key, audioBaseUrl, audioModel } = getConfigAndKey(apiKey, customConfig);
  const file = new File([blob], "audio.webm", { type: blob.type || "audio/webm" });
  const endpoint = `${audioBaseUrl}/audio/transcriptions`;

  return await retryWithBackoff(async () => {
    try {
      return await transcribeAudioViaTauri(file, key, audioBaseUrl, audioModel);
    } catch (tauriError) {
      if (!canFallbackToFrontendTranscription(tauriError)) {
        throw tauriError;
      }
      console.warn('[LLM] Tauri transcription unavailable, fallback to frontend fetch:', tauriError);
    }

    const form = new FormData();
    form.append("file", file);
    form.append("model", audioModel);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
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
  }, retryConfig || DEFAULT_RETRY_CONFIG, onRetry);
}

export interface RiskAnalysisItem {
  level: 1 | 2 | 3;
  category: 'allergy' | 'chronic' | 'medication' | 'population' | 'vital' | 'other';
  content: string;
}

export async function analyzePatientRisks(patientData: any, apiKey?: string): Promise<RiskAnalysisItem[]> {
  // Import prompts
  const { PROMPTS } = await import('../prompts');

  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPTS.consultation.patientRiskAnalysis.system },
    { role: 'user', content: PROMPTS.consultation.patientRiskAnalysis.buildUserPrompt(patientData) }
  ];

  try {
    const response = await chat(messages, apiKey);
    const cleanJson = response.replace(/```json\n?|\n?```/g, '').trim();
    // Keep only the array part if surrounded by text
    const jsonMatch = cleanJson.match(/\[[\s\S]*\]/);
    const targetJson = jsonMatch ? jsonMatch[0] : cleanJson;

    return JSON.parse(targetJson);
  } catch (e) {
    console.error('Risk analysis failed:', e);
    // Return a fallback risk item to indicate failure
    return [{
      level: 3,
      category: 'other',
      content: '风险评估服务暂时不可用'
    }];
  }
}

export async function testLLMConnection(customConfig?: LLMConfigOverride): Promise<{ success: boolean; message: string }> {
  try {
    const messages: ChatMessage[] = [{ role: 'user', content: '您好，这只是一条测试消息，只需回复“测试成功”即可。' }];
    const response = await chat(messages, undefined, undefined, undefined, customConfig);
    if (response) {
      return { success: true, message: '连接成功！模型响应正常。' };
    } else {
      return { success: false, message: '请求成功，但模型未返回任何内容。' };
    }
  } catch (error: any) {
    return { success: false, message: error.message || '连接失败或配置有误' };
  }
}
