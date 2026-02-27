<script setup lang="ts">
import { ref, onMounted, inject, watch } from 'vue';
import { getLLMConfig, DEFAULT_LLM_CONFIG } from '../services/llm';
import { getPMPHAIConfig, pmphaiService } from '../services/pmphai';
import { useTheme } from '../services/themeService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { trackClick, trackError } from '../services/operationTracker';
import UpdateChecker from './UpdateChecker.vue';
import Icon from './Icon.vue';

const emit = defineEmits<{
  'view-analytics': [];
  'open-symptom-manage': [];
}>();

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

// Theme management
const { currentTheme, themes, setTheme } = useTheme();

// Get theme preview style
const getThemePreviewStyle = (theme: typeof themes[0]) => ({
  background: theme.colors.background,
  borderColor: theme.colors.borderLight,
});

// Tabs configuration
type TabType = 'general' | 'model' | 'about' | 'data';
const activeTab = ref<TabType>('general');
const tabs = [
  { id: 'general', label: '通用设置', icon: 'lucide:settings-2' },
  { id: 'model', label: '模型配置', icon: 'lucide:brain' },
  { id: 'data', label: '数据管理', icon: 'lucide:database' },
  { id: 'about', label: '关于版本', icon: 'lucide:info' }
];

// Provider presets
const PROVIDER_PRESETS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '百川智能', baseUrl: 'https://api.baichuan-ai.com/v1', model: 'Baichuan-M3' },
  { name: '阿里通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '月之暗面 (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
];

const applyPreset = (preset: typeof PROVIDER_PRESETS[0]) => {
  baseUrl.value = preset.baseUrl;
  model.value = preset.model;
  trackClick('settings_apply_preset', { provider: preset.name });
};

// Settings state
const apiKey = ref('');
const baseUrl = ref('');
const model = ref('');
const alwaysOnTop = ref(true);

// Reviewer AI state
const reviewerEnabled = ref(true);
const reviewerApiKey = ref('');
const reviewerBaseUrl = ref('');
const reviewerModel = ref('');

// Knowledge Base (PMPHAI) settings
const pmphaiAppKey = ref('');
const pmphaiAppSecret = ref('');
const pmphaiEnabled = ref(true);
const pmphaiTesting = ref(false);
const pmphaiTestResult = ref<{ success: boolean; message: string } | null>(null);
const pmphaiSearchMode = ref<'rag' | 'list'>('rag');

onMounted(() => {
  const config = getLLMConfig();
  apiKey.value = config.apiKey;
  baseUrl.value = config.baseUrl;
  model.value = config.model;

  const savedTop = localStorage.getItem('ALWAYS_ON_TOP');
  alwaysOnTop.value = savedTop === null || savedTop === 'true';

  // Load Reviewer AI settings
  const reviewerEnabledSaved = localStorage.getItem('REVIEWER_ENABLED');
  reviewerEnabled.value = reviewerEnabledSaved === null ? true : reviewerEnabledSaved === 'true';
  reviewerApiKey.value = localStorage.getItem('REVIEWER_API_KEY') || '';
  reviewerBaseUrl.value = localStorage.getItem('REVIEWER_BASE_URL') || '';
  reviewerModel.value = localStorage.getItem('REVIEWER_MODEL') || '';

  // Load PMPHAI settings
  const pmphaiConfig = getPMPHAIConfig();
  pmphaiAppKey.value = pmphaiConfig.appKey;
  pmphaiAppSecret.value = pmphaiConfig.appSecret;
  pmphaiEnabled.value = pmphaiConfig.enabled;
  pmphaiSearchMode.value = (localStorage.getItem('PMPHAI_SEARCH_MODE') as 'rag' | 'list') || 'rag';
});

const saveSettings = async () => {
  localStorage.setItem('OPENAI_API_KEY', apiKey.value);
  localStorage.setItem('LLM_BASE_URL', baseUrl.value);
  localStorage.setItem('LLM_MODEL', model.value);
  localStorage.setItem('ALWAYS_ON_TOP', String(alwaysOnTop.value));

  // Save Reviewer AI settings
  localStorage.setItem('REVIEWER_ENABLED', String(reviewerEnabled.value));
  localStorage.setItem('REVIEWER_API_KEY', reviewerApiKey.value);
  localStorage.setItem('REVIEWER_BASE_URL', reviewerBaseUrl.value);
  localStorage.setItem('REVIEWER_MODEL', reviewerModel.value);

  // Save PMPHAI settings
  localStorage.setItem('PMPHAI_APP_KEY', pmphaiAppKey.value);
  localStorage.setItem('PMPHAI_APP_SECRET', pmphaiAppSecret.value);
  localStorage.setItem('PMPHAI_ENABLED', String(pmphaiEnabled.value));
  localStorage.setItem('PMPHAI_SEARCH_MODE', pmphaiSearchMode.value);

  trackClick('settings_save', { hasApiKey: !!apiKey.value, hasBaseUrl: !!baseUrl.value, model: model.value, alwaysOnTop: alwaysOnTop.value, pmphaiEnabled: pmphaiEnabled.value });

  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(alwaysOnTop.value);
  } catch (e) {
    console.error('Failed to set always on top:', e);
  }

  // Clear PMPHAI token cache when settings change
  pmphaiService.clearTokenCache();

  if (showToast) {
    showToast('设置已保存', 'success');
  }
};

// Test PMPHAI connection
const testPMPHAIConnection = async () => {
  pmphaiTesting.value = true;
  pmphaiTestResult.value = null;

  // Temporarily save settings for testing
  localStorage.setItem('PMPHAI_APP_KEY', pmphaiAppKey.value);
  localStorage.setItem('PMPHAI_APP_SECRET', pmphaiAppSecret.value);
  localStorage.setItem('PMPHAI_ENABLED', 'true');
  pmphaiService.clearTokenCache();

  try {
    const result = await pmphaiService.testConnection();
    pmphaiTestResult.value = result;
    trackClick('settings_pmphai_test', { success: result.success });
  } catch (error: any) {
    pmphaiTestResult.value = { success: false, message: error.message || '连接失败' };
    trackError('settings_pmphai_test_failed', error);
  } finally {
    pmphaiTesting.value = false;
  }
};

// Data management
const exporting = ref(false);
const exportFormat = ref<'json' | 'csv'>('json');
const exportDays = ref(90);

const handleViewAnalytics = () => {
  trackClick('settings_view_analytics');
  emit('view-analytics');
};

const handleExportData = async () => {
  exporting.value = true;
  trackClick('settings_export_data', { format: exportFormat.value, days: exportDays.value });
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - exportDays.value);

    const startDate = Math.floor(start.getTime() / 1000);
    const endDate = Math.floor(now.getTime() / 1000);

    const dataJson = await invoke<string>('export_data', {
      format: exportFormat.value,
      startDate,
      endDate,
    });

    const ext = exportFormat.value;
    const filePath = await save({
      defaultPath: `feedback-export-${now.toISOString().split('T')[0]}.${ext}`,
      filters: [{
        name: ext.toUpperCase(),
        extensions: [ext]
      }]
    });

    if (filePath) {
      // Write file using Tauri filesystem
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(filePath, dataJson);

      if (showToast) {
        showToast('数据导出成功', 'success');
      }
    }
  } catch (error) {
    console.error('Failed to export data:', error);
    trackError('settings_export_failed', error);
    if (showToast) {
      showToast('导出失败: ' + (error as Error).message, 'error');
    }
  } finally {
    exporting.value = false;
  }
};

watch(activeTab, (newVal) => {
  trackClick('settings_tab_change', { tab: newVal });
});
</script>

<template>
  <div class="settings-panel">
    <!-- Header -->
    <!-- Header Removed -->


    <!-- Tabs Navigation -->
    <div class="tabs-header">
      <button v-for="tab in tabs" :key="tab.id" :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id as TabType">
        <Icon :icon="tab.icon" :size="18" class="tab-icon" />
        <span>{{ tab.label }}</span>
      </button>
    </div>

    <div class="settings-content">
      <!-- General Tab -->
      <div v-if="activeTab === 'general'" class="tab-pane">
        <!-- Theme Selector Section -->
        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:palette" :size="20" />
            <h3>界面主题</h3>
          </div>
          <p class="section-desc">选择适合您的视觉风格</p>

          <div class="theme-grid">
            <button v-for="theme in themes" :key="theme.id"
              :class="['theme-card', { active: currentTheme.id === theme.id }]"
              @click="trackClick('settings_theme_change', { themeId: theme.id }); setTheme(theme)">
              <div class="theme-preview" :style="getThemePreviewStyle(theme)">
                <div class="preview-header" :style="{ background: theme.colors.primary }"></div>
                <div class="preview-content">
                  <div class="preview-sidebar" :style="{ background: theme.colors.primaryLight }"></div>
                  <div class="preview-main">
                    <div class="preview-line" :style="{ background: theme.colors.textMuted }"></div>
                    <div class="preview-line short" :style="{ background: theme.colors.textMuted }"></div>
                    <div class="preview-btn" :style="{ background: theme.colors.cta }"></div>
                  </div>
                </div>
              </div>
              <div class="theme-info">
                <span class="theme-name">{{ theme.name }}</span>
                <span class="theme-desc">{{ theme.description }}</span>
              </div>
              <div v-if="currentTheme.id === theme.id" class="theme-check">
                <Icon icon="lucide:check" :size="16" />
              </div>
            </button>
          </div>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:layout" :size="20" />
            <h3>窗口设置</h3>
          </div>

          <div class="toggle-row">
            <div class="toggle-label-group">
              <label for="always-on-top" class="toggle-label">窗口始终置顶</label>
              <span class="toggle-hint">启用后，应用窗口将保持在其他窗口之上</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="always-on-top" v-model="alwaysOnTop">
              <label for="always-on-top" class="toggle-switch"></label>
            </div>
          </div>
        </div>

        <div class="settings-section clickable-section"
          @click="trackClick('settings_open_symptom_manage'); emit('open-symptom-manage')">
          <div class="section-header no-border"
            style="display: flex; align-items: center; justify-content: space-between;">
            <div class="header-left" style="display: flex; align-items: center; gap: 12px;">
              <Icon icon="lucide:file-edit" :size="20" />
              <h3 style="margin: 0;">症状库管理</h3>
            </div>
            <div class="arrow-icon">
              <Icon icon="lucide:chevron-right" :size="20" />
            </div>
          </div>
          <p class="section-desc" style="margin-top: 4px;">配置和维护用于问诊的症状模板库</p>
        </div>

        <button class="save-btn" @click="saveSettings">
          <Icon icon="lucide:check" :size="18" />
          保存设置
        </button>
      </div>

      <!-- Model Tab -->
      <div v-if="activeTab === 'model'" class="tab-pane">
        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:key" :size="20" />
            <h3>API 配置</h3>
          </div>

          <!-- Provider Presets -->
          <div class="preset-container">
            <label>快速填充常用服务商：</label>
            <div class="preset-buttons">
              <button v-for="preset in PROVIDER_PRESETS" :key="preset.name" class="preset-btn"
                @click="applyPreset(preset)">
                {{ preset.name }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="api-key">API Key <span class="required">*</span></label>
            <div class="input-with-icon">
              <Icon icon="lucide:key" :size="16" class="input-icon" />
              <input id="api-key" v-model="apiKey" type="password" placeholder="sk-..." />
            </div>
            <p class="form-hint">请输入您的 OpenAI 兼容 API 密钥</p>
          </div>

          <div class="form-group">
            <label for="base-url">Base URL</label>
            <div class="input-with-icon">
              <Icon icon="lucide:link" :size="16" class="input-icon" />
              <input id="base-url" v-model="baseUrl" type="text" :placeholder="DEFAULT_LLM_CONFIG.baseUrl" />
            </div>
            <p class="form-hint">API 服务器地址（留空使用默认值）</p>
          </div>

          <div class="form-group">
            <label for="model-name">Model Name</label>
            <div class="input-with-icon">
              <Icon icon="lucide:brain" :size="16" class="input-icon" />
              <input id="model-name" v-model="model" type="text" :placeholder="DEFAULT_LLM_CONFIG.model" />
            </div>
            <p class="form-hint">使用的模型名称（如：gpt-4-turbo）</p>
          </div>
        </div>

        <!-- Reviewer AI Section -->
        <div class="settings-section" style="margin-top: 24px;">
          <div class="section-header">
            <Icon icon="lucide:shield-check" :size="20" />
            <h3>独立审查 AI 配置</h3>
          </div>
          <p class="section-desc" style="margin-bottom: 16px;">配置用于事实核查和第二诊疗意见的独立大模型。如不填写，将默认使用上方的通用模型配置。</p>

          <div class="toggle-row">
            <div class="toggle-label-group">
              <label for="reviewer-enabled" class="toggle-label">开启独立审查 AI</label>
              <span class="toggle-hint">关闭后将不进行独立 AI 事实核查与验证</span>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="reviewer-enabled" v-model="reviewerEnabled">
              <label for="reviewer-enabled" class="toggle-switch"></label>
            </div>
          </div>

          <template v-if="reviewerEnabled">
            <div class="form-group">
              <label for="reviewer-api-key">API Key</label>
              <div class="input-with-icon">
                <Icon icon="lucide:key" :size="16" class="input-icon" />
                <input id="reviewer-api-key" v-model="reviewerApiKey" type="password" placeholder="sk-..." />
              </div>
              <p class="form-hint">独立审查 AI 的 API 密钥</p>
            </div>

            <div class="form-group">
              <label for="reviewer-base-url">Base URL</label>
              <div class="input-with-icon">
                <Icon icon="lucide:link" :size="16" class="input-icon" />
                <input id="reviewer-base-url" v-model="reviewerBaseUrl" type="text"
                  placeholder="https://api.openai.com/v1" />
              </div>
              <p class="form-hint">API 服务器地址（留空使用上方默认值）</p>
            </div>

            <div class="form-group">
              <label for="reviewer-model-name">Model Name</label>
              <div class="input-with-icon">
                <Icon icon="lucide:brain" :size="16" class="input-icon" />
                <input id="reviewer-model-name" v-model="reviewerModel" type="text" placeholder="gpt-4o-mini" />
              </div>
              <p class="form-hint">使用的模型名称（留空使用上方默认值）</p>
            </div>
          </template>
        </div>

        <!-- Knowledge Base Section -->
        <div class="settings-section" style="margin-top: 24px;">
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
              <input type="checkbox" id="pmphai-enabled" v-model="pmphaiEnabled">
              <label for="pmphai-enabled" class="toggle-switch"></label>
            </div>
          </div>
          <template v-if="pmphaiEnabled">
            <div class="form-group">
              <label>搜索模式</label>
              <div class="mode-selector">
                <button :class="['mode-option', { active: pmphaiSearchMode === 'rag' }]"
                  @click="pmphaiSearchMode = 'rag'" :disabled="!pmphaiEnabled">
                  <Icon icon="lucide:sparkles" :size="18" />
                  <div class="mode-info">
                    <span class="mode-title">智能搜索</span>
                    <span class="mode-desc">AI 语义匹配，基于向量相似度</span>
                  </div>
                </button>
                <button :class="['mode-option', { active: pmphaiSearchMode === 'list' }]"
                  @click="pmphaiSearchMode = 'list'" :disabled="!pmphaiEnabled">
                  <Icon icon="lucide:list" :size="18" />
                  <div class="mode-info">
                    <span class="mode-title">文档浏览</span>
                    <span class="mode-desc">传统关键词搜索，浏览知识库</span>
                  </div>
                </button>
              </div>
            </div>

            <div class="form-group">
              <label for="pmphai-app-key">APP Key</label>
              <div class="input-with-icon">
                <Icon icon="lucide:key" :size="16" class="input-icon" />
                <input id="pmphai-app-key" v-model="pmphaiAppKey" type="text" placeholder="请输入 APP Key" />
              </div>
              <p class="form-hint">人卫 Inside 云应用 APP Key</p>
            </div>

            <div class="form-group">
              <label for="pmphai-app-secret">APP Secret</label>
              <div class="input-with-icon">
                <Icon icon="lucide:lock" :size="16" class="input-icon" />
                <input id="pmphai-app-secret" v-model="pmphaiAppSecret" type="password" placeholder="请输入 APP Secret" />
              </div>
              <p class="form-hint">人卫 Inside 云应用密钥</p>
            </div>

            <div class="test-connection-row">
              <button class="test-btn" @click="testPMPHAIConnection"
                :disabled="pmphaiTesting || !pmphaiAppKey || !pmphaiAppSecret">
                <Icon :icon="pmphaiTesting ? 'lucide:loader-2' : 'lucide:wifi'" :size="16"
                  :class="{ spin: pmphaiTesting }" />
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
          <p>配置已保存到本地。如未设置，将使用环境变量默认值。</p>
        </div>

        <button class="save-btn" @click="saveSettings">
          <Icon icon="lucide:save" :size="18" />
          保存配置
        </button>

      </div>

      <!-- About Tab -->
      <div v-if="activeTab === 'about'" class="tab-pane">
        <UpdateChecker />
      </div>

      <!-- Data Tab -->
      <div v-if="activeTab === 'data'" class="tab-pane">
        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:bar-chart-3" :size="20" />
            <h3>数据分析</h3>
          </div>
          <p class="section-desc">查看用户反馈、会话统计和性能指标</p>
          <button class="action-btn primary" @click="handleViewAnalytics">
            <Icon icon="lucide:bar-chart-3" :size="18" />
            查看数据分析
          </button>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:download" :size="20" />
            <h3>数据导出</h3>
          </div>
          <p class="section-desc">导出反馈数据用于备份或外部分析</p>

          <div class="export-options">
            <div class="form-group">
              <label>导出格式</label>
              <div class="radio-group">
                <label class="radio-option" :class="{ active: exportFormat === 'json' }">
                  <input type="radio" v-model="exportFormat" value="json" /> JSON
                </label>
                <label class="radio-option" :class="{ active: exportFormat === 'csv' }">
                  <input type="radio" v-model="exportFormat" value="csv" /> CSV
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>时间范围</label>
              <div class="radio-group">
                <label class="radio-option" :class="{ active: exportDays === 7 }">
                  <input type="radio" v-model.number="exportDays" :value="7" /> 7天
                </label>
                <label class="radio-option" :class="{ active: exportDays === 30 }">
                  <input type="radio" v-model.number="exportDays" :value="30" /> 30天
                </label>
                <label class="radio-option" :class="{ active: exportDays === 90 }">
                  <input type="radio" v-model.number="exportDays" :value="90" /> 90天
                </label>
                <label class="radio-option" :class="{ active: exportDays === 365 }">
                  <input type="radio" v-model.number="exportDays" :value="365" /> 全部
                </label>
              </div>
            </div>
          </div>

          <button class="action-btn" @click="handleExportData" :disabled="exporting">
            <Icon :icon="exporting ? 'lucide:loader-2' : 'lucide:download'" :size="18" :class="{ 'spin': exporting }" />
            {{ exporting ? '导出中...' : '导出数据' }}
          </button>
        </div>

        <div class="settings-section">
          <div class="section-header">
            <Icon icon="lucide:info" :size="20" />
            <h3>数据说明</h3>
          </div>
          <ul class="data-info-list">
            <li>
              <Icon icon="lucide:database" :size="16" />
              数据存储在本地 SQLite 数据库中
            </li>
            <li>
              <Icon icon="lucide:file-text" :size="16" />
              包含会话记录、消息、反馈和性能指标
            </li>
            <li>
              <Icon icon="lucide:archive" :size="16" />
              导出的数据可用于备份或外部分析
            </li>
            <li>
              <Icon icon="lucide:check-circle" :size="16" />
              数据格式符合标准 JSON 规范
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Medical Theme Variables - Scoped to SettingsPanel only */
.settings-panel {
  /* Medical Colors */
  --medical-primary: #0891B2;
  --medical-primary-hover: #0E7490;
  --medical-success: #059669;
  --medical-text-primary: #164E63;
  --medical-text-secondary: #0F172A;
  --medical-text-muted: #475569;
  --medical-bg-primary: #FFFFFF;
  --medical-bg-secondary: #F8FAFC;
  --medical-bg-tertiary: #F1F5F9;
  --medical-border-light: #E2E8F0;
  --medical-border-medium: #CBD5E1;
  --medical-info-bg: #DBEAFE;
  --medical-info: #3B82F6;

  /* Layout */
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--medical-bg-secondary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}



/* Tabs */
.tabs-header {
  display: flex;
  gap: 8px;
  padding: 16px 24px 0;
  background: var(--medical-bg-primary);
  border-bottom: 2px solid var(--medical-border-light);
  overflow-x: auto;
}

/* Preset Buttons */
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

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--medical-text-muted);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  white-space: nowrap;
  min-height: 44px;
}

.tab-btn:hover {
  color: var(--medical-text-primary);
  background: var(--medical-bg-tertiary);
}

.tab-btn.active {
  color: var(--medical-primary);
  border-bottom-color: var(--medical-primary);
  font-weight: 600;
}

.tab-icon {
  flex-shrink: 0;
}

/* Content */
.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

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

/* Settings Section */
.settings-section {
  background: var(--medical-bg-primary);
  border: 1px solid var(--medical-border-light);
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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

/* Theme Selector Grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--medical-bg-primary);
  border: 2px solid var(--medical-border-light);
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  text-align: left;
}

.theme-card:hover {
  border-color: var(--medical-border-medium);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.theme-card.active {
  border-color: var(--medical-primary);
  background: rgba(8, 145, 178, 0.04);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.theme-preview {
  width: 100%;
  height: 80px;
  border-radius: 8px;
  border: 1px solid;
  overflow: hidden;
  margin-bottom: 10px;
}

.preview-header {
  height: 16px;
}

.preview-content {
  display: flex;
  height: calc(100% - 16px);
  padding: 6px;
  gap: 6px;
}

.preview-sidebar {
  width: 20px;
  border-radius: 4px;
  opacity: 0.6;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
}

.preview-line {
  height: 6px;
  border-radius: 3px;
  opacity: 0.3;
}

.preview-line.short {
  width: 60%;
}

.preview-btn {
  width: 40px;
  height: 12px;
  border-radius: 4px;
  margin-top: auto;
}

.theme-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.theme-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--medical-text-primary);
}

.theme-desc {
  font-size: 12px;
  color: var(--medical-text-muted);
}

.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--medical-primary);
  color: white;
  border-radius: 50%;
}

/* Form Elements */
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

.form-group input {
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

.form-group input:hover {
  border-color: var(--medical-border-medium);
}

.form-group input:focus {
  border-color: var(--medical-primary);
  box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
}

.form-hint {
  margin: 0;
  font-size: 12px;
  color: var(--medical-text-muted);
  line-height: 1.5;
}

/* Toggle Row */
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

/* Toggle Switch */
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

/* Buttons */
.clickable {
  cursor: pointer;
  padding: 8px 0;
  transition: opacity 0.2s;
}

.clickable:hover {
  opacity: 0.7;
}

.arrow-icon {
  color: var(--medical-text-muted);
}

.save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 12px 24px;
  border-radius: 8px;
  border: none;
  background: var(--medical-primary);
  color: white;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
  transition: all var(--duration-normal) var(--ease-out);
}

.save-btn:hover {
  background: var(--medical-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4);
}

.save-btn:active {
  transform: translateY(0);
}

/* Info Banner */
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

/* Action Buttons */
.action-btn {
  width: 100%;
  min-height: 44px;
  padding: 12px 24px;
  border-radius: 8px;
  border: 2px solid var(--medical-primary);

  .clickable-section {
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .clickable-section:hover {
    border-color: var(--medical-primary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(8, 145, 178, 0.15);
  }

  .clickable-section .section-header {
    justify-content: space-between;
  }

  .clickable-section .section-header.no-border {
    border-bottom: none;
    margin-bottom: 8px;
    padding-bottom: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all var(--duration-normal) var(--ease-out);
}

.action-btn:hover:not(:disabled) {
  background: var(--medical-primary);
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.2);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.primary {
  background: var(--medical-primary);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.3);
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--medical-primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(8, 145, 178, 0.4);
}

/* Data Info List */
.data-info-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.data-info-list li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  color: var(--medical-text-secondary);
  line-height: 1.5;
}

.data-info-list li :deep(svg) {
  color: var(--medical-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Spinner Animation */
.spin {
  animation: spin 1s linear infinite;
}

/* Export Options */
.export-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.radio-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border: 1px solid var(--medical-border-medium);
  border-radius: 20px;
  font-size: 13px;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  color: var(--medical-text-muted);
}

.radio-option input {
  display: none;
}

.radio-option:hover {
  border-color: var(--medical-primary);
  color: var(--medical-primary);
}

.radio-option.active {
  background: var(--medical-primary);
  border-color: var(--medical-primary);
  color: white;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Test Connection */
.test-connection-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
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

.test-message.testing {
  color: var(--medical-text-muted);
}

/* Mode Selector */
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

/* Responsive */
@media (max-width: 640px) {
  .settings-header {
    padding: 16px;
  }

  .settings-title {
    font-size: 20px;
  }

  .tabs-header {
    padding: 12px 16px 0;
  }

  .tab-btn {
    padding: 10px 12px;
    font-size: 12px;
  }

  .settings-content {
    padding: 16px;
  }

  .settings-section {
    padding: 16px;
  }

  .form-group.row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
