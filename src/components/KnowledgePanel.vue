<template>
  <Transition name="slide">
    <div v-if="visible" class="knowledge-panel">
      <header class="panel-header">
        <div class="header-left">
          <span class="header-icon">📚</span>
          <h3>相关医学文献</h3>
          <span v-if="totalCount > 0" class="total-badge">{{ totalCount }}</span>
        </div>
        <button class="close-btn" @click="close" title="关闭">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </header>

      <!-- RAG 模式: 分类 tabs -->
      <div v-if="searchMode === 'rag'" class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
          <span v-if="getTabCount(tab.key) > 0" class="tab-count">{{ getTabCount(tab.key) }}</span>
        </button>
      </div>

      <!-- 文档浏览模式: 搜索框 -->
      <div v-else class="list-search-bar">
        <div class="search-row">
          <input
            v-model="listSearchKey"
            type="text"
            placeholder="输入关键词搜索文档..."
            @keyup.enter="performListSearch"
          />
          <button class="search-btn" @click="performListSearch" :disabled="listLoading">
            <span v-if="listLoading" class="spinner-small"></span>
            <span v-else>🔍</span>
          </button>
        </div>
        <div class="sort-row">
          <select v-model="listSortOption" class="sort-select" @change="performListSearch">
            <option value="relevance">相关度排序</option>
            <option value="initials_asc">字母顺序</option>
            <option value="initials_desc">字母倒序</option>
          </select>
        </div>
      </div>

      <div class="panel-content">
        <!-- RAG 模式内容 -->
        <template v-if="searchMode === 'rag'">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <span>正在搜索相关文献...</span>
          </div>

          <div v-else-if="currentResults.length === 0" class="empty-state">
            <span class="empty-icon">📭</span>
            <span>暂无相关文献</span>
          </div>

          <div v-else class="results-list">
            <KnowledgeResultItem
              v-for="(item, index) in currentResults"
              :key="item.id || index"
              :result="item"
              :query="currentQuery"
              @click="showDetail(item)"
            />
          </div>
        </template>

        <!-- 文档浏览模式内容 -->
        <template v-else>
          <div v-if="listLoading" class="loading-state">
            <div class="spinner"></div>
            <span>正在搜索文档...</span>
          </div>

          <div v-else-if="listResults.length === 0" class="empty-state">
            <span class="empty-icon">📭</span>
            <span>{{ listSearchKey ? '未找到相关文档' : '输入关键词开始搜索' }}</span>
          </div>

          <div v-else class="results-list">
            <div
              v-for="item in listResults"
              :key="item.id"
              class="list-result-item"
              @click="openListDetail(item)"
            >
              <div class="list-item-header">
                <h4 class="list-item-title" v-html="stripHtmlTags(item.name)"></h4>
              </div>
              <div class="list-item-meta">
                <span v-if="item.kgBaseDisplayName || item.kgBaseName" class="meta-tag">
                  📖 {{ item.kgBaseDisplayName || item.kgBaseName }}
                </span>
                <span v-if="item.updateTime" class="meta-tag">
                  📅 {{ item.updateTime }}
                </span>
              </div>
              <div v-if="item.tagNames && item.tagNames.length > 0" class="list-item-tags">
                <span v-for="tag in item.tagNames.slice(0, 3)" :key="tag" class="tag-badge">{{ tag }}</span>
              </div>
            </div>

            <!-- 分页 -->
            <div v-if="listPagination.totalPage > 1" class="pagination">
              <span class="page-info">
                第 {{ listPagination.page }} / {{ listPagination.totalPage }} 页，共 {{ listPagination.totalRows }} 条
              </span>
              <div class="page-buttons">
                <button
                  class="page-btn"
                  :disabled="listPagination.page <= 1"
                  @click="loadListPage(listPagination.page - 1)"
                >
                  上一页
                </button>
                <button
                  class="page-btn"
                  :disabled="listPagination.page >= listPagination.totalPage"
                  @click="loadListPage(listPagination.page + 1)"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </Transition>

  <!-- 详情弹窗 -->
  <KnowledgeDetailModal
    v-model="detailVisible"
    :result="selectedResult"
    @close="detailVisible = false"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { SearchResult, BatchSearchResults, ListSearchItem } from '../services/pmphai';
import { pmphaiService } from '../services/pmphai';
import KnowledgeResultItem from './KnowledgeResultItem.vue';
import KnowledgeDetailModal from './KnowledgeDetailModal.vue';

type TabKey = 'diagnosis' | 'medication' | 'examination';
type SearchMode = 'rag' | 'list';

interface Tab {
  key: TabKey;
  label: string;
  icon: string;
}

const props = defineProps<{
  visible: boolean;
  loading?: boolean;
  results?: BatchSearchResults;
  searchKeyword?: string;  // 传入的搜索关键词（用于文档浏览模式）
  searchType?: 'diagnosis' | 'medication' | 'examination';  // 搜索类型
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  close: [];
}>();

// 知识库 ID 映射 - 根据搜索类型使用不同的知识库
const KGBASE_IDS = {
  // 诊断类：先只用疾病知识库测试效果
  diagnosis: [
    '0001AA100000000EKLSX',  // 疾病知识
  ],
  // 药品类：药物信息
  medication: [
    '0001AA100000000HUKPT',  // 药物信息
  ],
  // 检查类：检查、检验
  examination: [
    '0001AA10000000092SNV',  // 检查
    '0001AA100000000AYAJI', // 检验
  ],
};

const tabs: Tab[] = [
  { key: 'diagnosis', label: '诊断', icon: '🩺' },
  { key: 'medication', label: '药品', icon: '💊' },
  { key: 'examination', label: '检查', icon: '🔬' },
];

// RAG 模式状态
const activeTab = ref<TabKey>('diagnosis');
const detailVisible = ref(false);
const selectedResult = ref<SearchResult | null>(null);

// 搜索模式 - 从设置中读取，不允许在面板内切换
const searchMode = ref<SearchMode>(
  (localStorage.getItem('PMPHAI_SEARCH_MODE') as SearchMode) || 'rag'
);

// 文档浏览模式状态
const listSearchKey = ref('');
const listSortOption = ref('relevance');  // 排序选项: relevance, initials_asc, initials_desc
const listLoading = ref(false);
const listResults = ref<ListSearchItem[]>([]);
const listPagination = ref({
  page: 0,
  pageSize: 10,
  totalRows: 0,
  totalPage: 0,
});

// 获取当前 Tab 对应的结果 Map
const currentResultsMap = computed(() => {
  if (!props.results) return new Map<string, SearchResult[]>();

  switch (activeTab.value) {
    case 'diagnosis':
      return props.results.diagnoses;
    case 'medication':
      return props.results.medications;
    case 'examination':
      return props.results.examinations;
    default:
      return new Map<string, SearchResult[]>();
  }
});

// 当前查询词（用于高亮）
const currentQuery = computed(() => {
  const map = currentResultsMap.value;
  if (map.size > 0) {
    return Array.from(map.keys())[0] || '';
  }
  return '';
});

// 扁平化当前 Tab 的结果
const currentResults = computed(() => {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const [, items] of currentResultsMap.value) {
    for (const item of items) {
      // 去重
      if (!seen.has(item.id)) {
        seen.add(item.id);
        results.push(item);
      }
    }
  }

  // 按相似度排序
  return results.sort((a, b) => (b.score || 0) - (a.score || 0));
});

// 获取指定 Tab 的结果数量
function getTabCount(key: TabKey): number {
  if (!props.results) return 0;

  let map: Map<string, SearchResult[]>;
  switch (key) {
    case 'diagnosis':
      map = props.results.diagnoses;
      break;
    case 'medication':
      map = props.results.medications;
      break;
    case 'examination':
      map = props.results.examinations;
      break;
    default:
      return 0;
  }

  // 计算去重后的总数
  const seen = new Set<string>();
  for (const [, items] of map) {
    for (const item of items) {
      seen.add(item.id);
    }
  }
  return seen.size;
}

// 总结果数
const totalCount = computed(() => {
  return getTabCount('diagnosis') + getTabCount('medication') + getTabCount('examination');
});

// 自动切换到有结果的 Tab
watch(() => props.results, (newResults) => {
  if (!newResults) return;

  // 如果当前 Tab 没有结果，切换到有结果的 Tab
  if (getTabCount(activeTab.value) === 0) {
    for (const tab of tabs) {
      if (getTabCount(tab.key) > 0) {
        activeTab.value = tab.key;
        break;
      }
    }
  }
}, { immediate: true });

// 监听传入的搜索关键词变化（文档浏览模式下自动搜索）
watch(() => props.searchKeyword, (newKeyword) => {
  if (newKeyword && searchMode.value === 'list') {
    listSearchKey.value = newKeyword;
    performListSearch();
  }
});

function close() {
  emit('update:visible', false);
  emit('close');
}

function showDetail(result: SearchResult) {
  selectedResult.value = result;
  detailVisible.value = true;
}

async function performListSearch() {
  if (!listSearchKey.value.trim()) return;

  listLoading.value = true;
  listResults.value = [];

  try {
    // 根据搜索类型获取对应的知识库 ID
    const searchType = props.searchType || 'diagnosis';
    const kgBaseIds = KGBASE_IDS[searchType] || KGBASE_IDS.diagnosis;
    const kgBaseId = kgBaseIds[0];  // 只用第一个知识库

    // 解析排序选项
    let sortField: string | undefined;
    let sortRule: string | undefined;
    if (listSortOption.value === 'initials_asc') {
      sortField = 'initials';
      sortRule = 'ASC';
    } else if (listSortOption.value === 'initials_desc') {
      sortField = 'initials';
      sortRule = 'DESC';
    } else if(listSortOption.value === 'relevance') {
      debugger
      sortField = "";
      // sortRule = '';
    }

    const response = await pmphaiService.listSearch({
      key: listSearchKey.value.trim(),
      kgBaseId: kgBaseId,
      pageSize: 20,
      page: 0,
      sortField,
      sortRule,
    });

    if (response && response.rows) {
      listResults.value = response.rows;
      listPagination.value = {
        page: 0,
        pageSize: 20,
        totalRows: response.totalRows,
        totalPage: response.totalPage,
      };
    }
  } catch (error) {
    console.error('List search failed:', error);
  } finally {
    listLoading.value = false;
  }
}

async function loadListPage(page: number) {
  if (page < 1 || page > listPagination.value.totalPage) return;

  listLoading.value = true;

  try {
    const response = await pmphaiService.listSearch({
      key: listSearchKey.value.trim(),
      pageSize: listPagination.value.pageSize,
      page: page,
    });

    if (response) {
      listResults.value = response.rows;
      listPagination.value.page = response.page + 1;
      listPagination.value.totalRows = response.totalRows;
      listPagination.value.totalPage = response.totalPage;
    }
  } catch (error) {
    console.error('Load page failed:', error);
  } finally {
    listLoading.value = false;
  }
}

async function openListDetail(item: ListSearchItem) {
  // 文档浏览模式使用外部浏览器打开
  const pageUrl = await pmphaiService.getPageUrl({
    pageName: 'detail',
    id: item.id,
    kgBaseId: item.kgBaseId,
  });

  if (pageUrl) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(pageUrl);
    } catch (err) {
      console.error('Failed to open URL:', err);
      // 降级使用 window.open
      window.open(pageUrl, '_blank');
    }
  } else {
    console.error('Failed to generate page URL');
  }
}

// Strip HTML tags from text (for display)
function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}
</script>

<style scoped>
.knowledge-panel {
  position: fixed;
  top: 60px;
  right: 0;
  bottom: 0;
  width: 360px;
  background: #fff;
  border-left: 1px solid #EEF2F6;
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -2px 0 12px rgba(0, 0, 0, 0.06);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #EEF2F6;
  background: #FAFBFD;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1E293B;
}

.total-badge {
  background: #2B7FE3;
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #94A3B8;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #F0F6FF;
  color: #2B7FE3;
}

.tabs {
  display: flex;
  padding: 8px 12px;
  gap: 4px;
  border-bottom: 1px solid #EEF2F6;
  background: #FAFBFD;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #64748B;
  transition: all 0.2s;
  flex: 1;
  justify-content: center;
}

.tab-btn:hover {
  background: #F0F6FF;
  color: #2B7FE3;
}

.tab-btn.active {
  background: #fff;
  color: #2B7FE3;
  border-color: #EEF2F6;
  font-weight: 600;
}

.tab-icon {
  font-size: 12px;
}

.tab-label {
  font-weight: 500;
}

.tab-count {
  background: #2B7FE3;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 3px;
  min-width: 16px;
  text-align: center;
  line-height: 16px;
}

.tab-btn:not(.active) .tab-count {
  background: #94A3B8;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.panel-content::-webkit-scrollbar { width: 3px; }
.panel-content::-webkit-scrollbar-track { background: transparent; }
.panel-content::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
.panel-content::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 32px 16px;
  color: #94A3B8;
  font-size: 13px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2.5px solid #EEF2F6;
  border-top-color: #2B7FE3;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 28px;
  opacity: 0.5;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 动画 */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Mode switcher */
.mode-switcher {
  display: flex;
  padding: 8px 12px;
  gap: 6px;
  border-bottom: 1px solid #EEF2F6;
  background: #fff;
}

.mode-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #EEF2F6;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: #64748B;
  transition: all 0.2s;
}

.mode-btn:hover {
  border-color: #2B7FE3;
  color: #2B7FE3;
}

.mode-btn.active {
  background: #2B7FE3;
  border-color: #2B7FE3;
  color: white;
}

.mode-icon {
  font-size: 14px;
}

/* Search bar */
.list-search-bar {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  gap: 6px;
  border-bottom: 1px solid #EEF2F6;
  background: #FAFBFD;
}

.search-row {
  display: flex;
  gap: 6px;
}

.sort-row {
  display: flex;
}

.list-search-bar input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid #EEF2F6;
  border-radius: 4px;
  font-size: 12px;
  color: #1E293B;
  background: #fff;
  outline: none;
  transition: all 0.2s;
}

.list-search-bar input:focus {
  border-color: #2B7FE3;
  box-shadow: 0 0 0 2px rgba(43, 127, 227, 0.1);
}

.sort-select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #EEF2F6;
  border-radius: 4px;
  font-size: 12px;
  color: #1E293B;
  background: #fff;
  outline: none;
  cursor: pointer;
  transition: all 0.2s;
}

.sort-select:focus {
  border-color: #2B7FE3;
}

.sort-select:hover {
  border-color: #CBD5E1;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  background: #2B7FE3;
  color: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.search-btn:hover:not(:disabled) {
  background: #1A6FD5;
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* List result items */
.list-result-item {
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #EEF2F6;
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.list-result-item:hover {
  border-left-color: #2B7FE3;
  background: rgba(43, 127, 227, 0.03);
}

.list-item-header {
  margin-bottom: 6px;
}

.list-item-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
  line-height: 1.4;
}

.list-item-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.meta-tag {
  font-size: 11px;
  color: #94A3B8;
}

.list-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(43, 127, 227, 0.06);
  color: #2B7FE3;
  border-radius: 3px;
  font-weight: 500;
}

/* Pagination */
.pagination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #EEF2F6;
}

.page-info {
  font-size: 11px;
  color: #94A3B8;
}

.page-buttons {
  display: flex;
  gap: 6px;
}

.page-btn {
  padding: 4px 12px;
  border: 1px solid #EEF2F6;
  background: #fff;
  border-radius: 4px;
  font-size: 12px;
  color: #64748B;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
