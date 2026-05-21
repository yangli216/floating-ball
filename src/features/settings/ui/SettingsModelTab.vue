<script setup lang="ts">
import type { SpeechProvider } from '@services/speechConfig';
import Icon from '@shared/ui/Icon.vue';

interface ProviderPreset {
  name: string;
  baseUrl: string;
  model: string;
}

interface DefaultLlmConfig {
  baseUrl: string;
  model: string;
  fastModel: string;
}

interface DefaultSpeechConfig {
  baseUrl: string;
  model: string;
}

interface SpeechProviderOption {
  value: SpeechProvider;
  label: string;
  description: string;
}

interface SettingsTestResult {
  success: boolean;
  message: string;
}

type PmphaiSearchMode = 'rag' | 'list';

defineProps<{
  regionalMode: boolean;
  providerPresets: ProviderPreset[];
  defaultLlmConfig: DefaultLlmConfig;
  apiKey: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  enableThinking: boolean;
  modelTesting: boolean;
  modelTestResult: SettingsTestResult | null;
  speechProviderOptions: SpeechProviderOption[];
  speechProvider: SpeechProvider;
  speechApiKey: string;
  speechBaseUrl: string;
  speechModel: string;
  speechTestMode: boolean;
  defaultSpeechConfig: DefaultSpeechConfig;
  reviewerEnabled: boolean;
  reviewerApiKey: string;
  reviewerBaseUrl: string;
  reviewerModel: string;
  reviewerCheckExaminationEnabled: boolean;
  reviewerTesting: boolean;
  reviewerTestResult: SettingsTestResult | null;
  pmphaiEnabled: boolean;
  pmphaiAppKey: string;
  pmphaiAppSecret: string;
  pmphaiSearchMode: PmphaiSearchMode;
  pmphaiTesting: boolean;
  pmphaiTestResult: SettingsTestResult | null;
}>();

const emit = defineEmits<{
  'apply-preset': [preset: ProviderPreset];
  'update:apiKey': [value: string];
  'update:baseUrl': [value: string];
  'update:model': [value: string];
  'update:fastModel': [value: string];
  'update:enableThinking': [value: boolean];
  'update:speechProvider': [value: SpeechProvider];
  'update:speechApiKey': [value: string];
  'update:speechBaseUrl': [value: string];
  'update:speechModel': [value: string];
  'update:speechTestMode': [value: boolean];
  'update:reviewerEnabled': [value: boolean];
  'update:reviewerApiKey': [value: string];
  'update:reviewerBaseUrl': [value: string];
  'update:reviewerModel': [value: string];
  'update:reviewerCheckExaminationEnabled': [value: boolean];
  'update:pmphaiEnabled': [value: boolean];
  'update:pmphaiAppKey': [value: string];
  'update:pmphaiAppSecret': [value: string];
  'update:pmphaiSearchMode': [value: PmphaiSearchMode];
  'test-model-connection': [];
  'test-reviewer-connection': [];
  'test-pmphai-connection': [];
}>();

function readInputValue(event: Event): string {
  return (event.target as HTMLInputElement).value;
}

function readCheckboxValue(event: Event): boolean {
  return (event.target as HTMLInputElement).checked;
}
</script>

<template>
  <div class="tab-pane settings-model-tab">
    <div class="settings-section">
      <div class="section-header">
        <Icon icon="lucide:key" :size="20" />
        <h3>通用 LLM</h3>
      </div>
      <p class="section-desc section-desc-spaced">用于聊天、病历整理、推荐生成等文本大模型能力。</p>

      <div v-if="!regionalMode" class="preset-container">
        <label>快速填充常用服务商：</label>
        <div class="preset-buttons">
          <button
            v-for="preset in providerPresets"
            :key="preset.name"
            type="button"
            class="preset-btn"
            @click="emit('apply-preset', preset)"
          >
            {{ preset.name }}
          </button>
        </div>
      </div>

      <div v-if="!regionalMode" class="form-group">
        <label for="api-key">API Key <span class="required">*</span></label>
        <div class="input-with-icon">
          <Icon icon="lucide:key" :size="16" class="input-icon" />
          <input
            id="api-key"
            type="password"
            placeholder="sk-..."
            :value="apiKey"
            @input="emit('update:apiKey', readInputValue($event))"
          />
        </div>
        <p class="form-hint">文本大模型使用的 OpenAI 兼容 API 密钥。</p>
      </div>

      <div class="form-group">
        <label for="base-url">LLM Base URL</label>
        <div class="input-with-icon">
          <Icon icon="lucide:link" :size="16" class="input-icon" />
          <input
            id="base-url"
            type="text"
            :placeholder="defaultLlmConfig.baseUrl"
            :disabled="regionalMode"
            :value="baseUrl"
            @input="emit('update:baseUrl', readInputValue($event))"
          />
        </div>
        <p class="form-hint">{{ regionalMode ? '当前生效地址由服务端 bootstrap 下发' : '文本对话与结构化生成使用的 API 服务地址。' }}</p>
      </div>

      <div class="form-group">
        <label for="model-name">LLM Model</label>
        <div class="input-with-icon">
          <Icon icon="lucide:brain" :size="16" class="input-icon" />
          <input
            id="model-name"
            type="text"
            :placeholder="defaultLlmConfig.model"
            :disabled="regionalMode"
            :value="model"
            @input="emit('update:model', readInputValue($event))"
          />
        </div>
        <p class="form-hint">{{ regionalMode ? '当前生效模型由服务端统一维护' : '如 `gpt-4o-mini`、`deepseek-chat`、`qwen-plus`。' }}</p>
      </div>

      <div class="form-group">
        <label for="fast-model-name">chatFast Model</label>
        <div class="input-with-icon">
          <Icon icon="lucide:gauge" :size="16" class="input-icon" />
          <input
            id="fast-model-name"
            type="text"
            :placeholder="model || defaultLlmConfig.fastModel"
            :value="fastModel"
            @input="emit('update:fastModel', readInputValue($event))"
          />
        </div>
        <p class="form-hint">用于 `chatFast()` 的独立模型；留空时自动回退上方主模型。</p>
      </div>

      <div class="toggle-row">
        <div class="toggle-label-group">
          <label for="enable-thinking" class="toggle-label">启用思考模式</label>
          <span class="toggle-hint">仅本地直连 OpenAI 兼容接口时生效，区域化模式暂不支持。</span>
        </div>
        <div class="switch-wrapper">
          <input
            id="enable-thinking"
            type="checkbox"
            :checked="enableThinking"
            @change="emit('update:enableThinking', readCheckboxValue($event))"
          >
          <label for="enable-thinking" class="toggle-switch"></label>
        </div>
      </div>

      <div class="test-connection-row test-row-spaced">
        <button
          type="button"
          class="test-btn"
          :disabled="modelTesting || (!regionalMode && !apiKey)"
          @click="emit('test-model-connection')"
        >
          <Icon
            :icon="modelTesting ? 'lucide:loader-2' : 'lucide:wifi'"
            :size="16"
            :class="{ spin: modelTesting }"
          />
          {{ modelTesting ? '测试中...' : '测试连接' }}
        </button>
        <span v-if="modelTestResult" :class="['test-message', modelTestResult.success ? 'success' : 'error']">
          <Icon :icon="modelTestResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" :size="16" />
          {{ modelTestResult.message }}
        </span>
      </div>
    </div>

    <div class="settings-section model-section-offset">
      <div class="section-header">
        <Icon icon="lucide:audio-lines" :size="20" />
        <h3>语音转写</h3>
      </div>
      <p class="section-desc section-desc-spaced">聊天录音和语音接诊共用这一组配置。默认建议使用阿里云 DashScope。</p>

      <div class="form-group">
        <label>语音服务提供方</label>
        <div class="mode-selector">
          <button
            v-for="option in speechProviderOptions"
            :key="option.value"
            type="button"
            :class="['mode-option', { active: speechProvider === option.value }]"
            :disabled="regionalMode"
            @click="emit('update:speechProvider', option.value)"
          >
            <Icon :icon="option.value === 'aliyun-dashscope' ? 'lucide:radio' : 'lucide:mic'" :size="18" />
            <div class="mode-info">
              <span class="mode-title">{{ option.label }}</span>
              <span class="mode-desc">{{ option.description }}</span>
            </div>
          </button>
        </div>
      </div>

      <div v-if="!regionalMode" class="form-group">
        <label for="speech-api-key">语音 API Key</label>
        <div class="input-with-icon">
          <Icon icon="lucide:key" :size="16" class="input-icon" />
          <input
            id="speech-api-key"
            type="password"
            placeholder="sk-..."
            :value="speechApiKey"
            @input="emit('update:speechApiKey', readInputValue($event))"
          />
        </div>
        <p class="form-hint">
          <span v-if="speechProvider === 'aliyun-dashscope'">阿里云 DashScope 的 API Key，语音接诊会优先使用实时识别。</span>
          <span v-else>OpenAI 兼容语音转写接口使用的 API Key；留空时默认复用上方 LLM API Key。</span>
        </p>
      </div>

      <div v-if="speechProvider === 'openai-compatible'" class="form-group">
        <label for="speech-base-url">语音 Base URL</label>
        <div class="input-with-icon">
          <Icon icon="lucide:link" :size="16" class="input-icon" />
          <input
            id="speech-base-url"
            type="text"
            :placeholder="defaultSpeechConfig.baseUrl"
            :disabled="regionalMode"
            :value="speechBaseUrl"
            @input="emit('update:speechBaseUrl', readInputValue($event))"
          />
        </div>
        <p class="form-hint">{{ regionalMode ? '当前生效语音地址由服务端统一维护' : 'OpenAI 兼容语音转写接口地址，通常以 `/v1` 结尾。' }}</p>
      </div>

      <div v-else class="form-group">
        <label for="speech-base-url-readonly">语音接入方式</label>
        <div class="input-with-icon">
          <Icon icon="lucide:cloud" :size="16" class="input-icon" />
          <input
            id="speech-base-url-readonly"
            type="text"
            :value="regionalMode ? '区域化模式下由 floating-ball-server 统一代理' : 'DashScope WebSocket（由 Rust 后端代理）'"
            readonly
          />
        </div>
        <p class="form-hint">{{ regionalMode ? '当前 provider 与代理路径由服务端统一维护。' : '当前 provider 走阿里云实时语音识别，不需要单独填写 Base URL。' }}</p>
      </div>

      <div class="form-group">
        <label for="speech-model-name">语音模型</label>
        <div class="input-with-icon">
          <Icon icon="lucide:mic" :size="16" class="input-icon" />
          <input
            id="speech-model-name"
            type="text"
            :placeholder="speechProvider === 'aliyun-dashscope' ? 'paraformer-realtime-v2' : 'whisper-1'"
            :disabled="regionalMode"
            :value="speechModel"
            @input="emit('update:speechModel', readInputValue($event))"
          />
        </div>
        <p class="form-hint">
          <span v-if="regionalMode">当前生效语音模型由服务端统一维护。</span>
          <span v-else-if="speechProvider === 'aliyun-dashscope'">默认使用阿里云实时识别模型 `paraformer-realtime-v2`。</span>
          <span v-else>例如 `whisper-1` 或兼容网关支持的其他语音转写模型。</span>
        </p>
      </div>

      <div class="toggle-row speech-test-row">
        <div class="toggle-label-group">
          <label for="speech-test-mode" class="toggle-label">语音识别测试模式</label>
          <span class="toggle-hint">启用后将跳过真实语音识别，直接返回示例文本</span>
        </div>
        <div class="switch-wrapper">
          <input
            id="speech-test-mode"
            type="checkbox"
            :checked="speechTestMode"
            @change="emit('update:speechTestMode', readCheckboxValue($event))"
          >
          <label for="speech-test-mode" class="toggle-switch"></label>
        </div>
      </div>
    </div>

    <div class="settings-section model-section-offset">
      <div class="section-header">
        <Icon icon="lucide:shield-check" :size="20" />
        <h3>独立审查 AI 配置</h3>
      </div>
      <p class="section-desc section-desc-spaced">配置用于事实核查和第二诊疗意见的独立大模型。如不填写，将默认使用上方的通用模型配置。</p>

      <div class="toggle-row">
        <div class="toggle-label-group">
          <label for="reviewer-enabled" class="toggle-label">开启独立审查 AI</label>
          <span class="toggle-hint">关闭后将不进行独立 AI 事实核查与验证</span>
        </div>
        <div class="switch-wrapper">
          <input
            id="reviewer-enabled"
            type="checkbox"
            :checked="reviewerEnabled"
            :disabled="regionalMode"
            @change="emit('update:reviewerEnabled', readCheckboxValue($event))"
          >
          <label for="reviewer-enabled" class="toggle-switch"></label>
        </div>
      </div>

      <template v-if="reviewerEnabled">
        <div class="toggle-row">
          <div class="toggle-label-group">
            <label for="reviewer-check-examination-enabled" class="toggle-label">启用检查项目独立审查</label>
            <span class="toggle-hint">关闭后将跳过 check_examination，诊断、用药和病历一致性审查不受影响</span>
          </div>
          <div class="switch-wrapper">
            <input
              id="reviewer-check-examination-enabled"
              type="checkbox"
              :checked="reviewerCheckExaminationEnabled"
              :disabled="regionalMode"
              @change="emit('update:reviewerCheckExaminationEnabled', readCheckboxValue($event))"
            >
            <label for="reviewer-check-examination-enabled" class="toggle-switch"></label>
          </div>
        </div>

        <div v-if="!regionalMode" class="form-group">
          <label for="reviewer-api-key">API Key</label>
          <div class="input-with-icon">
            <Icon icon="lucide:key" :size="16" class="input-icon" />
            <input
              id="reviewer-api-key"
              type="password"
              placeholder="sk-..."
              :value="reviewerApiKey"
              @input="emit('update:reviewerApiKey', readInputValue($event))"
            />
          </div>
          <p class="form-hint">独立审查 AI 的 API 密钥</p>
        </div>

        <div v-if="!regionalMode" class="form-group">
          <label for="reviewer-base-url">Base URL</label>
          <div class="input-with-icon">
            <Icon icon="lucide:link" :size="16" class="input-icon" />
            <input
              id="reviewer-base-url"
              type="text"
              placeholder="https://api.openai.com/v1"
              :value="reviewerBaseUrl"
              @input="emit('update:reviewerBaseUrl', readInputValue($event))"
            />
          </div>
          <p class="form-hint">API 服务器地址（留空使用上方默认值）</p>
        </div>

        <div class="form-group">
          <label for="reviewer-model-name">Model Name</label>
          <div class="input-with-icon">
            <Icon icon="lucide:brain" :size="16" class="input-icon" />
            <input
              id="reviewer-model-name"
              type="text"
              placeholder="gpt-4o-mini"
              :disabled="regionalMode"
              :value="reviewerModel"
              @input="emit('update:reviewerModel', readInputValue($event))"
            />
          </div>
          <p class="form-hint">{{ regionalMode ? '当前审查模型由服务端统一维护' : '使用的模型名称（留空使用上方默认值）' }}</p>
        </div>

        <div class="test-connection-row test-row-spaced">
          <button
            type="button"
            class="test-btn"
            :disabled="reviewerTesting || (!regionalMode && !reviewerApiKey && !apiKey)"
            @click="emit('test-reviewer-connection')"
          >
            <Icon
              :icon="reviewerTesting ? 'lucide:loader-2' : 'lucide:wifi'"
              :size="16"
              :class="{ spin: reviewerTesting }"
            />
            {{ reviewerTesting ? '测试中...' : '测试连接' }}
          </button>
          <span v-if="reviewerTestResult" :class="['test-message', reviewerTestResult.success ? 'success' : 'error']">
            <Icon :icon="reviewerTestResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" :size="16" />
            {{ reviewerTestResult.message }}
          </span>
        </div>
      </template>
    </div>

    <div class="settings-section model-section-offset">
      <div class="section-header">
        <Icon icon="lucide:book-open" :size="20" />
        <h3>医学知识库配置</h3>
      </div>
      <p class="section-desc">配置人卫 Inside 知识库 API，获取相关医学文献</p>

      <div class="toggle-row">
        <div class="toggle-label-group">
          <label for="pmphai-enabled" class="toggle-label">启用知识库搜索</label>
          <span class="toggle-hint">启用后，AI 推荐时将自动搜索相关医学文献</span>
        </div>
        <div class="switch-wrapper">
          <input
            id="pmphai-enabled"
            type="checkbox"
            :checked="pmphaiEnabled"
            :disabled="regionalMode"
            @change="emit('update:pmphaiEnabled', readCheckboxValue($event))"
          >
          <label for="pmphai-enabled" class="toggle-switch"></label>
        </div>
      </div>

      <template v-if="pmphaiEnabled">
        <div class="form-group">
          <label>搜索模式</label>
          <div class="mode-selector">
            <button
              type="button"
              :class="['mode-option', { active: pmphaiSearchMode === 'rag' }]"
              :disabled="!pmphaiEnabled"
              @click="emit('update:pmphaiSearchMode', 'rag')"
            >
              <Icon icon="lucide:sparkles" :size="18" />
              <div class="mode-info">
                <span class="mode-title">智能搜索</span>
                <span class="mode-desc">AI 语义匹配，基于向量相似度</span>
              </div>
            </button>
            <button
              type="button"
              :class="['mode-option', { active: pmphaiSearchMode === 'list' }]"
              :disabled="!pmphaiEnabled"
              @click="emit('update:pmphaiSearchMode', 'list')"
            >
              <Icon icon="lucide:list" :size="18" />
              <div class="mode-info">
                <span class="mode-title">文档浏览</span>
                <span class="mode-desc">传统关键词搜索，浏览知识库</span>
              </div>
            </button>
          </div>
        </div>

        <div v-if="!regionalMode" class="form-group">
          <label for="pmphai-app-key">APP Key</label>
          <div class="input-with-icon">
            <Icon icon="lucide:key" :size="16" class="input-icon" />
            <input
              id="pmphai-app-key"
              type="text"
              placeholder="请输入 APP Key"
              :value="pmphaiAppKey"
              @input="emit('update:pmphaiAppKey', readInputValue($event))"
            />
          </div>
          <p class="form-hint">人卫 Inside 云应用 APP Key</p>
        </div>

        <div v-if="!regionalMode" class="form-group">
          <label for="pmphai-app-secret">APP Secret</label>
          <div class="input-with-icon">
            <Icon icon="lucide:lock" :size="16" class="input-icon" />
            <input
              id="pmphai-app-secret"
              type="password"
              placeholder="请输入 APP Secret"
              :value="pmphaiAppSecret"
              @input="emit('update:pmphaiAppSecret', readInputValue($event))"
            />
          </div>
          <p class="form-hint">人卫 Inside 云应用密钥</p>
        </div>

        <div class="test-connection-row">
          <button
            type="button"
            class="test-btn"
            :disabled="pmphaiTesting || (!regionalMode && (!pmphaiAppKey || !pmphaiAppSecret))"
            @click="emit('test-pmphai-connection')"
          >
            <Icon
              :icon="pmphaiTesting ? 'lucide:loader-2' : 'lucide:wifi'"
              :size="16"
              :class="{ spin: pmphaiTesting }"
            />
            {{ pmphaiTesting ? '测试中...' : '测试连接' }}
          </button>
          <span v-if="pmphaiTestResult" :class="['test-message', pmphaiTestResult.success ? 'success' : 'error']">
            <Icon :icon="pmphaiTestResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" :size="16" />
            {{ pmphaiTestResult.message }}
          </span>
        </div>
      </template>
    </div>

    <div class="info-banner">
      <Icon icon="lucide:info" :size="18" />
      <p>{{ regionalMode ? '区域化模式下这里只保存本地偏好；后端 API 配置请到 floating-ball-server 管理端维护。' : '配置已保存到本地。如未设置，将使用环境变量默认值。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 24px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.settings-section {
  background: var(--medical-bg-primary);
  border: 1px solid var(--medical-border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.model-section-offset {
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--medical-border-light);
  color: var(--medical-primary);
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.section-desc {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--medical-text-muted);
  line-height: 1.5;
}

.section-desc-spaced {
  margin-bottom: 16px;
}

.preset-container {
  margin-bottom: 20px;
}

.preset-container label {
  display: block;
  font-size: 13px;
  color: var(--medical-text-muted);
  margin-bottom: 8px;
}

.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-btn {
  padding: 6px 12px;
  font-size: 13px;
  background: var(--medical-bg-tertiary);
  border: 1px solid var(--medical-border-medium);
  border-radius: 16px;
  color: var(--medical-text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: var(--medical-info-bg);
  border-color: var(--medical-info);
  color: var(--medical-info);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-group label {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.required {
  color: #DC2626;
  margin-left: 4px;
}

.input-with-icon {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon {
  position: absolute;
  left: 14px;
  color: var(--medical-text-muted);
  pointer-events: none;
}

.input-with-icon input {
  padding-left: 44px !important;
}

.form-group input,
.form-group select {
  height: 48px;
  border-radius: 8px;
  border: 2px solid var(--medical-border-medium);
  padding: 12px 16px;
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  outline: none;
  transition: all var(--duration-normal) var(--ease-out);
  font-size: 16px;
}

.form-group input:hover,
.form-group select:hover {
  border-color: var(--medical-border-medium);
}

.form-group input:focus,
.form-group select:focus {
  border-color: var(--medical-primary);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.form-hint {
  margin: 0;
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.5;
}

.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--medical-bg-secondary);
  border-radius: 10px;
  border: 1px solid var(--medical-border-light);
  margin-bottom: 20px;
  transition: background 0.2s ease;
}

.toggle-row:hover {
  background: #EFF6FF;
}

.speech-test-row {
  margin-top: 8px;
}

.toggle-label-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.toggle-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
  white-space: nowrap;
  cursor: pointer;
}

.toggle-hint {
  font-size: 12px;
  color: var(--medical-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.switch-wrapper {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch-wrapper input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-switch {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  min-height: unset;
  min-width: unset;
  background: #CBD5E1;
  transition: background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s ease;
  border-radius: 12px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.15);
}

.toggle-switch:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.3s ease;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

.switch-wrapper input:checked+.toggle-switch:before {
  transform: translateX(20px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.test-connection-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.test-row-spaced {
  margin-top: 16px;
}

.test-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--medical-border-medium);
  background: var(--medical-bg-primary);
  color: var(--medical-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.test-btn:hover:not(:disabled) {
  border-color: var(--medical-primary);
  color: var(--medical-primary);
}

.test-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.test-message {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.test-message.success {
  color: var(--medical-success);
}

.test-message.error {
  color: #DC2626;
}

.mode-selector {
  display: flex;
  gap: 12px;
}

.mode-option {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--medical-bg-primary);
  border: 2px solid var(--medical-border-light);
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  text-align: left;
}

.mode-option:hover:not(:disabled) {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.04);
}

.mode-option.active {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.08);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.mode-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mode-option :deep(svg) {
  color: var(--medical-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

.mode-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.mode-desc {
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.4;
}

.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--medical-info-bg);
  border: 1px solid var(--medical-info);
  border-radius: 8px;
  color: var(--medical-text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.info-banner p {
  margin: 0;
}

@media (max-width: 640px) {
  .settings-section {
    padding: 16px;
  }

  .form-group.row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
