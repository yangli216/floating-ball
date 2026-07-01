import { getCachedBootstrap } from '../regionalClient';
import {
  DEFAULT_LLM_CONFIG,
  type LLMConfigOverride,
} from './types';

export function getLLMConfig() {
  const bootstrap = getCachedBootstrap();
  if (bootstrap?.llm) {
    return {
      model: bootstrap.llm.model,
      fastModel: bootstrap.llm.fastModel || bootstrap.llm.model,
      audioModel: bootstrap.llm.audioModel || DEFAULT_LLM_CONFIG.audioModel,
      enableThinking: bootstrap.llm.enableThinking ?? false,
    };
  }
  return { ...DEFAULT_LLM_CONFIG };
}

export function getReviewerLLMConfig(): LLMConfigOverride {
  return {
    configProfile: 'reviewer',
  };
}
