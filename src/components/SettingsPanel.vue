<script setup lang="ts">
import { ref, onMounted, inject } from 'vue';
import { getLLMConfig, DEFAULT_LLM_CONFIG } from '../services/llm';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import UpdateChecker from './UpdateChecker.vue';

const emit = defineEmits<{
  'view-analytics': [];
}>();

const showToast = inject('showToast') as (msg: string, type: 'success' | 'error' | 'info') => void;

// Tabs configuration
type TabType = 'general' | 'model' | 'about' | 'data';
const activeTab = ref<TabType>('general');
const tabs = [
  { id: 'general', label: '通用' },
  { id: 'model', label: '模型' },
  { id: 'data', label: '数据' },
  { id: 'about', label: '版本' }
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
    <div class="tabs-header">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        :class="['tab-btn', { active: activeTab === tab.id }]"
        @click="activeTab = tab.id as TabType"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="settings-content">
      <!-- General Tab -->
      <div v-if="activeTab === 'general'" class="tab-pane">
        <div class="form-group row">
          <label>窗口始终置顶</label>
          <div class="switch-wrapper">
            <input type="checkbox" id="always-on-top" v-model="alwaysOnTop">
            <label for="always-on-top" class="toggle-switch"></label>
          </div>
        </div>
        <button class="save-btn" @click="saveSettings">保存设置</button>
      </div>

      <!-- Model Tab -->
      <div v-if="activeTab === 'model'" class="tab-pane">
        <div class="form-group">
          <label>API Key</label>
          <input v-model="apiKey" type="password" placeholder="sk-..." />
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input v-model="baseUrl" type="text" :placeholder="DEFAULT_LLM_CONFIG.baseUrl" />
        </div>
        <div class="form-group">
          <label>Model Name</label>
          <input v-model="model" type="text" :placeholder="DEFAULT_LLM_CONFIG.model" />
        </div>
        <button class="save-btn" @click="saveSettings">保存配置</button>
        <p class="hint">提示：设置已保存到本地。如未设置，将使用环境变量默认值。</p>
      </div>

      <!-- About Tab -->
      <div v-if="activeTab === 'about'" class="tab-pane">
        <UpdateChecker />
      </div>

      <!-- Data Tab -->
      <div v-if="activeTab === 'data'" class="tab-pane">
        <div class="data-section">
          <h3>数据分析</h3>
          <p class="section-desc">查看用户反馈、会话统计和性能指标</p>
          <button class="action-btn primary" @click="handleViewAnalytics">
            <span class="btn-icon">📊</span>
            查看数据分析
          </button>
        </div>

        <div class="data-section">
          <h3>数据导出</h3>
          <p class="section-desc">导出最近90天的反馈数据为 JSON 格式</p>
          <button
            class="action-btn"
            @click="handleExportData"
            :disabled="exporting"
          >
            <span class="btn-icon">{{ exporting ? '⏳' : '💾' }}</span>
            {{ exporting ? '导出中...' : '导出数据' }}
          </button>
        </div>

        <div class="data-section">
          <h3>数据说明</h3>
          <ul class="data-info-list">
            <li>数据存储在本地 SQLite 数据库中</li>
            <li>包含会话记录、消息、反馈和性能指标</li>
            <li>导出的数据可用于备份或外部分析</li>
            <li>数据格式符合标准 JSON 规范</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-strong);
}

.tabs-header {
  display: flex;
  border-bottom: 1px solid rgba(0,0,0,0.1);
  margin-bottom: 20px;
  padding: 0 16px;
}

.tab-btn {
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-weak);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.tab-btn:hover {
  color: var(--text-strong);
}

.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-weak);
}

.form-group input {
  height: 38px;
  border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.08);
  padding: 0 12px;
  background: rgba(255,255,255,0.7);
  outline: none;
  transition: all 0.2s;
}

.form-group input:focus {
  border-color: var(--accent);
  background: #fff;
}

.form-group.row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.switch-wrapper {
  position: relative;
  width: 44px;
  height: 24px;
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
  background-color: #ccc;
  transition: .4s;
  border-radius: 34px;
}

.toggle-switch:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .4s;
  border-radius: 50%;
}

input:checked + .toggle-switch {
  background-color: var(--accent);
}

input:checked + .toggle-switch:before {
  transform: translateX(20px);
}

.save-btn {
  margin-top: 10px;
  height: 40px;
  border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
  color: white;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(121, 194, 255, 0.3);
  transition: transform 0.2s ease;
}

.save-btn:hover {
  transform: translateY(-1px);
}

.hint {
  font-size: 11px;
  color: var(--text-weak);
  margin-top: 12px;
  line-height: 1.4;
}

/* Data Tab Styles */
.data-section {
  padding: 20px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 12px;
  margin-bottom: 16px;
}

.data-section h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.section-desc {
  font-size: 13px;
  color: var(--text-weak);
  margin: 0 0 16px 0;
  line-height: 1.4;
}

.action-btn {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  color: var(--text-strong);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.95);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-btn.primary {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(121, 194, 255, 0.3);
}

.action-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(121, 194, 255, 0.4);
}

.btn-icon {
  font-size: 20px;
}

.data-info-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-weak);
  line-height: 1.8;
}

.data-info-list li {
  margin-bottom: 6px;
}
</style>
