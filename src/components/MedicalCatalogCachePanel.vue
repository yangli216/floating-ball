<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { confirm } from '@tauri-apps/plugin-dialog';
import Icon from './Icon.vue';
import {
  medicalDataService,
  type MedicalCatalogClearOptions,
  type MedicalCatalogClearResult,
  type MedicalCatalogDebugState,
} from '../services/medicalData';
import {
  clearPatientMemoryByPatientId,
  getPatientMemoryAdminState,
  queryPatientMemoryByPatientId,
  resyncPatientMemoryByPatientId,
  type PatientMemoryAdminState,
} from '../services/patientMemoryAdmin';
import type { PatientMemory } from '../services/patientMemoryStore';
import type { PatientProfile } from '../services/patientMemoryTypes';

type CatalogType = 'all' | 'diagnoses' | 'items' | 'medicines';

const state = ref<MedicalCatalogDebugState | null>(null);
const memoryState = ref<PatientMemoryAdminState | null>(null);

const loading = ref(false);
const syncing = ref(false);
const clearing = ref(false);
const message = ref('');
const messageTone = ref<'neutral' | 'success' | 'error'>('neutral');

const memoryStateLoading = ref(false);
const memoryQueryLoading = ref(false);
const memorySyncing = ref(false);
const memoryClearing = ref(false);
const memoryMessage = ref('');
const memoryMessageTone = ref<'neutral' | 'success' | 'error'>('neutral');

const catalogType = ref<CatalogType>('all');
const orgCode = ref('');
const tenantId = ref('');
const storeId = ref('');

const patientId = ref('');
const queriedPatientId = ref('');
const memoryRecord = ref<PatientMemory | null>(null);
const patientProfile = ref<PatientProfile | null>(null);

const totalRows = computed(() => {
  if (!state.value) return 0;
  return state.value.diagnosisCount + state.value.itemCount + state.value.medicineCount;
});

const latestSyncTime = computed(() => {
  const states = state.value?.syncStates ?? [];
  const latest = states.reduce<number>((max, item) => Math.max(max, item.lastSyncAt || 0), 0);
  return latest > 0 ? formatTimestamp(latest) : '暂无';
});

const patientQueryId = computed(() => patientId.value.trim());
const recentVisitCount = computed(() => memoryRecord.value?.recentVisits.length ?? 0);
const memoryUpdatedAtText = computed(() => {
  const updatedAt = memoryRecord.value?.updatedAt ?? 0;
  return updatedAt > 0 ? formatTimestamp(updatedAt) : '暂无';
});
const memoryClearButtonText = computed(() => {
  return queriedPatientId.value || patientQueryId.value ? '清空患者记忆' : '清空全部患者记忆';
});

async function refreshState(): Promise<void> {
  loading.value = true;
  message.value = '';
  messageTone.value = 'neutral';
  try {
    state.value = await medicalDataService.getDebugState();
  } catch (error) {
    message.value = `加载缓存状态失败：${formatError(error)}`;
    messageTone.value = 'error';
  } finally {
    loading.value = false;
  }
}

async function refreshPatientMemoryState(): Promise<void> {
  memoryStateLoading.value = true;
  try {
    memoryState.value = await getPatientMemoryAdminState();
  } catch (error) {
    memoryMessage.value = `加载患者记忆状态失败：${formatError(error)}`;
    memoryMessageTone.value = 'error';
  } finally {
    memoryStateLoading.value = false;
  }
}

async function refreshAll(): Promise<void> {
  await Promise.allSettled([refreshState(), refreshPatientMemoryState()]);
}

async function syncCatalogs(): Promise<void> {
  syncing.value = true;
  message.value = '';
  messageTone.value = 'neutral';
  try {
    const nextOrgCode = orgCode.value.trim();
    const nextTenantId = tenantId.value.trim();
    if (nextOrgCode || nextTenantId) {
      await medicalDataService.setCatalogContext({
        orgCode: nextOrgCode || null,
        tenantId: nextTenantId || null,
      }, { force: true });
    } else {
      await medicalDataService.ensureLocalCatalogsSynced({ force: true });
    }
    await refreshState();
    message.value = '基础数据已强制同步完成';
    messageTone.value = 'success';
  } catch (error) {
    message.value = `同步失败：${formatError(error)}`;
    messageTone.value = 'error';
  } finally {
    syncing.value = false;
  }
}

async function clearCache(): Promise<void> {
  const selectedType = catalogType.value;
  const selectedOrg = orgCode.value.trim();
  const selectedTenant = tenantId.value.trim();
  const selectedStore = storeId.value.trim();
  const scopeText = selectedType === 'all' ? '全部基础数据缓存' : getCatalogLabel(selectedType);
  const parts = [
    selectedOrg ? `机构：${selectedOrg}` : '',
    selectedTenant ? `租户：${selectedTenant}` : '',
    selectedStore ? `药房：${selectedStore}` : '',
  ].filter(Boolean);
  const scopeSuffix = parts.length > 0 ? `（${parts.join('，')}）` : '';
  const confirmed = await confirm(`确认清理${scopeText}${scopeSuffix}？清理后可重新同步。`);
  if (!confirmed) return;

  clearing.value = true;
  message.value = '';
  messageTone.value = 'neutral';
  try {
    const options: MedicalCatalogClearOptions = { catalogType: selectedType };
    if (selectedOrg) {
      options.orgCode = selectedOrg;
    }
    if (selectedTenant) {
      options.tenantId = selectedTenant;
    }
    if (selectedStore) {
      options.storeId = selectedStore;
    }
    const result = await medicalDataService.clearDebugCache(options);
    await refreshState();
    message.value = formatClearResult(result);
    messageTone.value = 'success';
  } catch (error) {
    message.value = `清理失败：${formatError(error)}`;
    messageTone.value = 'error';
  } finally {
    clearing.value = false;
  }
}

async function queryPatientMemory(): Promise<void> {
  const nextPatientId = patientQueryId.value;
  if (!nextPatientId) {
    memoryMessage.value = '请先输入患者 ID';
    memoryMessageTone.value = 'error';
    return;
  }

  memoryQueryLoading.value = true;
  memoryMessage.value = '';
  memoryMessageTone.value = 'neutral';
  try {
    const result = await queryPatientMemoryByPatientId(nextPatientId);
    memoryRecord.value = result.memory;
    patientProfile.value = result.patientProfile;
    queriedPatientId.value = nextPatientId;
    if (memoryRecord.value) {
      memoryMessage.value = '患者记忆已加载';
      memoryMessageTone.value = 'success';
    } else if (patientProfile.value) {
      memoryMessage.value = '未查到本地记忆，已补充当前患者基本信息';
      memoryMessageTone.value = 'neutral';
    } else {
      memoryMessage.value = '当前患者暂无本地记忆';
      memoryMessageTone.value = 'neutral';
    }
  } catch (error) {
    memoryMessage.value = `查询患者记忆失败：${formatError(error)}`;
    memoryMessageTone.value = 'error';
  } finally {
    memoryQueryLoading.value = false;
  }
}

async function clearMemoryRecord(): Promise<void> {
  const targetPatientId = queriedPatientId.value || patientQueryId.value;
  const clearAll = !targetPatientId;
  const confirmText = clearAll
    ? '当前未输入患者 ID，将清空全部患者记忆缓存。该操作不可撤销，确认继续？'
    : `确认清空患者 ${targetPatientId} 的本地记忆？`;
  const confirmed = await confirm(confirmText);
  if (!confirmed) return;

  memoryClearing.value = true;
  memoryMessage.value = '';
  memoryMessageTone.value = 'neutral';
  try {
    await clearPatientMemoryByPatientId(targetPatientId);
    if (clearAll || queriedPatientId.value === targetPatientId) {
      memoryRecord.value = null;
    }
    patientProfile.value = null;
    queriedPatientId.value = clearAll ? '' : targetPatientId;
    if (clearAll) {
      patientId.value = '';
    }
    await refreshPatientMemoryState();
    memoryMessage.value = clearAll ? '全部患者记忆已清空' : '患者记忆已清空';
    memoryMessageTone.value = 'success';
  } catch (error) {
    memoryMessage.value = `清空患者记忆失败：${formatError(error)}`;
    memoryMessageTone.value = 'error';
  } finally {
    memoryClearing.value = false;
  }
}

async function resyncPatientMemory(): Promise<void> {
  const targetPatientId = patientQueryId.value;
  if (!targetPatientId) {
    memoryMessage.value = '请先输入患者 ID';
    memoryMessageTone.value = 'error';
    return;
  }

  memorySyncing.value = true;
  memoryMessage.value = '';
  memoryMessageTone.value = 'neutral';
  try {
    const result = await resyncPatientMemoryByPatientId(targetPatientId);
    memoryRecord.value = result.memory;
    patientProfile.value = result.patientProfile;
    queriedPatientId.value = targetPatientId;
    await refreshPatientMemoryState();
    memoryMessage.value = memoryRecord.value
      ? '已从 HIS 重新同步患者记忆'
      : '已触发 HIS 重同步，但当前暂无本地记忆可展示';
    memoryMessageTone.value = 'success';
  } catch (error) {
    memoryMessage.value = `从 HIS 重同步失败：${formatError(error)}`;
    memoryMessageTone.value = 'error';
  } finally {
    memorySyncing.value = false;
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

function formatBackendMode(mode: PatientMemoryAdminState['mode'] | undefined): string {
  switch (mode) {
    case 'local-sqlite':
      return '本地 SQLite';
    case 'regional-http':
      return '区域 HTTP';
    case 'local-storage':
      return '浏览器 localStorage';
    default:
      return '未知';
  }
}

function formatVisitDiagnosis(visit: PatientMemory['recentVisits'][number]): string {
  if (visit.primaryDiagnosis?.trim()) return visit.primaryDiagnosis.trim();
  return visit.diagnoses[0] || '未明确';
}

function formatMedicationList(items: string[]): string {
  if (!items.length) return '无处方';
  return items.slice(0, 4).join('、');
}

function formatGender(value: PatientProfile['gender'] | undefined): string {
  if (value === 'M') return '男';
  if (value === 'F') return '女';
  if (value === 'O') return '其他';
  return '未记录';
}

function formatAge(profile: PatientProfile | null): string {
  if (!profile) return '未记录';
  if (profile.ageText?.trim()) return profile.ageText.trim();
  if (typeof profile.age === 'number') return `${profile.age}岁`;
  return '未记录';
}

onMounted(refreshAll);
</script>

<template>
  <section class="cache-panel">
    <div class="panel-header">
      <div>
        <div class="panel-title">
          <Icon icon="lucide:database" :size="20" />
          <h2>缓存管理</h2>
        </div>
        <p>统一查看不同类型的本地缓存，当前按“基础数据缓存”和“患者记忆缓存”分面板管理，减少跨类型误操作。</p>
      </div>
    </div>

    <div class="section-block">
      <div class="section-heading">
        <div class="section-heading-main">
          <strong>基础数据缓存</strong>
          <span>诊断、诊疗项目、药品目录</span>
        </div>
        <div class="section-actions">
          <button type="button" class="secondary-btn" @click="refreshState" :disabled="loading || syncing || clearing">
            <Icon :icon="loading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="15" :class="{ spin: loading }" />
            刷新状态
          </button>
          <button type="button" class="primary-btn" @click="syncCatalogs" :disabled="syncing || loading || clearing">
            <Icon :icon="syncing ? 'lucide:loader-2' : 'lucide:cloud-download'" :size="15" :class="{ spin: syncing }" />
            强制同步基础数据
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
            机构（可选）
            <input v-model="orgCode" placeholder="留空表示当前机构或全部" />
          </label>
          <label>
            租户（可选）
            <input v-model="tenantId" placeholder="例如 idTet" />
          </label>
          <label>
            药房（可选，仅药品）
            <input v-model="storeId" placeholder="例如 idSto" />
          </label>
          <button type="button" class="danger-btn" @click="clearCache" :disabled="clearing || loading">
            <Icon :icon="clearing ? 'lucide:loader-2' : 'lucide:trash-2'" :size="15" :class="{ spin: clearing }" />
            清理缓存
          </button>
        </div>
        <p class="hint">诊疗项目按机构 + 租户缓存；药品按机构 + 租户 + 药房缓存；强制同步会忽略当日缓存，但要求已建立有效的 HIS 握手上下文。</p>
      </div>

      <p v-if="message" :class="['message', `message-${messageTone}`]">{{ message }}</p>

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
                <th>机构</th>
                <th>租户</th>
                <th>药房</th>
                <th>行数</th>
                <th>同步日期</th>
                <th>最后同步时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in state.syncStates" :key="`${item.catalogType}-${item.orgCode}-${item.tenantId || ''}-${item.storeId || ''}`">
                <td>{{ getCatalogLabel(item.catalogType) }}</td>
                <td><code>{{ item.orgCode || '-' }}</code></td>
                <td><code>{{ item.tenantId || '-' }}</code></td>
                <td><code>{{ item.storeId || '-' }}</code></td>
                <td>{{ item.rowCount }}</td>
                <td>{{ item.syncDate || '-' }}</td>
                <td>{{ formatTimestamp(item.lastSyncAt) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty-state">暂无同步状态记录。</div>
        </div>
      </div>
    </div>

    <div class="section-block">
      <div class="section-heading">
        <div class="section-heading-main">
          <strong>患者记忆缓存</strong>
          <span>按患者查看本地长期记忆并从 HIS 重同步</span>
        </div>
        <div class="section-actions">
          <button type="button" class="secondary-btn" @click="refreshPatientMemoryState" :disabled="memoryStateLoading || memoryQueryLoading || memorySyncing || memoryClearing">
            <Icon :icon="memoryStateLoading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="15" :class="{ spin: memoryStateLoading }" />
            刷新状态
          </button>
        </div>
      </div>

      <div class="summary-grid summary-grid-memory">
        <div class="summary-card">
          <span>存储后端</span>
          <strong class="summary-text">{{ formatBackendMode(memoryState?.mode) }}</strong>
        </div>
        <div class="summary-card">
          <span>患者数</span>
          <strong>{{ memoryState?.patientCount ?? '-' }}</strong>
        </div>
        <div class="summary-card">
          <span>摘要数</span>
          <strong>{{ memoryState?.visitCount ?? '-' }}</strong>
        </div>
        <div class="summary-card">
          <span>最近加载患者</span>
          <strong class="summary-text">{{ queriedPatientId || '暂无' }}</strong>
        </div>
      </div>

      <div class="status-card">
        <div>
          <span>数据库位置</span>
          <code>{{ memoryState?.dbPath || '当前后端不暴露路径' }}</code>
        </div>
        <div>
          <span>最近更新时间</span>
          <strong>{{ memoryUpdatedAtText }}</strong>
        </div>
      </div>

      <div class="controls-card">
        <div class="field-row memory-field-row">
          <label class="patient-id-field">
            患者 ID
            <input v-model="patientId" placeholder="输入 patientId / idPi" @keyup.enter="queryPatientMemory" />
          </label>
          <button type="button" class="secondary-btn" @click="queryPatientMemory" :disabled="memoryQueryLoading || memorySyncing || memoryClearing">
            <Icon :icon="memoryQueryLoading ? 'lucide:loader-2' : 'lucide:search'" :size="15" :class="{ spin: memoryQueryLoading }" />
            查询患者记忆
          </button>
          <button type="button" class="primary-btn" @click="resyncPatientMemory" :disabled="memorySyncing || memoryQueryLoading || memoryClearing">
            <Icon :icon="memorySyncing ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="15" :class="{ spin: memorySyncing }" />
            从 HIS 重同步
          </button>
          <button type="button" class="danger-btn" @click="clearMemoryRecord" :disabled="memoryClearing || memoryQueryLoading || memorySyncing || memoryStateLoading">
            <Icon :icon="memoryClearing ? 'lucide:loader-2' : 'lucide:trash-2'" :size="15" :class="{ spin: memoryClearing }" />
            {{ memoryClearButtonText }}
          </button>
        </div>
        <p class="hint">查询和清空直接作用于本地患者记忆；“从 HIS 重同步”会忽略 24 小时 freshness 门禁，用 HIS 当前历史覆盖本地聚合结果。未输入患者 ID 时，点击清空会改为清空全部患者记忆，并要求二次确认。</p>
      </div>

      <p v-if="memoryMessage" :class="['message', `message-${memoryMessageTone}`]">{{ memoryMessage }}</p>

      <div class="memory-result-card">
        <div class="table-title">
          <strong>最近摘要</strong>
          <span>{{ recentVisitCount }} 条</span>
        </div>

        <div v-if="patientProfile" class="patient-profile-card">
          <div class="patient-profile-header">
            <strong>{{ patientProfile.name || queriedPatientId || '未命名患者' }}</strong>
            <span>{{ formatGender(patientProfile.gender) }} / {{ formatAge(patientProfile) }}</span>
          </div>
          <div class="patient-profile-grid">
            <p><span>患者 ID</span>{{ patientProfile.patientId }}</p>
            <p><span>手机号</span>{{ patientProfile.mobilePhone || '未记录' }}</p>
            <p><span>证件号</span>{{ patientProfile.idNo || '未记录' }}</p>
            <p><span>医保类型</span>{{ patientProfile.insuranceType || '未记录' }}</p>
          </div>
        </div>

        <template v-if="memoryRecord">
          <div class="memory-meta-grid">
            <div>
              <span>累积过敏史</span>
              <div class="tag-list">
                <span v-for="item in memoryRecord.allergyHistory" :key="`allergy-${item}`" class="tag tag-danger">{{ item }}</span>
                <span v-if="memoryRecord.allergyHistory.length === 0" class="empty-inline">暂无</span>
              </div>
            </div>
            <div>
              <span>候选慢病</span>
              <div class="tag-list">
                <span v-for="item in memoryRecord.chronicDiagnosisCandidates" :key="`chronic-${item}`" class="tag tag-accent">{{ item }}</span>
                <span v-if="memoryRecord.chronicDiagnosisCandidates.length === 0" class="empty-inline">暂无</span>
              </div>
            </div>
          </div>

          <div v-if="memoryRecord.recentVisits.length > 0" class="visit-list">
            <article v-for="visit in memoryRecord.recentVisits" :key="`${visit.completedAt}-${visit.chiefComplaint}`" class="visit-card">
              <div class="visit-card-header">
                <strong>{{ formatTimestamp(visit.completedAt) }}</strong>
                <span>{{ formatVisitDiagnosis(visit) }}</span>
              </div>
              <div class="visit-card-body">
                <p><span>主诉</span>{{ visit.chiefComplaint || '未记录' }}</p>
                <p><span>诊断</span>{{ visit.diagnoses.length ? visit.diagnoses.join('、') : '未记录' }}</p>
                <p><span>用药</span>{{ formatMedicationList(visit.medications) }}</p>
                <p><span>化验</span>{{ visit.labTests.length ? visit.labTests.join('、') : '未记录' }}</p>
              </div>
            </article>
          </div>
          <div v-else class="empty-state compact-empty">该患者当前没有最近摘要。</div>
        </template>

        <div v-else class="empty-state compact-empty">
          输入患者 ID 后可查看本地患者记忆；如果没有本地记录，可直接尝试从 HIS 重同步。
        </div>
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
.panel-title,
.field-row,
.table-title,
.section-heading,
.visit-card-header {
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
.message,
.section-heading span,
.empty-inline {
  margin: 6px 0 0;
  color: var(--color-text-muted, #64748b);
  font-size: 13px;
}

.field-row,
.section-actions {
  gap: 10px;
}

.section-block {
  margin-bottom: 16px;
  padding: 16px;
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.section-heading {
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
  color: var(--color-text-primary, #164e63);
}

.section-heading-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
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
.sync-state-card,
.memory-result-card {
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 14px;
  background: var(--color-bg-primary, #fff);
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
}

.summary-card {
  padding: 14px 16px;
}

.summary-card span,
.status-card span,
.memory-meta-grid span,
.visit-card-body span {
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

.summary-card .summary-text {
  font-size: 15px;
  line-height: 1.35;
}

.status-card {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
.sync-state-card,
.memory-result-card,
.patient-profile-card {
  padding: 14px 16px;
  margin-bottom: 12px;
}

.field-row {
  align-items: flex-end;
}

.memory-field-row {
  flex-wrap: wrap;
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

.patient-id-field {
  min-width: 240px;
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
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
}

.message-success {
  color: #166534;
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.message-error {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
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

.compact-empty {
  padding: 22px 12px;
}

.memory-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.tag {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #0f172a;
  font-size: 12px;
}

.tag-accent {
  background: #ecfeff;
  color: #155e75;
}

.tag-danger {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.patient-profile-card {
  margin-bottom: 12px;
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.patient-profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--color-text-primary, #164e63);
}

.patient-profile-header strong {
  font-size: 15px;
}

.patient-profile-header span {
  color: #475569;
  font-size: 13px;
}

.patient-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
}

.patient-profile-grid p {
  margin: 0;
  color: var(--color-text-secondary, #0f172a);
  font-size: 13px;
  line-height: 1.5;
}

.patient-profile-grid span {
  display: block;
  margin-bottom: 2px;
  color: var(--color-text-muted, #64748b);
  font-size: 12px;
}

.visit-list {
  display: grid;
  gap: 10px;
}

.visit-card {
  border: 1px solid var(--color-border-light, #e2e8f0);
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.visit-card-header {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  color: var(--color-text-primary, #164e63);
}

.visit-card-header strong {
  font-size: 14px;
}

.visit-card-header span {
  color: #0f766e;
  font-size: 13px;
  font-weight: 600;
}

.visit-card-body {
  display: grid;
  gap: 8px;
}

.visit-card-body p {
  margin: 0;
  color: var(--color-text-secondary, #0f172a);
  font-size: 13px;
  line-height: 1.5;
}

.visit-card-body span {
  margin-bottom: 2px;
}

.spin {
  animation: spin 1s linear infinite;
}

@media (max-width: 900px) {
  .panel-header,
  .section-heading,
  .field-row,
  .memory-field-row,
  .section-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-grid,
  .status-card,
  .memory-meta-grid,
  .patient-profile-grid {
    grid-template-columns: 1fr;
  }

  .section-actions button,
  .memory-field-row button {
    width: 100%;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
