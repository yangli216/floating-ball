import { getCachedBootstrap, isRegionalMode } from '../regionalClient';
import {
  DEFAULT_LLM_CONFIG,
  type LLMConfigOverride,
  type ResolvedLLMConfig,
} from './types';

export function getLLMConfig() {
  if (isRegionalMode()) {
    const bootstrap = getCachedBootstrap();
    if (bootstrap?.llm) {
      return {
        apiKey: '__REGIONAL_PROXY__',
        baseUrl: bootstrap.llm.baseUrl,
        audioBaseUrl: bootstrap.llm.audioBaseUrl || bootstrap.llm.baseUrl,
        model: bootstrap.llm.model,
        fastModel: bootstrap.llm.fastModel || bootstrap.llm.model,
        audioModel: bootstrap.llm.audioModel || DEFAULT_LLM_CONFIG.audioModel,
        enableThinking: bootstrap.llm.enableThinking ?? false,
      };
    }
  }

  const apiKey = localStorage.getItem("OPENAI_API_KEY") || import.meta.env.VITE_OPENAI_API_KEY || "";
  const baseUrl = (localStorage.getItem("LLM_BASE_URL") || import.meta.env.VITE_LLM_BASE_URL || DEFAULT_LLM_CONFIG.baseUrl).replace(/\/+$/, "");
  const audioBaseUrl = (
    localStorage.getItem("LLM_AUDIO_BASE_URL")
    || import.meta.env.VITE_LLM_AUDIO_BASE_URL
    || baseUrl
  ).replace(/\/+$/, "");
  const model = localStorage.getItem("LLM_MODEL") || import.meta.env.VITE_LLM_MODEL || DEFAULT_LLM_CONFIG.model;
  const fastModel = localStorage.getItem("LLM_FAST_MODEL") || import.meta.env.VITE_LLM_FAST_MODEL || model || DEFAULT_LLM_CONFIG.fastModel;
  const audioModel = localStorage.getItem("LLM_AUDIO_MODEL") || import.meta.env.VITE_LLM_AUDIO_MODEL || DEFAULT_LLM_CONFIG.audioModel;
  const enableThinking = ["true", "1", "on"].includes(
    String(localStorage.getItem("LLM_ENABLE_THINKING") || import.meta.env.VITE_LLM_ENABLE_THINKING || DEFAULT_LLM_CONFIG.enableThinking)
      .trim()
      .toLowerCase()
  );

  return { apiKey, baseUrl, audioBaseUrl, model, fastModel, audioModel, enableThinking };
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

export function getConfigAndKey(explicitKey?: string, customConfig?: LLMConfigOverride): ResolvedLLMConfig {
  const baseConfig = getLLMConfig();
  const apiKey = customConfig?.apiKey || explicitKey || baseConfig.apiKey;
  const baseUrl = customConfig?.baseUrl || baseConfig.baseUrl;
  const audioBaseUrl = customConfig?.audioBaseUrl || baseConfig.audioBaseUrl;
  const model = customConfig?.model || baseConfig.model;
  const fastModel = customConfig?.fastModel || baseConfig.fastModel;
  const audioModel = customConfig?.audioModel || baseConfig.audioModel;
  const enableThinking = customConfig?.enableThinking ?? baseConfig.enableThinking;

  if (!apiKey && !isRegionalMode()) throw new Error("缺少 API Key。请在 .env 设置 VITE_OPENAI_API_KEY 或在 localStorage 设置 OPENAI_API_KEY（以及独立审查AI的配置）。");
  return { key: apiKey, baseUrl, audioBaseUrl, model, fastModel, audioModel, enableThinking };
}
