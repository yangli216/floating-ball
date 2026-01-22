<script setup lang="ts">
import { ref, onMounted, inject } from 'vue';
import { getLLMConfig, DEFAULT_LLM_CONFIG } from '../services/llm';
import { useTheme } from '../services/themeService';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import UpdateChecker from './UpdateChecker.vue';
import Icon from './Icon.vue';

const emit = defineEmits<{
  'view-analytics': [];
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

// Settings state
const apiKey = ref('');
const baseUrl = ref('');
const model = ref('');
const alwaysOnTop = ref(true);

onMounted(() => {
  const config = getLLMConfig();
  apiKey.value = config.apiKey;
  baseUrl.value = config.baseUrl;
  model.value = config.model;
  
  const savedTop = localStorage.getItem('ALWAYS_ON_TOP');
  alwaysOnTop.value = savedTop === null || savedTop === 'true';
});

const saveSettings = async () => {
  localStorage.setItem('OPENAI_API_KEY', apiKey.value);
  localStorage.setItem('LLM_BASE_URL', baseUrl.value);
  localStorage.setItem('LLM_MODEL', model.value);
  localStorage.setItem('ALWAYS_ON_TOP', String(alwaysOnTop.value));

  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(alwaysOnTop.value);
  } catch (e) {
    console.error('Failed to set always on top:', e);
  }

  if (showToast) {
    showToast('设置已保存', 'success');
  }
};

// Data management
const exporting = ref(false);

const handleViewAnalytics = () => {
  emit('view-analytics');
};

const handleExportData = async () => {
  exporting.value = true;
  try {
    // Get date range - last 90 days
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 90);

    // Convert to Unix timestamps (in seconds)
    const startDate = Math.floor(start.getTime() / 1000);
    const endDate = Math.floor(now.getTime() / 1000);

    // Export data from backend
    const dataJson = await invoke<string>('export_data', {
      format: 'json',
      startDate,
      endDate,
    });

    // Show save dialog
    const filePath = await save({
      defaultPath: `feedback-export-${now.toISOString().split('T')[0]}.json`,
      filters: [{
        name: 'JSON',
        extensions: ['json']
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
    if (showToast) {
      showToast('导出失败: ' + (error as Error).message, 'error');
    }
  } finally {
    exporting.value = false;
  }
};
</script>

<template>
  <div class="settings-panel">
    <!-- Header -->
    <div class="settings-header">
      <h2 class="settings-title">系统设置</h2>
      <p class="settings-subtitle">配置应用程序、模型和数据管理选项</p>
    </div>

    <!-- Tabs Navigation -->
    <div class="tabs-header">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id as TabType"
      >
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
            <button
              v-for="theme in themes"
              :key="theme.id"
              :class="['theme-card', { active: currentTheme.id === theme.id }]"
              @click="setTheme(theme)"
            >
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

          <div class="form-group row">
            <div class="form-label-group">
              <label for="always-on-top">窗口始终置顶</label>
              <p class="form-hint">启用后，应用窗口将保持在其他窗口之上</p>
            </div>
            <div class="switch-wrapper">
              <input type="checkbox" id="always-on-top" v-model="alwaysOnTop">
              <label for="always-on-top" class="toggle-switch"></label>
            </div>
          </div>
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
          <p class="section-desc">导出最近90天的反馈数据为 JSON 格式</p>
          <button
            class="action-btn"
            @click="handleExportData"
            :disabled="exporting"
          >
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

/* Header */
.settings-header {
  padding: 24px 24px 16px;
  background: var(--medical-bg-primary);
  border-bottom: 2px solid var(--medical-border-light);
}

.settings-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--medical-text-primary);
  line-height: 1.25;
}

.settings-subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--medical-text-muted);
  line-height: 1.5;
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
.form-group.row {
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  background: var(--medical-bg-secondary);
  border-radius: 8px;
}

.form-label-group {
  flex: 1;
}

.form-label-group label {
  display: block;
  margin-bottom: 4px;
}

.form-label-group .form-hint {
  margin-top: 4px;
}

/* Toggle Switch */
.switch-wrapper {
  position: relative;
  width: 52px;
  height: 28px;
  flex-shrink: 0;
}

.switch-wrapper input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-switch {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #CBD5E1;
  transition: all var(--duration-slow) var(--ease-out);
  border-radius: 14px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
}

.toggle-switch:before {
  position: absolute;
  content: "";
  height: 22px;
  width: 22px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: all var(--duration-slow) var(--ease-out);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

input:checked + .toggle-switch {
  background-color: var(--medical-success);
}

input:checked + .toggle-switch:before {
  transform: translateX(24px);
}

/* Buttons */
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
  background: var(--medical-bg-primary);
  color: var(--medical-primary);
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

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
