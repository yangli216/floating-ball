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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { feedbackService } from '../services/feedback';
import type { SessionStatistics, FeedbackStatistics, PerformanceStatistics } from '../types/feedback';

defineEmits<{
  close: [];
}>();

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
    const now = new Date();
    let startTimestamp: number | undefined;
    let endTimestamp: number | undefined;

    if (selectedRange.value > 0) {
      const start = new Date(now);
      start.setDate(start.getDate() - selectedRange.value);
      startTimestamp = Math.floor(start.getTime() / 1000); // Convert to Unix timestamp in seconds
    }

    endTimestamp = Math.floor(now.getTime() / 1000); // Convert to Unix timestamp in seconds

    // Load all statistics
    const [sessions, feedbacks, performance] = await Promise.all([
      feedbackService.getSessionStatistics(startTimestamp, endTimestamp),
      feedbackService.getFeedbackStatistics(startTimestamp, endTimestamp),
      feedbackService.getPerformanceStatistics(startTimestamp, endTimestamp),
    ]);

    sessionStats.value = sessions;
    feedbackStats.value = feedbacks;
    performanceStats.value = performance;
  } catch (err) {
    console.error('Failed to load statistics:', err);
    error.value = err instanceof Error ? err.message : '加载统计数据失败';
  } finally {
    loading.value = false;
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
  const colors: Record<string, string> = {
    chat: '#4CAF50',
    consultation: '#2196F3',
    voice: '#FF9800',
    reception: '#9C27B0',
  };
  return colors[type] || '#757575';
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}分${seconds}秒`;
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
  background: linear-gradient(135deg, #e3f2fd 0%, #f5f7fa 100%);
  color: var(--text-strong);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
  color: var(--text-strong);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-weak);
  font-size: 32px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-btn:hover {
  color: var(--text-strong);
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
  color: var(--text-strong);
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 14px;
}

.range-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.range-btn.active {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%);
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
  color: var(--text-weak);
}

.spinner {
  width: 50px;
  height: 50px;
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-top-color: var(--accent);
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
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.retry-btn:hover {
  background: var(--accent-strong);
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
  color: var(--text-strong);
  margin: 0;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-weak);
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
  transition: all 0.3s;
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
  color: var(--text-weak);
  margin-bottom: 5px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
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
  color: var(--text-strong);
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
  transition: width 0.5s ease;
  border-radius: 15px;
}

.type-info {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.type-label {
  color: var(--text-strong);
  font-weight: 500;
}

.type-count {
  color: var(--text-weak);
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
  color: var(--text-strong);
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
  transition: width 0.5s ease;
  border-radius: 12px;
}

.progress-fill.positive {
  background: linear-gradient(90deg, #4CAF50, #66BB6A);
}

.progress-fill.adopted {
  background: linear-gradient(90deg, #2196F3, #42A5F5);
}

.feedback-value {
  min-width: 60px;
  text-align: right;
  color: var(--text-strong);
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
  color: var(--text-strong);
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
  color: var(--text-weak);
  margin-bottom: 8px;
}

.perf-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--accent);
}

/* Duration Display */
.duration-display {
  text-align: center;
  padding: 30px;
}

.duration-value {
  font-size: 36px;
  font-weight: 600;
  color: var(--accent);
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
</style>
