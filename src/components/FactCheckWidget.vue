<template>
  <Transition name="slide-up">
    <div v-if="visible" class="fact-check-widget" :class="{ expanded: isExpanded }">
      <!-- Header -->
      <div class="widget-header" @click="toggleExpand">
        <div class="header-left">
          <div class="icon-container" :class="statusClass">
            <svg v-if="status === 'checking'" class="spinner-icon" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
            </svg>
            <svg v-else-if="status === 'completed' && !hasIssues" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg v-else-if="status === 'completed' && hasIssues" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="currentColor"/>
              <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">!</text>
            </svg>
          </div>
          <div class="header-text">
            <div class="title">{{ getTitle() }}</div>
            <div class="subtitle">{{ getSubtitle() }}</div>
          </div>
        </div>
        <div class="header-right">
          <svg class="expand-icon" :class="{ rotated: isExpanded }" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 9l-7 7-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </div>

      <!-- Expanded Content -->
      <Transition name="expand">
        <div v-if="isExpanded" class="widget-content">
          <div v-if="status === 'checking'" class="checking-state">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: progress + '%' }"></div>
            </div>
            <div class="checking-text">正在审查 {{ checkedCount }}/{{ totalCount }} 项...</div>
          </div>

          <div v-else-if="status === 'completed' && hasIssues" class="issues-list">
            <div class="issues-header">
              <span class="issues-count">发现 {{ issueCount }} 个问题</span>
              <button class="view-all-btn" @click="handleViewAll">查看全部</button>
            </div>
            <div class="issue-items">
              <div v-for="(issue, idx) in displayedIssues" :key="idx" class="issue-item" @click="handleIssueClick(issue)">
                <div class="issue-severity" :class="'severity-' + issue.severity">
                  {{ getSeverityText(issue.severity) }}
                </div>
                <div class="issue-content">
                  <div class="issue-text">{{ issue.issue }}</div>
                  <div class="issue-target" v-if="issue.content">{{ issue.content }}</div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="status === 'completed' && !hasIssues" class="success-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#10b981" stroke-width="2"/>
              <path d="M8 12l3 3 5-5" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div class="success-text">未发现明显问题</div>
            <div class="success-desc">内容已通过事实核查</div>
          </div>

          <!-- Actions -->
          <div v-if="status === 'completed'" class="widget-actions">
            <button class="action-btn secondary" @click="handleClose">关闭</button>
            <button v-if="hasIssues" class="action-btn primary" @click="handleViewAll">查看详情</button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { FactCheckIssue } from '../services/factChecker';

interface Props {
  visible?: boolean;
  status?: 'idle' | 'checking' | 'completed';
  issues?: FactCheckIssue[];
  progress?: number;
  checkedCount?: number;
  totalCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  status: 'idle',
  issues: () => [],
  progress: 0,
  checkedCount: 0,
  totalCount: 0
});

const emit = defineEmits<{
  'close': [];
  'view-all': [];
  'issue-click': [issue: FactCheckIssue];
}>();

const isExpanded = ref(false);

const hasIssues = computed(() => props.issues.length > 0);
const issueCount = computed(() => props.issues.length);

const displayedIssues = computed(() => {
  // Show max 3 issues in collapsed view
  return props.issues.slice(0, 3);
});

const statusClass = computed(() => {
  if (props.status === 'checking') return 'checking';
  if (props.status === 'completed' && hasIssues.value) return 'has-issues';
  if (props.status === 'completed' && !hasIssues.value) return 'success';
  return '';
});

const toggleExpand = () => {
  isExpanded.value = !isExpanded.value;
};

const getTitle = () => {
  if (props.status === 'checking') return '独立 AI 审查中...';
  if (props.status === 'completed' && hasIssues.value) return `发现 ${issueCount.value} 个问题`;
  if (props.status === 'completed' && !hasIssues.value) return '核查完成';
  return '事实核查';
};

const getSubtitle = () => {
  if (props.status === 'checking') return `正在审查内容准确性...`;
  if (props.status === 'completed' && hasIssues.value) return '点击展开查看详情';
  if (props.status === 'completed' && !hasIssues.value) return '内容已通过核查';
  return '';
};

const getSeverityText = (severity: 'high' | 'medium' | 'low') => {
  const map = {
    high: '高风险',
    medium: '中风险',
    low: '低风险'
  };
  return map[severity] || '';
};

const handleClose = () => {
  emit('close');
};

const handleViewAll = () => {
  emit('view-all');
};

const handleIssueClick = (issue: FactCheckIssue) => {
  emit('issue-click', issue);
};

// Auto expand when issues are found
watch(() => props.status, (newStatus) => {
  if (newStatus === 'completed' && hasIssues.value) {
    isExpanded.value = true;
  }
});

// Auto expand when status changes to checking
watch(() => props.status, (newStatus) => {
  if (newStatus === 'checking') {
    isExpanded.value = true;
  }
});
</script>

<style scoped>
.fact-check-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 360px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  z-index: 9999;
  transition: all 0.3s ease;
}

.fact-check-widget.expanded {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.widget-header:hover {
  background: #f9fafb;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.icon-container {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-container.checking {
  background: #dbeafe;
  color: #2563eb;
}

.icon-container.has-issues {
  background: #fee2e2;
  color: #ef4444;
}

.icon-container.success {
  background: #d1fae5;
  color: #10b981;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.header-text {
  flex: 1;
  min-width: 0;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 2px;
}

.subtitle {
  font-size: 12px;
  color: #6b7280;
}

.header-right {
  flex-shrink: 0;
}

.expand-icon {
  color: #9ca3af;
  transition: transform 0.3s;
}

.expand-icon.rotated {
  transform: rotate(180deg);
}

.widget-content {
  border-top: 1px solid #f3f4f6;
  padding: 16px;
  max-height: 400px;
  overflow-y: auto;
}

.checking-state {
  padding: 8px 0;
}

.progress-bar {
  width: 100%;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  transition: width 0.3s;
  border-radius: 2px;
}

.checking-text {
  font-size: 13px;
  color: #6b7280;
  text-align: center;
}

.issues-list {
  /* padding: 8px 0; */
}

.issues-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.issues-count {
  font-size: 13px;
  font-weight: 600;
  color: #1f2937;
}

.view-all-btn {
  font-size: 12px;
  color: #2563eb;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.view-all-btn:hover {
  background: #dbeafe;
}

.issue-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.issue-item {
  display: flex;
  gap: 8px;
  padding: 10px;
  background: #f9fafb;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.issue-item:hover {
  background: #f3f4f6;
  transform: translateX(-2px);
}

.issue-severity {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  height: fit-content;
}

.issue-severity.severity-high {
  background: #fee2e2;
  color: #ef4444;
}

.issue-severity.severity-medium {
  background: #fed7aa;
  color: #f59e0b;
}

.issue-severity.severity-low {
  background: #dbeafe;
  color: #3b82f6;
}

.issue-content {
  flex: 1;
  min-width: 0;
}

.issue-text {
  font-size: 13px;
  color: #1f2937;
  line-height: 1.5;
  margin-bottom: 4px;
}

.issue-target {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
}

.success-text {
  font-size: 14px;
  font-weight: 600;
  color: #10b981;
  margin-top: 12px;
  margin-bottom: 4px;
}

.success-desc {
  font-size: 12px;
  color: #6b7280;
}

.widget-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f3f4f6;
}

.action-btn {
  flex: 1;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.action-btn.secondary {
  background: #f3f4f6;
  color: #6b7280;
}

.action-btn.secondary:hover {
  background: #e5e7eb;
}

.action-btn.primary {
  background: #2563eb;
  color: white;
}

.action-btn.primary:hover {
  background: #1d4ed8;
}

/* Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

/* Scrollbar styling */
.widget-content::-webkit-scrollbar {
  width: 4px;
}

.widget-content::-webkit-scrollbar-track {
  background: transparent;
}

.widget-content::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 2px;
}

.widget-content::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>
