<template>
  <div v-if="visible" class="fact-check-widget-container">
    
    <!-- Expanded Detail Popup -->
    <Transition name="fade-slide">
      <div v-if="isExpanded && status === 'completed' && hasIssues" class="fact-check-popup">
        <div class="popup-header">
          <span class="popup-title">发现 {{ issueCount }} 个问题</span>
          <button class="close-popup-btn" @click.stop="isExpanded = false" aria-label="收起详情">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="issue-items">
          <div v-for="(issue, idx) in issues" :key="idx" class="issue-item" @click="handleIssueClick(issue)">
            <div class="issue-severity" :class="'severity-' + issue.severity">
              {{ getSeverityText(issue.severity) }}
            </div>
            <div class="issue-content">
              <div class="issue-text">{{ issue.issue }}</div>
              <div class="issue-target" v-if="issue.content">{{ issue.content }}</div>
            </div>
          </div>
        </div>
        <!-- <div class="popup-actions">
          <button class="action-btn primary" @click="handleViewAll">处理详情</button>
        </div> -->
      </div>
    </Transition>

    <!-- Floating Icon Button -->
    <Transition name="bounce">
      <div 
        class="fact-check-fab" 
        :class="statusClass" 
        @click="handleFabClick"
      >
        <!-- Scanning / Checking state -->
        <div v-if="status === 'checking'" class="fab-content checking">
          <svg class="scan-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <!-- document outline -->
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <!-- scan line -->
            <line class="scan-line" x1="4" y1="0" x2="20" y2="0" stroke="currentColor" stroke-width="2"/>
          </svg>
        </div>
        
        <!-- Success State -->
        <div v-else-if="status === 'completed' && !hasIssues" class="fab-content success">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <!-- Issue State (Dynamic Badge) -->
        <div v-else-if="status === 'completed' && hasIssues" class="fab-content has-issues">
          <svg class="report-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <div class="issue-badge-count" :class="'severity-bg-' + highestSeverity">
            {{ issueCount }}
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
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
let closeTimeout: number | null = null;

const hasIssues = computed(() => props.issues && props.issues.length > 0);
const issueCount = computed(() => props.issues ? props.issues.length : 0);

const highestSeverity = computed(() => {
  if (!props.issues) return 'low';
  if (props.issues.some(i => i.severity === 'high')) return 'high';
  if (props.issues.some(i => i.severity === 'medium')) return 'medium';
  return 'low';
});

const statusClass = computed(() => {
  if (props.status === 'checking') return 'state-checking';
  if (props.status === 'completed' && hasIssues.value) return `state-issues severity-${highestSeverity.value}`;
  if (props.status === 'completed' && !hasIssues.value) return 'state-success';
  return 'state-idle';
});

const handleFabClick = () => {
  if (props.status === 'completed' && hasIssues.value) {
    isExpanded.value = !isExpanded.value;
  } else if (props.status === 'completed' && !hasIssues.value) {
    // If clicking success icon before timeout, hide immediately
    emit('close');
  }
};

const handleIssueClick = (issue: FactCheckIssue) => {
  emit('issue-click', issue);
};

const getSeverityText = (severity: 'high' | 'medium' | 'low') => {
  const map: Record<string, string> = {
    high: '高风险',
    medium: '中风险',
    low: '需留意'
  };
  return map[severity] || '';
};

// Handle auto-expansion or auto-close logic when status updates
watch(() => props.status, (newStatus) => {
  // Clear any previous timeout
  if (closeTimeout) {
    window.clearTimeout(closeTimeout);
    closeTimeout = null;
  }

  if (newStatus === 'completed') {
    if (hasIssues.value) {
      // Do not auto-expand so it stays unobtrusive. The user clicks to view details.
      isExpanded.value = false;
    } else {
      // Auto hide when no issues after 3 seconds
      closeTimeout = window.setTimeout(() => {
        emit('close');
      }, 3000);
    }
  } else if (newStatus === 'checking') {
    isExpanded.value = false;
  }
});

watch(() => props.visible, (newVisible) => {
  if (!newVisible) {
    isExpanded.value = false;
  } else if (props.status === 'completed' && !hasIssues.value) {
     closeTimeout = window.setTimeout(() => {
        emit('close');
     }, 3000);
  }
});

onUnmounted(() => {
  if (closeTimeout) {
    window.clearTimeout(closeTimeout);
  }
});

</script>

<style scoped>
.fact-check-widget-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  pointer-events: none;
}

/* Re-enable pointer events on interactive elements */
.fact-check-popup, 
.fact-check-fab {
  pointer-events: auto;
}

/* ---------------- FAB Icon Styles ---------------- */
.fact-check-fab {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: visible;
}

.fact-check-fab:active {
  transform: scale(0.9);
}

.fab-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

/* State: Checking */
.state-checking {
  background: var(--color-background-white);
  color: var(--color-primary);
  border: 1px solid var(--color-border-light);
  cursor: default; /* Not clickable during checking */
}

.state-checking:active {
  transform: scale(1); /* disable active scaling */
}

.scan-icon {
  position: relative;
}

.scan-line {
  animation: scan-anim 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
}

@keyframes scan-anim {
  0% { transform: translateY(2px); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(20px); opacity: 0; }
}

/* State: Success */
.state-success {
  background: var(--color-success, #10B981);
  color: #fff;
  border: 1px solid transparent;
}

/* State: Issues */
.state-issues {
  background: var(--color-background-white);
  color: var(--color-text-strong);
  border: 1px solid var(--color-border-light);
  cursor: pointer;
}

.report-icon {
  color: var(--color-primary);
}

.fab-content.has-issues {
  position: relative;
}

.issue-badge-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: white;
  border: 2px solid var(--color-background-white);
  padding: 0 4px;
}

.severity-bg-high { background: var(--color-error, #EF4444); }
.severity-bg-medium { background: var(--color-warning, #F59E0B); }
.severity-bg-low { background: var(--color-info, #3B82F6); }

/* ---------------- Popup Expanded Styles ---------------- */
.fact-check-popup {
  width: 300px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: linear-gradient(135deg, #FFF7ED 0%, #FFFBF5 100%);
  border-bottom: 1px solid rgba(245, 158, 11, 0.15);
}

.popup-title {
  font-size: 13px;
  font-weight: 700;
  color: #B45309;
  display: flex;
  align-items: center;
  gap: 6px;
}

.popup-title::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  background: #F59E0B;
  border-radius: 50%;
}

.close-popup-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.close-popup-btn:hover {
  background: var(--color-border-light);
  color: var(--color-text-strong);
}

.issue-items {
  max-height: 260px;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.issue-items::-webkit-scrollbar { width: 3px; }
.issue-items::-webkit-scrollbar-track { background: transparent; }
.issue-items::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 2px; }
.issue-items::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

.issue-item {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  background: #FFFBF5;
  border: 1px solid rgba(245, 158, 11, 0.15);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.issue-item:hover {
  background: #FFF7ED;
  border-color: rgba(245, 158, 11, 0.3);
}

.issue-severity {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  height: fit-content;
  color: white;
  line-height: 1.6;
}

.issue-severity.severity-high { background: #EF4444; }
.issue-severity.severity-medium { background: #F59E0B; }
.issue-severity.severity-low { background: #3B82F6; }

.issue-content {
  flex: 1;
  min-width: 0;
}

.issue-text {
  font-size: 12px;
  color: #1E293B;
  line-height: 1.5;
  margin-bottom: 2px;
}

.issue-target {
  font-size: 11px;
  color: #64748B;
  white-space: normal;
  background: rgba(245, 158, 11, 0.06);
  padding: 3px 6px;
  border-radius: 3px;
  margin-top: 3px;
  display: inline-block;
  line-height: 1.4;
}

.popup-actions {
  padding: 12px;
  border-top: 1px solid var(--color-border-light);
  background: var(--color-background-white);
}

.action-btn {
  width: 100%;
  padding: 8px 0;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.action-btn.primary {
  background: var(--color-primary, #3B82F6);
  color: white;
}

.action-btn.primary:hover {
  filter: brightness(1.1);
}

/* ---------------- Transitions ---------------- */
.bounce-enter-active {
  animation: bounce-in 0.5s;
}
.bounce-leave-active {
  animation: bounce-in 0.3s reverse;
}

@keyframes bounce-in {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>
