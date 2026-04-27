<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import {
  medicalDataService,
  type MedicalCatalogClearOptions,
  type MedicalCatalogClearResult,
  type MedicalCatalogDebugState,
} from '../services/medicalData';

type CatalogType = 'all' | 'diagnoses' | 'items' | 'medicines';

const state = ref<MedicalCatalogDebugState | null>(null);
const loading = ref(false);
const syncing = ref(false);
const clearing = ref(false);
const message = ref('');
const catalogType = ref<CatalogType>('all');
const orgCode = ref('');

const totalRows = computed(() => {
  if (!state.value) return 0;
  return state.value.diagnosisCount + state.value.itemCount + state.value.medicineCount;
});

const latestSyncTime = computed(() => {
  const states = state.value?.syncStates ?? [];
  const latest = states.reduce<number>((max, item) => Math.max(max, item.lastSyncAt || 0), 0);
  return latest > 0 ? formatTimestamp(latest) : '暂无';
});

async function refreshState(): Promise<void> {
  loading.value = true;
  message.value = '';
  try {
    state.value = await medicalDataService.getDebugState();
  } catch (error) {
    message.value = `加载缓存状态失败：${formatError(error)}`;
  } finally {
    loading.value = false;
  }
}

async function syncCatalogs(): Promise<void> {
  syncing.value = true;
  message.value = '';
  try {
    const nextOrgCode = orgCode.value.trim();
    if (nextOrgCode) {
      await medicalDataService.setCatalogContext({ orgCode: nextOrgCode });
    } else {
      await medicalDataService.ensureLocalCatalogsSynced();
    }
    await refreshState();
    message.value = '基础数据同步已完成';
  } catch (error) {
    message.value = `同步失败：${formatError(error)}`;
  } finally {
    syncing.value = false;
  }
}

async function clearCache(): Promise<void> {
  const selectedType = catalogType.value;
  const selectedOrg = orgCode.value.trim();
  const scopeText = selectedType === 'all' ? '全部基础数据缓存' : getCatalogLabel(selectedType);
  const orgText = selectedOrg ? `（机构/缓存键：${selectedOrg}）` : '';
  if (!window.confirm(`确认清理${scopeText}${orgText}？清理后可重新同步。`)) return;

  clearing.value = true;
  message.value = '';
  try {
    const options: MedicalCatalogClearOptions = { catalogType: selectedType };
    if (selectedOrg) {
      options.orgCode = selectedOrg;
    }
    const result = await medicalDataService.clearDebugCache(options);
    await refreshState();
    message.value = formatClearResult(result);
  } catch (error) {
    message.value = `清理失败：${formatError(error)}`;
  } finally {
    clearing.value = false;
  }
}

function getCatalogLabel(type: string): string {
  const labels: Record<string, string> = {
    all: '全部',
    diagnoses: '诊断目录',
    items: '诊疗项目',
    medicines: '药品目录',
  };
  return labels[type] || type;
}

function formatClearResult(result: MedicalCatalogClearResult): string {
  return `已清理：诊断 ${result.diagnosisRows} 条，诊疗项目 ${result.itemRows} 条，药品 ${result.medicineRows} 条，同步状态 ${result.syncStateRows} 条`;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return '暂无';
  const normalized = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  return new Date(normalized).toLocaleString('zh-CN', { hour12: false });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

onMounted(refreshState);
</script>

<template>
  <section class="cache-panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">
          <Icon icon="lucide:database" :size="20" />
          <h2>基础数据缓存管理</h2>
        </div>
        <p>查看诊断、诊疗项目、药品目录的本地 SQLite 缓存状态，支持手动同步和定向清理。</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-btn" @click="refreshState" :disabled="loading">
          <Icon :icon="loading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="15" :class="{ spin: loading }" />
          刷新
        </button>
        <button type="button" class="primary-btn" @click="syncCatalogs" :disabled="syncing || loading">
          <Icon :icon="syncing ? 'lucide:loader-2' : 'lucide:cloud-download'" :size="15" :class="{ spin: syncing }" />
          同步基础数据
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <span>诊断目录</span>
        <strong>{{ state?.diagnosisCount ?? '-' }}</strong>
      </div>
      <div class="summary-card">
        <span>诊疗项目</span>
        <strong>{{ state?.itemCount ?? '-' }}</strong>
      </div>
      <div class="summary-card">
        <span>药品目录</span>
        <strong>{{ state?.medicineCount ?? '-' }}</strong>
      </div>
      <div class="summary-card">
        <span>总缓存</span>
        <strong>{{ totalRows }}</strong>
      </div>
    </div>

    <div class="status-card">
      <div>
        <span>最近同步</span>
        <strong>{{ latestSyncTime }}</strong>
      </div>
      <div>
        <span>数据库位置</span>
        <code>{{ state?.dbPath || '暂无' }}</code>
      </div>
    </div>

    <div class="controls-card">
      <div class="field-row">
        <label>
          清理范围
          <select v-model="catalogType">
            <option value="all">全部基础数据</option>
            <option value="diagnoses">诊断目录</option>
            <option value="items">诊疗项目</option>
            <option value="medicines">药品目录</option>
          </select>
        </label>
        <label>
          机构 / 缓存键（可选）
          <input v-model="orgCode" placeholder="留空表示当前机构或全部" />
        </label>
        <button type="button" class="danger-btn" @click="clearCache" :disabled="clearing || loading">
          <Icon :icon="clearing ? 'lucide:loader-2' : 'lucide:trash-2'" :size="15" :class="{ spin: clearing }" />
          清理缓存
        </button>
      </div>
      <p class="hint">诊疗项目和药品支持按机构 / 药房缓存键定向清理；诊断目录为全局缓存。</p>
    </div>

    <p v-if="message" class="message">{{ message }}</p>

    <div class="sync-state-card">
      <div class="table-title">
        <strong>同步状态明细</strong>
        <span>{{ state?.syncStates.length ?? 0 }} 条</span>
      </div>
      <div class="table-wrap">
        <table v-if="state && state.syncStates.length > 0">
          <thead>
            <tr>
              <th>类型</th>
              <th>机构 / 缓存键</th>
              <th>行数</th>
              <th>同步日期</th>
              <th>最后同步时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in state.syncStates" :key="`${item.catalogType}-${item.orgCode}`">
              <td>{{ getCatalogLabel(item.catalogType) }}</td>
              <td><code>{{ item.orgCode || '-' }}</code></td>
              <td>{{ item.rowCount }}</td>
              <td>{{ item.syncDate || '-' }}</td>
              <td>{{ formatTimestamp(item.lastSyncAt) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-state">暂无同步状态记录。</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cache-panel {
  height: 100%;
  padding: 22px;
  overflow: auto;
  background: var(--color-bg-secondary, #f8fafc);
}

.panel-header,
.header-actions,
.panel-title,
.field-row,
.table-title {
  display: flex;
  align-items: center;
}

.panel-header {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.panel-title {
  gap: 10px;
  color: var(--color-primary, #0891b2);
}

.panel-title h2 {
  margin: 0;
  color: var(--color-text-primary, #164e63);
  font-size: 20px;
}

.panel-header p,
.hint,
.message {
  margin: 6px 0 0;
  color: var(--color-text-muted, #64748b);
  font-size: 13px;
}

.header-actions,
.field-row {
  gap: 10px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.summary-card,
.status-card,
.controls-card,
.sync-state-card {
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 14px;
  background: var(--color-bg-primary, #fff);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.summary-card {
  padding: 14px 16px;
}

.summary-card span,
.status-card span {
  display: block;
  color: var(--color-text-muted, #64748b);
  font-size: 12px;
}

.summary-card strong {
  display: block;
  margin-top: 6px;
  color: var(--color-text-primary, #164e63);
  font-size: 24px;
}

.status-card {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.status-card strong,
.status-card code {
  display: block;
  margin-top: 5px;
  color: var(--color-text-primary, #164e63);
  font-size: 13px;
  word-break: break-all;
}

.controls-card,
.sync-state-card {
  padding: 14px 16px;
  margin-bottom: 12px;
}

.field-row {
  align-items: flex-end;
}

.field-row label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  color: var(--color-text-primary, #164e63);
  font-size: 13px;
  font-weight: 600;
}

select,
input {
  height: 36px;
  border: 1px solid var(--color-border-medium, #cbd5e1);
  border-radius: 8px;
  padding: 0 10px;
  background: #fff;
  color: var(--color-text-secondary, #0f172a);
  font-size: 13px;
}

.primary-btn,
.secondary-btn,
.danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.primary-btn {
  border: 1px solid var(--color-primary, #0891b2);
  background: var(--color-primary, #0891b2);
  color: #fff;
}

.secondary-btn {
  border: 1px solid var(--color-border-medium, #cbd5e1);
  background: #fff;
  color: var(--color-text-primary, #164e63);
}

.danger-btn {
  border: 1px solid rgba(220, 38, 38, 0.28);
  background: rgba(220, 38, 38, 0.06);
  color: #b91c1c;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.message {
  margin-bottom: 12px;
}

.table-title {
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--color-text-primary, #164e63);
}

.table-title span {
  color: var(--color-text-muted, #64748b);
  font-size: 12px;
}

.table-wrap {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 10px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-light, #e2e8f0);
  text-align: left;
}

th {
  position: sticky;
  top: 0;
  background: #f8fafc;
  color: var(--color-text-muted, #64748b);
  font-size: 12px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.empty-state {
  padding: 32px 16px;
  color: var(--color-text-muted, #64748b);
  text-align: center;
  font-size: 13px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
