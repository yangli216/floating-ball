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
  fastModel: "gpt-4o-mini",
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

import { invoke } from '@tauri-apps/api/core';
import { PROMPTS } from '../prompts';
import {
  isRegionalMode,
  getCachedBootstrap,
  createRegionalSSE,
  regionalPost,
  buildRegionalSpeechUploadPayload,
} from './regionalClient';
import { beginAiTrace, failAiTrace, finishAiTrace } from './aiTrace';

// 获取配置信息
export function getLLMConfig() {
  // 区域化模式：从 bootstrap 配置获取（密钥不下发到端，由后端代理处理）
  if (isRegionalMode()) {
    const bootstrap = getCachedBootstrap();
    if (bootstrap?.llm) {
      return {
        apiKey: '__REGIONAL_PROXY__', // 占位符，实际请求走后端代理
        baseUrl: bootstrap.llm.baseUrl,
        audioBaseUrl: bootstrap.llm.audioBaseUrl || bootstrap.llm.baseUrl,
        model: bootstrap.llm.model,
        fastModel: bootstrap.llm.fastModel || bootstrap.llm.model,
        audioModel: bootstrap.llm.audioModel || DEFAULT_LLM_CONFIG.audioModel,
      };
    }
  }

  const apiKey = localStorage.getItem("OPENAI_API_KEY") || import.meta.env.VITE_OPENAI_API_KEY || "";
  // 默认为 OpenAI 官方地址和模型
  const baseUrl = (localStorage.getItem("LLM_BASE_URL") || import.meta.env.VITE_LLM_BASE_URL || DEFAULT_LLM_CONFIG.baseUrl).replace(/\/+$/, "");
  const audioBaseUrl = (
    localStorage.getItem("LLM_AUDIO_BASE_URL")
    || import.meta.env.VITE_LLM_AUDIO_BASE_URL
    || baseUrl
  ).replace(/\/+$/, "");
  const model = localStorage.getItem("LLM_MODEL") || import.meta.env.VITE_LLM_MODEL || DEFAULT_LLM_CONFIG.model;
  const fastModel = localStorage.getItem("LLM_FAST_MODEL") || import.meta.env.VITE_LLM_FAST_MODEL || model || DEFAULT_LLM_CONFIG.fastModel;
  const audioModel = localStorage.getItem("LLM_AUDIO_MODEL") || import.meta.env.VITE_LLM_AUDIO_MODEL || DEFAULT_LLM_CONFIG.audioModel;

  return { apiKey, baseUrl, audioBaseUrl, model, fastModel, audioModel };
}

export interface LLMConfigOverride {
  apiKey?: string;
  baseUrl?: string;
  audioBaseUrl?: string;
  model?: string;
  fastModel?: string;
  audioModel?: string;
  configProfile?: 'default' | 'reviewer';
  traceContext?: {
    scene?: string;
    sourceModule?: string;
    operationModule?: string;
    operationAction?: string;
    title?: string;
  };
}

export function getReviewerLLMConfig(): LLMConfigOverride {
  if (isRegionalMode()) {
    return {
      configProfile: 'reviewer',
    };
  }
  const apiKey = localStorage.getItem("REVIEWER_API_KEY") || undefined;
  const baseUrl = localStorage.getItem("REVIEWER_BASE_URL") || undefined;
  const model = localStorage.getItem("REVIEWER_MODEL") || undefined;
  return {
    apiKey,
    baseUrl,
    model,
    configProfile: 'reviewer',
  };
}

function getConfigAndKey(explicitKey?: string, customConfig?: LLMConfigOverride) {
  const baseConfig = getLLMConfig();
  const apiKey = customConfig?.apiKey || explicitKey || baseConfig.apiKey;
  const baseUrl = customConfig?.baseUrl || baseConfig.baseUrl;
  const audioBaseUrl = customConfig?.audioBaseUrl || baseConfig.audioBaseUrl;
  const model = customConfig?.model || baseConfig.model;
  const fastModel = customConfig?.fastModel || baseConfig.fastModel;
  const audioModel = customConfig?.audioModel || baseConfig.audioModel;

  // 区域化模式下 apiKey 是占位符，不校验
  if (!apiKey && !isRegionalMode()) throw new Error("缺少 API Key。请在 .env 设置 VITE_OPENAI_API_KEY 或在 localStorage 设置 OPENAI_API_KEY（以及独立审查AI的配置）。");
  return { key: apiKey, baseUrl, audioBaseUrl, model, fastModel, audioModel };
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

function summarizeText(value: string, limit = 120): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function buildChatRequestSummary(messages: ChatMessage[]): string {
  const userMessages = messages.filter(item => item.role === 'user');
  const lastUserMessage = [...userMessages].reverse().find(item => item.content.trim());
  const imageCount = messages.reduce((total, item) => total + (item.images?.length || 0), 0);
  return [
    `${messages.length} 条消息`,
    `${userMessages.length} 条用户输入`,
    imageCount > 0 ? `${imageCount} 张图片` : '',
    lastUserMessage?.content ? `最新输入：${summarizeText(lastUserMessage.content, 80)}` : '',
  ].filter(Boolean).join('，');
}

function buildSpeechRequestSummary(fileName: string, scene: string, mimeType?: string): string {
  return [`场景 ${scene}`, `文件 ${fileName}`, mimeType ? `格式 ${mimeType}` : ''].filter(Boolean).join('，');
}

function extractSseDataPayload(line: string): string | null {
  if (!line.startsWith("data:")) {
    return null;
  }
  return line.slice(5).trimStart();
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
  // 区域化模式：通过后端 AI 代理
  if (isRegionalMode() && !customConfig?.apiKey) {
    const payloadMessages = createPayloadMessages(messages);
    const traceScene = customConfig?.traceContext?.scene || 'chat';
    const traceSourceModule = customConfig?.traceContext?.sourceModule || 'llm';
    const trace = beginAiTrace({
      channel: 'chat',
      scene: traceScene,
      sourceModule: traceSourceModule,
      operationModule: customConfig?.traceContext?.operationModule,
      operationAction: customConfig?.traceContext?.operationAction,
      title: customConfig?.traceContext?.title,
      configProfile: customConfig?.configProfile || 'default',
      model: getCachedBootstrap()?.llm?.model,
      requestSummary: buildChatRequestSummary(messages),
    });
    let responseText = '';
    try {
      await retryWithBackoff(async () => {
        await createRegionalSSE('/v1/ai/chat', {
          configProfile: customConfig?.configProfile || 'default',
          messages: payloadMessages,
          stream: true,
          traceId: trace.traceId,
          scene: traceScene,
          sourceModule: traceSourceModule,
          sessionId: trace.sessionId,
        }, (chunk) => {
          responseText += chunk;
          onChunk(chunk);
        });
      }, retryConfig || DEFAULT_RETRY_CONFIG, onRetry);
      finishAiTrace(trace.traceId, {
        success: true,
        responseSummary: summarizeText(responseText, 160) || '流式响应已完成',
      });
    } catch (error) {
      failAiTrace(trace.traceId, error instanceof Error ? error.message : String(error));
      throw error;
    }
    return;
  }

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
  // 区域化模式：通过后端 AI 代理
  if (isRegionalMode() && !customConfig?.apiKey) {
    const payloadMessages = createPayloadMessages(messages);
    const traceScene = customConfig?.traceContext?.scene || 'chat';
    const traceSourceModule = customConfig?.traceContext?.sourceModule || 'llm';
    const trace = beginAiTrace({
      channel: 'chat',
      scene: traceScene,
      sourceModule: traceSourceModule,
      operationModule: customConfig?.traceContext?.operationModule,
      operationAction: customConfig?.traceContext?.operationAction,
      title: customConfig?.traceContext?.title,
      configProfile: customConfig?.configProfile || 'default',
      model: getCachedBootstrap()?.llm?.model,
      requestSummary: buildChatRequestSummary(messages),
    });
    try {
      const content = await retryWithBackoff(async () => {
        const resp = await regionalPost<{ content: string }>('/v1/ai/chat', {
          configProfile: customConfig?.configProfile || 'default',
          messages: payloadMessages,
          stream: false,
          traceId: trace.traceId,
          scene: traceScene,
          sourceModule: traceSourceModule,
          sessionId: trace.sessionId,
        });
        return resp.content;
      }, retryConfig || DEFAULT_RETRY_CONFIG, onRetry);
      finishAiTrace(trace.traceId, {
        success: true,
        responseSummary: summarizeText(content, 160) || '非流式响应为空',
      });
      return content;
    } catch (error) {
      failAiTrace(trace.traceId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

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
        "enable_thinking": false,
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

// 快速/轻量级模型对话（适用于后台异步任务、总结等对响应时间要求高的场景）
export async function chatFast(
  messages: ChatMessage[],
  apiKey?: string,
  retryConfig?: RetryConfig,
  onRetry?: (attempt: number, error: any) => void,
  customConfig?: LLMConfigOverride
): Promise<string> {
  const { fastModel } = getConfigAndKey(apiKey, customConfig);
  // 复用 chat 逻辑，强制覆盖 model 为 fastModel
  return chat(messages, apiKey, retryConfig, onRetry, { ...customConfig, model: fastModel });
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
  // 区域化模式：通过后端语音代理
  if (isRegionalMode() && !customConfig?.apiKey) {
    const scene = 'chat-input';
    const fileName = `${scene}-${Date.now()}.webm`;
    const trace = beginAiTrace({
      channel: 'speech_transcribe',
      scene,
      sourceModule: 'llm',
      model: getCachedBootstrap()?.llm?.audioModel,
      requestSummary: buildSpeechRequestSummary(fileName, scene, blob.type || 'audio/webm'),
    });
    try {
      const text = await retryWithBackoff(async () => {
        const payload = await buildRegionalSpeechUploadPayload(blob, {
          mimeType: blob.type || 'audio/webm',
          scene,
          fileName,
        });
        const resp = await regionalPost<{ text: string }>(
          '/v1/ai/speech/transcribe',
          {
            ...payload,
            traceId: trace.traceId,
            sourceModule: 'llm',
            sessionId: trace.sessionId,
          }
        );
        return resp.text;
      }, retryConfig || DEFAULT_RETRY_CONFIG, onRetry);
      finishAiTrace(trace.traceId, {
        success: true,
        responseSummary: summarizeText(text, 160) || '转写结果为空',
      });
      return text;
    } catch (error) {
      failAiTrace(trace.traceId, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

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
  const messages: ChatMessage[] = [
    { role: 'system', content: PROMPTS.consultation.patientRiskAnalysis.system },
    { role: 'user', content: PROMPTS.consultation.patientRiskAnalysis.buildUserPrompt(patientData) }
  ];

  try {
    const response = await chat(messages, apiKey, undefined, undefined, {
      traceContext: {
        scene: 'reception-risk-analysis',
        sourceModule: 'reception_risk_analysis',
        operationModule: 'reception',
        operationAction: 'analyze_patient_risk',
        title: '接待风险评估',
      },
    });
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
