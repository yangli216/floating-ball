<template>
  <div class="knowledge-base-panel">
    <div class="panel-header">
      <h2>知识库检索</h2>
      <button class="close-btn" @click="$emit('close')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- 配置区域 -->
    <div v-if="!isConfigured" class="config-section">
      <div class="config-form">
        <h3>首次使用需要配置</h3>
        <div class="form-group">
          <label>App Key</label>
          <input
            v-model="config.appKey"
            type="text"
            placeholder="请输入App Key"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>App Secret</label>
          <input
            v-model="config.appSecret"
            type="password"
            placeholder="请输入App Secret"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input
            v-model="config.baseUrl"
            type="text"
            placeholder="https://inside.pmphai.com"
            class="form-input"
          />
        </div>
        <button @click="saveConfig" class="save-btn">保存配置</button>
      </div>
    </div>

    <!-- 检索区域 -->
    <div v-else class="search-section">
      <div class="tabs">
        <button
          :class="['tab', { active: activeTab === 'search' }]"
          @click="activeTab = 'search'"
        >
          知识库搜索
        </button>
        <button
          :class="['tab', { active: activeTab === 'detail' }]"
          @click="activeTab = 'detail'"
        >
          知识详情
        </button>
        <button
          :class="['tab', { active: activeTab === 'config' }]"
          @click="activeTab = 'config'"
        >
          设置
        </button>
      </div>

      <!-- 知识库搜索 -->
      <div v-if="activeTab === 'search'" class="tab-content">
        <div class="form-group">
          <label>知识库ID</label>
          <input
            v-model="searchParams.kgBaseId"
            type="text"
            placeholder="请输入知识库ID"
            class="form-input"
          />
        </div>
        <button @click="openKnowledgeBase" class="action-btn">
          打开知识库
        </button>
        <p class="tip">提示：点击后会在新窗口中打开知识库页面</p>
      </div>

      <!-- 知识详情 -->
      <div v-if="activeTab === 'detail'" class="tab-content">
        <div class="form-group">
          <label>知识ID</label>
          <input
            v-model="detailParams.id"
            type="text"
            placeholder="请输入知识ID"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>显示字段（可选，逗号分隔）</label>
          <input
            v-model="detailParams.kgFields"
            type="text"
            placeholder="例如：适用性别,用法用量"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>图书目录定位（可选）</label>
          <div class="inline-inputs">
            <input
              v-model="detailParams.contentId"
              type="text"
              placeholder="contentId"
              class="form-input"
            />
            <input
              v-model="detailParams.muluId"
              type="text"
              placeholder="muluId"
              class="form-input"
            />
            <input
              v-model="detailParams.catalogueId"
              type="text"
              placeholder="catalogueId"
              class="form-input"
            />
          </div>
        </div>
        <button @click="openKnowledgeDetail" class="action-btn">
          查看详情
        </button>
        <p class="tip">提示：点击后会在新窗口中打开知识详情页面</p>
      </div>

      <!-- 设置 -->
      <div v-if="activeTab === 'config'" class="tab-content">
        <div class="form-group">
          <label>App Key</label>
          <input
            v-model="config.appKey"
            type="text"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>App Secret</label>
          <input
            v-model="config.appSecret"
            type="password"
            class="form-input"
          />
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input
            v-model="config.baseUrl"
            type="text"
            class="form-input"
          />
        </div>
        <button @click="saveConfig" class="save-btn">保存配置</button>
      </div>
    </div>

    <!-- 内嵌iframe显示 -->
    <div v-if="showIframe" class="iframe-container">
      <div class="iframe-header">
        <span>{{ iframeTitle }}</span>
        <button @click="closeIframe" class="close-iframe-btn">关闭</button>
      </div>
      <iframe
        :src="iframeUrl"
        frameborder="0"
        class="knowledge-iframe"
      ></iframe>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, inject } from 'vue'
import {
  buildKnowledgeBaseUrl,
  getKnowledgeBaseConfig,
  saveKnowledgeBaseConfig,
  type KnowledgeBaseConfig,
  type PageParams
} from '../services/knowledgeBase'

const emit = defineEmits(['close'])
const showToast = inject<(message: string, type?: string) => void>('showToast')

const activeTab = ref<'search' | 'detail' | 'config'>('search')

const config = ref<KnowledgeBaseConfig>({
  appKey: '',
  appSecret: '',
  baseUrl: 'https://inside.pmphai.com'
})

const searchParams = ref({
  kgBaseId: ''
})

const detailParams = ref({
  id: '',
  kgFields: '',
  contentId: '',
  muluId: '',
  catalogueId: ''
})

const showIframe = ref(false)
const iframeUrl = ref('')
const iframeTitle = ref('')

const isConfigured = computed(() => {
  return !!config.value.appKey && !!config.value.appSecret
})

onMounted(() => {
  const savedConfig = getKnowledgeBaseConfig()
  if (savedConfig) {
    config.value = savedConfig
  }
})

function saveConfig() {
  if (!config.value.appKey || !config.value.appSecret) {
    showToast?.('请填写App Key和App Secret', 'error')
    return
  }

  saveKnowledgeBaseConfig(config.value)
  showToast?.('配置已保存', 'success')

  if (activeTab.value === 'config') {
    activeTab.value = 'search'
  }
}

function openKnowledgeBase() {
  if (!searchParams.value.kgBaseId) {
    showToast?.('请输入知识库ID', 'error')
    return
  }

  const pageParams: PageParams = {
    pageName: 'search',
    kgBaseId: searchParams.value.kgBaseId
  }

  try {
    const url = buildKnowledgeBaseUrl(config.value, pageParams)

    // 在新窗口打开
    window.open(url, '_blank')

    showToast?.('正在打开知识库页面...', 'info')
  } catch (error) {
    showToast?.('构建URL失败: ' + (error as Error).message, 'error')
  }
}

function openKnowledgeDetail() {
  if (!detailParams.value.id) {
    showToast?.('请输入知识ID', 'error')
    return
  }

  const pageParams: PageParams = {
    pageName: 'detail',
    id: detailParams.value.id,
    kgFields: detailParams.value.kgFields || undefined,
    contentId: detailParams.value.contentId || undefined,
    muluId: detailParams.value.muluId || undefined,
    catalogueId: detailParams.value.catalogueId || undefined
  }

  try {
    const url = buildKnowledgeBaseUrl(config.value, pageParams)

    // 在新窗口打开
    window.open(url, '_blank')

    showToast?.('正在打开知识详情页面...', 'info')
  } catch (error) {
    showToast?.('构建URL失败: ' + (error as Error).message, 'error')
  }
}

function closeIframe() {
  showIframe.value = false
  iframeUrl.value = ''
  iframeTitle.value = ''
}
</script>

<style scoped>
.knowledge-base-panel {
  width: 100%;
  height: 100%;
  background: white;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e7eb;
}

.panel-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #111827;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.config-section,
.search-section {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.config-form {
  max-width: 500px;
  margin: 0 auto;
}

.config-form h3 {
  margin: 0 0 24px 0;
  font-size: 16px;
  color: #6b7280;
  text-align: center;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
}

.inline-inputs {
  display: flex;
  gap: 8px;
}

.inline-inputs .form-input {
  flex: 1;
}

.save-btn,
.action-btn {
  width: 100%;
  padding: 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.save-btn:hover,
.action-btn:hover {
  background: #2563eb;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid #e5e7eb;
}

.tab {
  padding: 12px 16px;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.tab:hover {
  color: #111827;
}

.tab-content {
  max-width: 600px;
}

.tip {
  margin-top: 12px;
  font-size: 13px;
  color: #6b7280;
}

.iframe-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: white;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.iframe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
}

.iframe-header span {
  font-weight: 500;
  color: #111827;
}

.close-iframe-btn {
  padding: 8px 16px;
  background: #ef4444;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.close-iframe-btn:hover {
  background: #dc2626;
}

.knowledge-iframe {
  flex: 1;
  width: 100%;
  height: 100%;
}
</style>
