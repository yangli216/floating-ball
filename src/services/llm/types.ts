export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  images?: string[];
  messageId?: string;
  sessionId?: string;
  tokenCount?: number;
  llmModel?: string;
  latencyMs?: number;
  createdAt?: number;
  isDefault?: boolean;
}

export const DEFAULT_LLM_CONFIG = {
  baseUrl: "https://api.openai.com/v1",
  audioBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  fastModel: "gpt-4o-mini",
  audioModel: "whisper-1",
  enableThinking: false,
};

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

export interface LLMConfigOverride {
  apiKey?: string;
  baseUrl?: string;
  audioBaseUrl?: string;
  model?: string;
  fastModel?: string;
  audioModel?: string;
  enableThinking?: boolean;
  configProfile?: 'default' | 'fast' | 'reviewer';
  traceContext?: {
    scene?: string;
    sourceModule?: string;
    operationModule?: string;
    operationAction?: string;
    title?: string;
  };
}

export interface ResolvedLLMConfig {
  key: string;
  baseUrl: string;
  audioBaseUrl: string;
  model: string;
  fastModel: string;
  audioModel: string;
  enableThinking: boolean;
}
