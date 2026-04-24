<template>
  <div class="analytics-panel">
    <div class="header">
      <h2>数据分析</h2>
      <button @click="$emit('close')" class="close-btn">×</button>
    </div>

    <div class="content">
      <!-- Time Range Selector -->
      <div class="time-range-selector">
        <button
          v-for="range in timeRanges"
          :key="String(range.value)"
          :class="['range-btn', { active: selectedRange === (range.value ?? -1) }]"
          @click="selectRange(range.value)"
        >
          {{ range.label }}
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>加载数据中...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon">⚠️</div>
        <p class="error-message">{{ error }}</p>
        <button class="retry-btn" @click="loadStatistics">重试</button>
      </div>

      <!-- Empty State -->
      <div v-else-if="!hasData" class="empty-state">
        <div class="empty-icon">📊</div>
        <p class="empty-message">暂无数据</p>
        <p class="empty-hint">开始使用应用后，这里将显示统计信息</p>
      </div>

      <!-- Statistics Cards -->
      <div v-else class="stats-grid">
        <!-- Session Statistics -->
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-label">总会话数</div>
            <div class="stat-value">{{ sessionStats?.totalSessions || 0 }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">✅</div>
          <div class="stat-content">
            <div class="stat-label">完成率</div>
            <div class="stat-value">{{ completionRate }}%</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">💬</div>
          <div class="stat-content">
            <div class="stat-label">总消息数</div>
            <div class="stat-value">{{ sessionStats?.totalMessages || 0 }}</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon">⭐</div>
          <div class="stat-content">
            <div class="stat-label">反馈数</div>
            <div class="stat-value">{{ feedbackStats?.totalFeedbacks || 0 }}</div>
          </div>
        </div>
      </div>

      <!-- Session Type Distribution -->
      <div class="chart-section">
        <h3>会话类型分布</h3>
        <div class="session-types">
          <div
            v-for="(count, type) in sessionStats?.sessionsByType"
            :key="type"
            class="type-item"
          >
            <div class="type-bar-container">
              <div
                class="type-bar"
                :style="{
                  width: getPercentage(count, sessionStats?.totalSessions) + '%',
                  backgroundColor: getTypeColor(type)
                }"
              ></div>
            </div>
            <div class="type-info">
              <span class="type-label">{{ getTypeLabel(type) }}</span>
              <span class="type-count">{{ count }} ({{ getPercentage(count, sessionStats?.totalSessions) }}%)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Feedback Statistics -->
      <div class="chart-section">
        <h3>反馈统计</h3>
        <div class="feedback-stats">
          <div class="feedback-row">
            <span class="feedback-label">正面反馈率:</span>
            <div class="progress-bar">
              <div
                class="progress-fill positive"
                :style="{ width: feedbackStats?.positiveRate + '%' }"
              ></div>
            </div>
            <span class="feedback-value">{{ feedbackStats?.positiveRate.toFixed(1) }}%</span>
          </div>
          <div class="feedback-row">
            <span class="feedback-label">采纳率:</span>
            <div class="progress-bar">
              <div
                class="progress-fill adopted"
                :style="{ width: feedbackStats?.adoptionRate + '%' }"
              ></div>
            </div>
            <span class="feedback-value">{{ feedbackStats?.adoptionRate.toFixed(1) }}%</span>
          </div>
          <div class="feedback-details">
            <div class="feedback-item">
              <span class="feedback-icon positive">👍</span>
              <span>{{ feedbackStats?.positiveCount || 0 }}</span>
            </div>
            <div class="feedback-item">
              <span class="feedback-icon negative">👎</span>
              <span>{{ feedbackStats?.negativeCount || 0 }}</span>
            </div>
            <div class="feedback-item">
              <span class="feedback-icon">✓</span>
              <span>采纳: {{ feedbackStats?.adoptedCount || 0 }}</span>
            </div>
            <div class="feedback-item">
              <span class="feedback-icon">✗</span>
              <span>拒绝: {{ feedbackStats?.rejectedCount || 0 }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Metrics -->
      <div v-if="performanceStats" class="chart-section">
        <h3>性能指标</h3>
        <div class="performance-stats">
          <div class="perf-item">
            <div class="perf-label">平均 LLM 延迟</div>
            <div class="perf-value">{{ performanceStats.avgLlmLatencyMs?.toFixed(0) || 'N/A' }} ms</div>
          </div>
          <div class="perf-item">
            <div class="perf-label">平均 API 延迟</div>
            <div class="perf-value">{{ performanceStats.avgApiLatencyMs?.toFixed(0) || 'N/A' }} ms</div>
          </div>
          <div class="perf-item">
            <div class="perf-label">总 Token 数</div>
            <div class="perf-value">{{ performanceStats.totalTokenCount || 0 }}</div>
          </div>
        </div>
      </div>

      <!-- Average Duration -->
      <div v-if="sessionStats?.avgDurationMs" class="chart-section">
        <h3>平均会话时长</h3>
        <div class="duration-display">
          <div class="duration-value">{{ formatDuration(sessionStats.avgDurationMs) }}</div>
        </div>
      </div>

      <!-- Session Timeline (sessionsByDate) -->
      <div v-if="sessionStats?.sessionsByDate?.length" class="chart-section">
        <h3>会话趋势</h3>
        <div class="timeline-chart">
          <div class="timeline-bars">
            <div
              v-for="item in sessionStats.sessionsByDate"
              :key="item.date"
              class="timeline-bar-wrapper"
              :title="`${item.date}: ${item.count} 会话`"
            >
              <div
                class="timeline-bar"
                :style="{ height: getTimelineBarHeight(item.count) + '%' }"
              ></div>
              <div class="timeline-label">{{ formatDateLabel(item.date) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recommendation Statistics -->
      <div v-if="recommendationStats && recommendationStats.totalRecommendations > 0" class="chart-section">
        <h3>AI 推荐分析</h3>
        <div class="stats-grid compact">
          <div class="stat-card small">
            <div class="stat-icon">🤖</div>
            <div class="stat-content">
              <div class="stat-label">总推荐数</div>
              <div class="stat-value small">{{ recommendationStats.totalRecommendations }}</div>
            </div>
          </div>
          <div class="stat-card small">
            <div class="stat-icon">🎯</div>
            <div class="stat-content">
              <div class="stat-label">匹配率</div>
              <div class="stat-value small">{{ (recommendationStats.matchRate * 100).toFixed(1) }}%</div>
            </div>
          </div>
          <div class="stat-card small">
            <div class="stat-icon">🔤</div>
            <div class="stat-content">
              <div class="stat-label">总 Token</div>
              <div class="stat-value small">{{ recommendationStats.totalPromptTokens + recommendationStats.totalCompletionTokens }}</div>
            </div>
          </div>
        </div>
        <div v-if="Object.keys(recommendationStats.recommendationsByType).length" class="rec-type-list">
          <div v-for="(info, type) in recommendationStats.recommendationsByType" :key="type" class="rec-type-item">
            <span class="rec-type-label">{{ getRecTypeLabel(String(type)) }}</span>
            <span class="rec-type-count">{{ info.total }} 条 (匹配 {{ info.matched }})</span>
            <div class="progress-bar small">
              <div class="progress-fill adopted" :style="{ width: (info.total > 0 ? (info.matched / info.total) * 100 : 0) + '%' }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Operation Statistics -->
      <div v-if="operationStats && operationStats.totalOperations > 0" class="chart-section">
        <h3>用户操作分析</h3>
        <div class="stats-grid compact">
          <div class="stat-card small">
            <div class="stat-icon">🖱️</div>
            <div class="stat-content">
              <div class="stat-label">总操作数</div>
              <div class="stat-value small">{{ operationStats.totalOperations }}</div>
            </div>
          </div>
          <div class="stat-card small">
            <div class="stat-icon">✅</div>
            <div class="stat-content">
              <div class="stat-label">成功率</div>
              <div class="stat-value small">{{ (operationStats.successRate * 100).toFixed(1) }}%</div>
            </div>
          </div>
          <div class="stat-card small">
            <div class="stat-icon">❌</div>
            <div class="stat-content">
              <div class="stat-label">错误数</div>
              <div class="stat-value small">{{ operationStats.failureCount }}</div>
            </div>
          </div>
        </div>

        <!-- Operations by type -->
        <div v-if="Object.keys(operationStats.operationsByType).length" class="op-type-grid">
          <div v-for="(count, type) in operationStats.operationsByType" :key="type" class="op-type-chip">
            <span class="op-type-name">{{ getOperationTypeLabel(String(type)) }}</span>
            <span class="op-type-badge">{{ count }}</span>
          </div>
        </div>

        <!-- Top operations -->
        <div v-if="operationStats.topOperations.length" class="top-operations">
          <h4>最频繁操作</h4>
          <div class="top-op-list">
            <div v-for="(op, idx) in operationStats.topOperations.slice(0, 8)" :key="idx" class="top-op-item">
              <span class="top-op-rank">{{ idx + 1 }}</span>
              <span class="top-op-name">{{ op.name }}</span>
              <span class="top-op-count">{{ op.count }}次</span>
            </div>
          </div>
        </div>

        <!-- Recent errors -->
        <div v-if="operationStats.errorOperations.length" class="error-list-section">
          <h4>最近错误</h4>
          <div class="error-list">
            <div v-for="(err, idx) in operationStats.errorOperations.slice(0, 5)" :key="idx" class="error-item">
              <span class="error-name">{{ err.name }}</span>
              <span class="error-time">{{ formatTimestamp(err.createdAt) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Export & Report Actions -->
      <div class="chart-section actions-section">
        <h3>数据导出</h3>
        <div class="action-buttons">
          <button class="export-btn" @click="handleGenerateReport" :disabled="!hasData || generatingReport">
            {{ generatingReport ? '生成中...' : '生成使用报告' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, inject } from 'vue';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { feedbackService } from '../services/feedback';
import type { SessionStatistics, FeedbackStatistics, PerformanceStatistics, RecommendationStatistics, OperationStatistics } from '../types/feedback';
import { generateUsageReport } from '../services/reportGenerator';

defineEmits<{
  close: [];
}>();

const showToast = inject<(msg: string, type?: string) => void>('showToast');

interface TimeRange {
  label: string;
  value: number | null; // null means "all time"
  days?: number; // optional, for internal use
}

const timeRanges: TimeRange[] = [
  { label: '7天', value: 7, days: 7 },
  { label: '30天', value: 30, days: 30 },
  { label: '90天', value: 90, days: 90 },
  { label: '全部', value: null, days: undefined },
];

const selectedRange = ref<number>(30);
const loading = ref(false);
const error = ref<string | null>(null);
const sessionStats = ref<SessionStatistics | null>(null);
const feedbackStats = ref<FeedbackStatistics | null>(null);
const performanceStats = ref<PerformanceStatistics | null>(null);
const recommendationStats = ref<RecommendationStatistics | null>(null);
const operationStats = ref<OperationStatistics | null>(null);
const generatingReport = ref(false);

const completionRate = computed(() => {
  if (!sessionStats.value || sessionStats.value.totalSessions === 0) return 0;
  return ((sessionStats.value.completedSessions / sessionStats.value.totalSessions) * 100).toFixed(1);
});

const hasData = computed(() => {
  return sessionStats.value && sessionStats.value.totalSessions > 0;
});

async function loadStatistics() {
  loading.value = true;
  error.value = null;
  try {
    console.log('[AnalyticsPanel] Starting to load statistics...');
    const now = new Date();
    let startTimestamp: number | undefined;
    let endTimestamp: number | undefined;

    if (selectedRange.value > 0) {
      const start = new Date(now);
      start.setDate(start.getDate() - selectedRange.value);
      startTimestamp = Math.floor(start.getTime() / 1000); // Convert to Unix timestamp in seconds
    }

    endTimestamp = Math.floor(now.getTime() / 1000); // Convert to Unix timestamp in seconds

    console.log('[AnalyticsPanel] Query range:', {
      startTimestamp,
      endTimestamp,
      startDate: startTimestamp ? new Date(startTimestamp * 1000).toISOString() : 'all',
      endDate: new Date(endTimestamp * 1000).toISOString()
    });

    // Load all statistics
    console.log('[AnalyticsPanel] Calling feedbackService.getSessionStatistics...');
    const sessions = await feedbackService.getSessionStatistics(startTimestamp, endTimestamp);
    console.log('[AnalyticsPanel] Session statistics loaded:', sessions);

    console.log('[AnalyticsPanel] Calling feedbackService.getFeedbackStatistics...');
    const feedbacks = await feedbackService.getFeedbackStatistics(startTimestamp, endTimestamp);
    console.log('[AnalyticsPanel] Feedback statistics loaded:', feedbacks);

    console.log('[AnalyticsPanel] Calling feedbackService.getPerformanceStatistics...');
    const performance = await feedbackService.getPerformanceStatistics(startTimestamp, endTimestamp);
    console.log('[AnalyticsPanel] Performance statistics loaded:', performance);

    sessionStats.value = sessions;
    feedbackStats.value = feedbacks;
    performanceStats.value = performance;

    // Load new statistics
    try {
      const recommendations = await feedbackService.getRecommendationStatistics(startTimestamp, endTimestamp);
      recommendationStats.value = recommendations;
    } catch (err) {
      console.warn('[AnalyticsPanel] Failed to load recommendation stats:', err);
    }

    try {
      const operations = await feedbackService.getOperationStatistics(startTimestamp, endTimestamp);
      operationStats.value = operations;
    } catch (err) {
      console.warn('[AnalyticsPanel] Failed to load operation stats:', err);
    }

    console.log('[AnalyticsPanel] All statistics loaded successfully');
  } catch (err) {
    console.error('[AnalyticsPanel] Failed to load statistics:', err);
    console.error('[AnalyticsPanel] Error details:', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      raw: err
    });
    error.value = err instanceof Error ? err.message : '加载统计数据失败';
  } finally {
    loading.value = false;
    console.log('[AnalyticsPanel] Loading finished. loading=false');
  }
}

function selectRange(value: number | null) {
  selectedRange.value = value ?? -1; // Use -1 to represent "all time"
  loadStatistics();
}

function getPercentage(value: number, total?: number): number {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 100);
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    chat: '聊天',
    consultation: '门诊',
    voice: '语音',
    reception: '接诊',
  };
  return labels[type] || type;
}

function getTypeColor(type: string): string {
  // 使用设计令牌中的颜色
  const colors: Record<string, string> = {
    chat: '#10B981',       // --color-success
    consultation: '#0891B2', // --color-primary
    voice: '#F59E0B',      // --color-warning
    reception: '#8B5CF6',  // 紫色（医疗接诊）
  };
  return colors[type] || '#64748B'; // --color-text-muted
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}分${seconds}秒`;
}

function getTimelineBarHeight(count: number): number {
  if (!sessionStats.value?.sessionsByDate?.length) return 0;
  const max = Math.max(...sessionStats.value.sessionsByDate.map((d: any) => d.count));
  return max > 0 ? (count / max) * 100 : 0;
}

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : dateStr;
}

function getRecTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    diagnosis: '诊断',
    medication: '药品',
    examination: '检查',
  };
  return labels[type] || type;
}

function getOperationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    view_change: '视图切换',
    button_click: '按钮点击',
    form_submit: '表单提交',
    api_call: 'API 调用',
    error: '错误',
  };
  return labels[type] || type;
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function handleGenerateReport() {
  if (!hasData.value) return;
  generatingReport.value = true;
  try {
    const report = await generateUsageReport(
      sessionStats.value!,
      feedbackStats.value!,
      performanceStats.value!,
      recommendationStats.value,
      operationStats.value
    );

    const filePath = await save({
      defaultPath: `usage-report-${new Date().toISOString().split('T')[0]}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    });

    if (filePath) {
      await writeTextFile(filePath, report);
      showToast?.('报告已导出', 'success');
    }
  } catch (err) {
    console.error('[AnalyticsPanel] Failed to generate report:', err);
    showToast?.('报告生成失败', 'error');
  } finally {
    generatingReport.value = false;
  }
}

onMounted(() => {
  loadStatistics();
});
</script>

<style scoped>
.analytics-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-background-gray) 100%);
  color: var(--color-text-strong);
  font-family: var(--font-body);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(10px);
}

.header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--color-text-strong);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-weak);
  font-size: 32px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--duration-normal) var(--ease-out);
}

.close-btn:hover {
  color: var(--color-text-strong);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

/* Time Range Selector */
.time-range-selector {
  display: flex;
  gap: 10px;
  margin-bottom: 30px;
  justify-content: center;
}

.range-btn {
  padding: 8px 20px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  background: rgba(255, 255, 255, 0.8);
  color: var(--color-text-strong);
  border-radius: 20px;
  cursor: pointer;
  transition: all var(--duration-slow) var(--ease-out);
  font-size: 14px;
}

.range-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.range-btn.active {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  border-color: transparent;
  color: white;
  box-shadow: 0 4px 12px rgba(121, 194, 255, 0.4);
}

/* Loading State */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 20px;
  color: var(--color-text-weak);
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error State */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 20px;
}

.error-icon {
  font-size: 64px;
}

.error-message {
  font-size: 16px;
  color: #f44336;
  margin: 0;
}

.retry-btn {
  padding: 10px 24px;
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-slow) var(--ease-out);
}

.retry-btn:hover {
  background: var(--color-primary-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(121, 194, 255, 0.4);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 12px;
}

.empty-icon {
  font-size: 64px;
  opacity: 0.5;
}

.empty-message {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-strong);
  margin: 0;
}

.empty-hint {
  font-size: 14px;
  color: var(--color-text-weak);
  margin: 0;
}

/* Statistics Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  transition: all var(--duration-slow) var(--ease-out);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.stat-card:hover {
  background: rgba(255, 255, 255, 1);
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.stat-icon {
  font-size: 32px;
}

.stat-content {
  flex: 1;
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-weak);
  margin-bottom: 5px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text-strong);
}

/* Chart Sections */
.chart-section {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.chart-section h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-strong);
}

/* Session Types */
.session-types {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.type-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type-bar-container {
  width: 100%;
  height: 30px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 15px;
  overflow: hidden;
}

.type-bar {
  height: 100%;
  transition: width var(--duration-slower) var(--ease-out);
  border-radius: 15px;
}

.type-info {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.type-label {
  color: var(--color-text-strong);
  font-weight: 500;
}

.type-count {
  color: var(--color-text-weak);
}

/* Feedback Statistics */
.feedback-stats {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feedback-row {
  display: flex;
  align-items: center;
  gap: 15px;
}

.feedback-label {
  min-width: 100px;
  color: var(--color-text-strong);
  font-size: 14px;
}

.progress-bar {
  flex: 1;
  height: 24px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width var(--duration-slower) var(--ease-out);
  border-radius: 12px;
}

.progress-fill.positive {
  background: linear-gradient(90deg, var(--color-success), var(--color-success-border));
}

.progress-fill.adopted {
  background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
}

.feedback-value {
  min-width: 60px;
  text-align: right;
  color: var(--color-text-strong);
  font-weight: 600;
  font-size: 14px;
}

.feedback-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 15px;
  margin-top: 10px;
}

.feedback-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-strong);
}

.feedback-icon {
  font-size: 20px;
}

.feedback-icon.positive {
  filter: grayscale(0);
}

.feedback-icon.negative {
  filter: grayscale(0);
}

/* Performance Statistics */
.performance-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
}

.perf-item {
  text-align: center;
  padding: 15px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 8px;
}

.perf-label {
  font-size: 12px;
  color: var(--color-text-weak);
  margin-bottom: 8px;
}

.perf-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--color-primary);
}

/* Duration Display */
.duration-display {
  text-align: center;
  padding: 30px;
}

.duration-value {
  font-size: 36px;
  font-weight: 600;
  color: var(--color-primary);
}

/* Scrollbar */
.content::-webkit-scrollbar {
  width: 8px;
}

.content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

.content::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.content::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

/* Compact stats grid */
.stats-grid.compact {
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card.small {
  padding: 12px;
}

.stat-value.small {
  font-size: 20px;
}

/* Timeline Chart */
.timeline-chart {
  padding: 10px 0;
}

.timeline-bars {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
  overflow-x: auto;
  padding-bottom: 24px;
}

.timeline-bar-wrapper {
  flex: 1;
  min-width: 20px;
  max-width: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
}

.timeline-bar {
  width: 100%;
  min-height: 4px;
  background: linear-gradient(180deg, var(--color-primary), var(--color-primary-light));
  border-radius: 4px 4px 0 0;
  transition: height var(--duration-slow) var(--ease-out);
}

.timeline-label {
  font-size: 10px;
  color: var(--color-text-weak);
  margin-top: 4px;
  white-space: nowrap;
}

/* Recommendation type list */
.rec-type-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rec-type-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.rec-type-label {
  min-width: 60px;
  color: var(--color-text-strong);
  font-weight: 500;
}

.rec-type-count {
  min-width: 100px;
  color: var(--color-text-weak);
  font-size: 13px;
}

.progress-bar.small {
  flex: 1;
  height: 8px;
}

/* Operation type chips */
.op-type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
}

.op-type-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 16px;
  font-size: 13px;
}

.op-type-name {
  color: var(--color-text-strong);
}

.op-type-badge {
  background: var(--color-primary);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 20px;
  text-align: center;
}

/* Top operations */
.top-operations {
  margin-top: 16px;
}

.top-operations h4,
.error-list-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.top-op-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.top-op-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  font-size: 13px;
}

.top-op-rank {
  width: 20px;
  height: 20px;
  background: var(--color-primary-50);
  color: var(--color-primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.top-op-name {
  flex: 1;
  color: var(--color-text-strong);
}

.top-op-count {
  color: var(--color-text-weak);
  font-size: 12px;
}

/* Error list */
.error-list-section {
  margin-top: 16px;
}

.error-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.error-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(244, 67, 54, 0.05);
  border-left: 3px solid #f44336;
  border-radius: 4px;
  font-size: 13px;
}

.error-name {
  color: #d32f2f;
  font-weight: 500;
}

.error-time {
  color: var(--color-text-weak);
  font-size: 12px;
}

/* Action buttons section */
.actions-section {
  text-align: center;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.export-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.export-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(121, 194, 255, 0.4);
}

.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
