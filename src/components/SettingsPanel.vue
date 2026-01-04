<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getLLMConfig, DEFAULT_LLM_CONFIG } from '../services/llm';

const apiKey = ref('');
const baseUrl = ref('');
const model = ref('');

onMounted(() => {
  const config = getLLMConfig();
  apiKey.value = config.apiKey;
  baseUrl.value = config.baseUrl;
  model.value = config.model;
});

const saveSettings = () => {
  localStorage.setItem('OPENAI_API_KEY', apiKey.value);
  localStorage.setItem('LLM_BASE_URL', baseUrl.value);
  localStorage.setItem('LLM_MODEL', model.value);
  alert('设置已保存，刷新页面后生效。');
};
</script>

<template>
  <div class="settings-panel">
    <div class="settings-header">
      <h3>模型配置</h3>
    </div>
    <div class="settings-content">
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
  </div>
</template>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-strong);
  padding: 16px;
}
.settings-header h3 {
  margin-bottom: 20px;
  font-size: 16px;
  opacity: 0.9;
}
.settings-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
}
.form-group input:focus {
  border-color: var(--accent);
  background: #fff;
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
</style>
