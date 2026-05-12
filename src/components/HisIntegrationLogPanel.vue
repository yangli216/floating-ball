<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { confirm } from '@tauri-apps/plugin-dialog';
import Icon from './Icon.vue';
import {
  clearHisIntegrationLogs,
  exportHisIntegrationLogs,
  listHisIntegrationLogs,
  type HisIntegrationLogDirection,
  type HisIntegrationLogEntry,
  type HisIntegrationLogStatus,
} from '../services/hisIntegrationLog';

const logs = ref<HisIntegrationLogEntry[]>([]);
const loading = ref(false);
const exporting = ref(false);
const clearing = ref(false);
const selectedLog = ref<HisIntegrationLogEntry | null>(null);
const keyword = ref('');
const traceId = ref('');
const direction = ref<HisIntegrationLogDirection | ''>('');
const status = ref<HisIntegrationLogStatus | ''>('');
const message = ref('');

const query = computed(() => ({
  keyword: keyword.value.trim() || undefined,
  traceId: traceId.value.trim() || undefined,
  direction: direction.value || undefined,
  status: status.value || undefined,
  limit: 300,
}));

async function refreshLogs(): Promise<void> {
  loading.value = true;
  message.value = '';
  try {
    logs.value = await listHisIntegrationLogs(query.value);
    if (selectedLog.value) {
      selectedLog.value = logs.value.find((item) => item.id === selectedLog.value?.id) ?? logs.value[0] ?? null;
    } else {
      selectedLog.value = logs.value[0] ?? null;
    }
  } catch (error) {
    message.value = `加载失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    loading.value = false;
  }
}

async function exportLogs(): Promise<void> {
  exporting.value = true;
  message.value = '';
  try {
    const path = await exportHisIntegrationLogs(query.value);
    message.value = path ? `已导出：${path}` : '已取消导出';
  } catch (error) {
    message.value = `导出失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    exporting.value = false;
  }
}

async function clearLogs(): Promise<void> {
  const confirmed = await confirm('确认清空本机 HIS 联调日志？此操作不可撤销。');
  if (!confirmed) return;
  clearing.value = true;
  message.value = '';
  try {
    await clearHisIntegrationLogs();
    logs.value = [];
    selectedLog.value = null;
    message.value = '已清空 HIS 联调日志';
  } catch (error) {
    message.value = `清空失败：${error instanceof Error ? error.message : String(error)}`;
  } finally {
    clearing.value = false;
  }
}

async function copyLog(log: HisIntegrationLogEntry | null): Promise<void> {
  if (!log) return;
  await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
  message.value = '已复制当前日志 JSON';
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function getStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    success: '成功',
    error: '错误',
    pending: '等待',
    business_error: '业务异常',
  };
  return labels[value] || value;
}

function getDirectionLabel(value: string): string {
  return value === 'inbound' ? '入站' : '出站';
}

function hasDetailContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value as Record<string, unknown>).length > 0;
}

function formatDetailValue(value: unknown): string {
  if (!hasDetailContent(value)) return '无';
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

onMounted(refreshLogs);
</script>

<template>
  <section class="his-log-panel">
    <div class="his-log-header">
      <div>
        <div class="his-log-title">
          <Icon icon="lucide:scroll-text" :size="18" />
          <h3>HIS 联调日志</h3>
        </div>
        <p>记录本地 Bridge 入站与 PHIS 出站调用，默认脱敏，便于按 traceId 排查。</p>
      </div>
      <div class="his-log-actions">
        <button type="button" class="secondary-btn" @click="refreshLogs" :disabled="loading">
          <Icon :icon="loading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :size="15" :class="{ spin: loading }" />
          刷新
        </button>
        <button type="button" class="secondary-btn" @click="exportLogs" :disabled="exporting || loading">
          <Icon :icon="exporting ? 'lucide:loader-2' : 'lucide:download'" :size="15" :class="{ spin: exporting }" />
          导出
        </button>
        <button type="button" class="danger-btn" @click="clearLogs" :disabled="clearing || loading">
          <Icon :icon="clearing ? 'lucide:loader-2' : 'lucide:trash-2'" :size="15" :class="{ spin: clearing }" />
          清空
        </button>
      </div>
    </div>

    <div class="his-log-filters">
      <input v-model="traceId" placeholder="traceId" @keyup.enter="refreshLogs" />
      <input v-model="keyword" placeholder="接口 / 患者 / requestId" @keyup.enter="refreshLogs" />
      <select v-model="direction" @change="refreshLogs">
        <option value="">全部方向</option>
        <option value="inbound">入站 Bridge</option>
        <option value="outbound">出站 PHIS</option>
      </select>
      <select v-model="status" @change="refreshLogs">
        <option value="">全部状态</option>
        <option value="success">成功</option>
        <option value="business_error">业务异常</option>
        <option value="error">错误</option>
        <option value="pending">等待</option>
      </select>
      <button type="button" class="primary-btn" @click="refreshLogs">查询</button>
    </div>

    <p v-if="message" class="his-log-message">{{ message }}</p>

    <div class="his-log-body">
      <div class="his-log-list">
        <button
          v-for="log in logs"
          :key="log.id"
          type="button"
          :class="['his-log-row', log.status, { active: selectedLog?.id === log.id }]"
          @click="selectedLog = log"
        >
          <div class="row-main">
            <span class="direction">{{ getDirectionLabel(log.direction) }}</span>
            <strong>{{ log.operation }}</strong>
            <span class="path">{{ log.path }}</span>
          </div>
          <div class="row-meta">
            <span>{{ formatTime(log.createdAt) }}</span>
            <span>{{ log.durationMs ?? '-' }}ms</span>
            <span :class="['status-pill', log.status]">{{ getStatusLabel(log.status) }}</span>
          </div>
        </button>
        <div v-if="!loading && logs.length === 0" class="empty-state">暂无日志，触发 HIS / PHIS 调用后点击刷新。</div>
      </div>

      <div class="his-log-detail">
        <template v-if="selectedLog">
          <div class="detail-toolbar">
            <div>
              <strong>{{ selectedLog.operation }}</strong>
              <span>{{ selectedLog.traceId }}</span>
            </div>
            <button type="button" class="secondary-btn" @click="copyLog(selectedLog)">
              <Icon icon="lucide:copy" :size="14" />
              复制
            </button>
          </div>
          <dl class="detail-grid">
            <div><dt>方向</dt><dd>{{ getDirectionLabel(selectedLog.direction) }}</dd></div>
            <div><dt>状态</dt><dd>{{ getStatusLabel(selectedLog.status) }}</dd></div>
            <div><dt>HTTP</dt><dd>{{ selectedLog.httpStatus ?? '-' }}</dd></div>
            <div><dt>业务码</dt><dd>{{ selectedLog.businessCode || '-' }}</dd></div>
            <div><dt>耗时</dt><dd>{{ selectedLog.durationMs ?? '-' }}ms</dd></div>
            <div><dt>时间</dt><dd>{{ formatTime(selectedLog.createdAt) }}</dd></div>
            <div><dt>患者</dt><dd>{{ selectedLog.patientId || '-' }}</dd></div>
            <div><dt>问诊</dt><dd>{{ selectedLog.consultationId || '-' }}</dd></div>
            <div><dt>回执</dt><dd>{{ selectedLog.requestId || '-' }}</dd></div>
          </dl>

          <div class="detail-sections">
            <section class="detail-section">
              <div class="section-heading">
                <h4>请求摘要</h4>
                <span>{{ hasDetailContent(selectedLog.requestSummary) ? '已记录' : '无请求体/无参数' }}</span>
              </div>
              <pre>{{ formatDetailValue(selectedLog.requestSummary) }}</pre>
            </section>

            <section class="detail-section">
              <div class="section-heading">
                <h4>响应摘要</h4>
                <span>{{ hasDetailContent(selectedLog.responseSummary) ? '已记录' : '暂无响应摘要' }}</span>
              </div>
              <pre>{{ formatDetailValue(selectedLog.responseSummary) }}</pre>
            </section>

            <section v-if="selectedLog.errorMessage" class="detail-section detail-section--error">
              <div class="section-heading">
                <h4>错误摘要</h4>
                <span>用于定位请求失败原因</span>
              </div>
              <pre>{{ selectedLog.errorMessage }}</pre>
            </section>

            <section class="detail-section detail-section--raw">
              <div class="section-heading">
                <h4>完整原始日志</h4>
                <span>含请求/响应摘要与所有元信息</span>
              </div>
              <pre>{{ JSON.stringify(selectedLog, null, 2) }}</pre>
            </section>
          </div>
        </template>
        <div v-else class="empty-state">选择左侧日志查看详情。</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.his-log-panel {
  background: var(--medical-bg-primary);
  border: 1px solid var(--medical-border-light);
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.his-log-header,
.his-log-actions,
.his-log-title,
.row-main,
.row-meta,
.detail-toolbar {
  display: flex;
  align-items: center;
}

.his-log-header {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.his-log-title {
  gap: 8px;
  color: var(--medical-primary);
}

.his-log-title h3 {
  margin: 0;
  color: var(--medical-text-primary);
  font-size: 18px;
}

.his-log-header p {
  margin: 6px 0 0;
  color: var(--medical-text-muted);
  font-size: 13px;
}

.his-log-actions,
.row-meta {
  gap: 8px;
}

.his-log-filters {
  display: grid;
  grid-template-columns: 1.2fr 1.4fr 140px 120px auto;
  gap: 8px;
  margin-bottom: 12px;
}

.his-log-filters input,
.his-log-filters select {
  height: 34px;
  border: 1px solid var(--medical-border-medium);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--medical-text-secondary);
  background: var(--medical-bg-primary);
  font-size: 13px;
}

.primary-btn,
.secondary-btn,
.danger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn {
  border: 1px solid var(--medical-primary);
  background: var(--medical-primary);
  color: white;
}

.secondary-btn {
  border: 1px solid var(--medical-border-medium);
  background: var(--medical-bg-primary);
  color: var(--medical-text-primary);
}

.danger-btn {
  border: 1px solid rgba(220, 38, 38, 0.28);
  background: rgba(220, 38, 38, 0.06);
  color: #b91c1c;
}

.primary-btn:disabled,
.secondary-btn:disabled,
.danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.his-log-message {
  margin: 0 0 10px;
  color: var(--medical-text-muted);
  font-size: 12px;
}

.his-log-body {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.1fr);
  gap: 12px;
  min-height: 360px;
}

.his-log-list,
.his-log-detail {
  min-height: 360px;
  max-height: 520px;
  overflow: auto;
  border: 1px solid var(--medical-border-light);
  border-radius: 10px;
  background: var(--medical-bg-secondary);
}

.his-log-row {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--medical-border-light);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.his-log-row:hover,
.his-log-row.active {
  background: rgba(8, 145, 178, 0.08);
}

.row-main {
  gap: 8px;
  min-width: 0;
}

.row-main strong,
.path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.direction {
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 999px;
  background: white;
  color: var(--medical-primary);
  font-size: 11px;
  font-weight: 700;
}

.path {
  color: var(--medical-text-muted);
  font-size: 12px;
}

.row-meta {
  margin-top: 6px;
  color: var(--medical-text-muted);
  font-size: 12px;
}

.status-pill {
  padding: 2px 6px;
  border-radius: 999px;
  font-weight: 700;
}

.status-pill.success { color: #047857; background: #d1fae5; }
.status-pill.error { color: #b91c1c; background: #fee2e2; }
.status-pill.business_error { color: #b45309; background: #fef3c7; }
.status-pill.pending { color: #1d4ed8; background: #dbeafe; }

.his-log-detail {
  padding: 12px;
}

.detail-toolbar {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.detail-toolbar div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.detail-toolbar span {
  color: var(--medical-text-muted);
  font-size: 12px;
  word-break: break-all;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 0 0 10px;
}

.detail-grid div {
  padding: 8px;
  border-radius: 8px;
  background: white;
}

.detail-grid dt {
  color: var(--medical-text-muted);
  font-size: 11px;
}

.detail-grid dd {
  margin: 3px 0 0;
  color: var(--medical-text-primary);
  font-size: 12px;
  font-weight: 700;
}

.detail-sections {
  display: grid;
  gap: 10px;
}

.detail-section {
  border: 1px solid var(--medical-border-light);
  border-radius: 10px;
  overflow: hidden;
  background: white;
}

.detail-section--error {
  border-color: rgba(220, 38, 38, 0.2);
}

.detail-section--error .section-heading {
  background: rgba(220, 38, 38, 0.06);
}

.detail-section--raw .section-heading {
  background: rgba(15, 23, 42, 0.04);
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--medical-border-light);
  background: var(--medical-bg-primary);
}

.section-heading h4 {
  margin: 0;
  color: var(--medical-text-primary);
  font-size: 13px;
}

.section-heading span {
  color: var(--medical-text-muted);
  font-size: 12px;
}

pre {
  margin: 0;
  padding: 12px;
  overflow: auto;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.5;
}

.empty-state {
  padding: 28px 16px;
  color: var(--medical-text-muted);
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
