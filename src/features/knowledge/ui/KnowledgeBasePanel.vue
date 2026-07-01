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

    <!-- 服务端能力状态 -->
    <div v-if="!isConfigured" class="config-section">
      <div class="config-form">
        <h3>知识库由后台统一配置</h3>
        <p class="tip">当前机构未启用可用的知识库能力，请联系后台管理员配置。</p>
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
      </div>

      <!-- 知识库搜索 -->
      <div v-if="activeTab === 'search'" class="tab-content">
        <div class="form-group">
          <label>搜索知识库</label>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="输入关键词搜索..."
            class="form-input"
            @input="handleSearch"
          />
        </div>

        <!-- 知识库列表 -->
        <div v-if="knowledgeList.length > 0" class="knowledge-list">
          <div
            v-for="item in filteredKnowledgeList"
            :key="item.id"
            class="knowledge-item"
            @click="() => openKnowledgeDetail(item.id)"
          >
            <div class="item-content">
              <div class="item-title">{{ item.name }}</div>
              <div v-if="item.description" class="item-desc">{{ item.description }}</div>
            </div>
            <button
              class="doc-icon-btn"
              @click.stop="searchLiterature(item)"
              title="搜索文献"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <div v-else class="empty-state">
          <p>暂无知识库数据</p>
          <p class="tip">请先配置知识库或输入关键词搜索</p>
        </div>
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
        <button @click="() => openKnowledgeDetail()" class="action-btn">
          查看详情
        </button>
        <p class="tip">提示：点击后会在新窗口中打开知识详情页面</p>
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
import { ref, computed, onMounted, inject, watch } from 'vue'
import {
  getKnowledgeBaseConfig,
  isKnowledgeBaseConfigured,
  type KnowledgeBaseConfig,
  type PageParams
} from '@services/knowledgeBase'
import { pmphaiService, type BatchSearchResults } from '@services/pmphai'

const props = defineProps<{
  loading?: boolean
  results?: BatchSearchResults
  searchKeyword?: string
  searchType?: 'diagnosis' | 'medication' | 'examination'
}>()

const emit = defineEmits(['close'])
const showToast = inject<(message: string, type?: string) => void>('showToast')

const activeTab = ref<'search' | 'detail'>('search')
const config = ref<KnowledgeBaseConfig>({
  managedByServer: true,
  enabled: false
})

// 搜索关键词 - 初始化为 prop 值
const searchQuery = ref(props.searchKeyword || '')

// 监听 searchKeyword prop 的变化
watch(() => props.searchKeyword, (newKeyword) => {
  if (newKeyword) {
    searchQuery.value = newKeyword
  }
})

// 知识库列表（示例数据，实际应该从API获取）
const knowledgeList = ref([
  { id: 'kb001', name: '急性上呼吸道感染', description: '常见上呼吸道疾病知识库' },
  { id: 'kb002', name: '高血压诊疗指南', description: '高血压相关医学知识' },
  { id: 'kb003', name: '糖尿病管理', description: '糖尿病诊断与治疗' },
])

// 过滤后的知识库列表
const filteredKnowledgeList = computed(() => {
  if (!searchQuery.value) {
    return knowledgeList.value
  }
  const query = searchQuery.value.toLowerCase()
  return knowledgeList.value.filter(item =>
    item.name.toLowerCase().includes(query) ||
    item.description?.toLowerCase().includes(query)
  )
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
  return isKnowledgeBaseConfigured(config.value)
})

onMounted(() => {
  const savedConfig = getKnowledgeBaseConfig()
  if (savedConfig) {
    config.value = savedConfig
  }
})

function handleSearch() {
  // 实时搜索，filteredKnowledgeList 会自动更新
}

async function openKnowledgeDetail(id?: string) {
  const knowledgeId = id || detailParams.value.id

  if (!knowledgeId) {
    showToast?.('请输入知识ID', 'error')
    return
  }

  const pageParams: PageParams = {
    pageName: 'detail',
    id: knowledgeId,
    kgFields: detailParams.value.kgFields || undefined,
    contentId: detailParams.value.contentId || undefined,
    muluId: detailParams.value.muluId || undefined,
    catalogueId: detailParams.value.catalogueId || undefined
  }

  try {
    const url = await pmphaiService.getPageUrl({
      pageName: pageParams.pageName,
      id: pageParams.id,
      kgBaseId: pageParams.kgBaseId,
      kgFields: pageParams.kgFields,
      contentId: pageParams.contentId,
      muluId: pageParams.muluId,
      catalogueId: pageParams.catalogueId,
      originUrl: window.location.href,
    })

    if (!url) {
      throw new Error('未获取到知识库地址')
    }

    // 在新窗口打开
    window.open(url, '_blank')

    showToast?.('正在打开知识详情页面...', 'info')
  } catch (error) {
    showToast?.('构建URL失败: ' + (error as Error).message, 'error')
  }
}

function searchLiterature(item: any) {
  console.log('搜索文献:', item)
  showToast?.(`正在搜索"${item.name}"相关文献...`, 'info')

  // TODO: 实现实际的文献搜索逻辑
  // 可以调用知识库API或打开外部文献数据库
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

.server-managed-card {
  padding: 16px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fbff;
}

.server-managed-title {
  margin: 0 0 12px 0;
  font-size: 15px;
  font-weight: 600;
  color: #1d4ed8;
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

.form-input:disabled {
  background: #f9fafb;
  color: #6b7280;
  cursor: not-allowed;
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
