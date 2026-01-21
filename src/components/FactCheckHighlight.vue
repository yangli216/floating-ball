<template>
  <div class="fact-check-highlight">
    <!-- 包装的内容 -->
    <span :class="{ 'highlighted-text': hasIssue }">
      <slot></slot>
    </span>

    <!-- 问题提示图标 -->
    <span
      v-if="hasIssue"
      ref="indicatorRef"
      class="issue-indicator"
      :class="severityClass"
      @click="handleClick"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="7" fill="currentColor"/>
        <text x="8" y="11" text-anchor="middle" fill="white" font-size="10" font-weight="bold">!</text>
      </svg>
    </span>

    <!-- Tooltip - 使用 Teleport 渲染到 body -->
    <Teleport to="body">
      <Transition name="tooltip-fade">
        <div
          v-if="showTooltip && issue"
          ref="tooltipRef"
          class="issue-tooltip-global"
          :style="tooltipStyle"
        >
          <div class="tooltip-header">
            <span class="severity-badge" :class="severityClass">{{ getSeverityText() }}</span>
          </div>
          <div class="tooltip-content">{{ issue.issue }}</div>
          <div v-if="issue.suggestion" class="tooltip-suggestion">
            <strong>建议：</strong>{{ issue.suggestion }}
          </div>
          <div class="tooltip-arrow" :style="arrowStyle"></div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { FactCheckIssue } from '../services/factChecker';

interface Props {
  issue?: FactCheckIssue;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'click': [issue: FactCheckIssue];
}>();

const showTooltip = ref(false);
const indicatorRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const tooltipStyle = ref<Record<string, string>>({});
const arrowStyle = ref<Record<string, string>>({});

const hasIssue = computed(() => !!props.issue);

const severityClass = computed(() => {
  if (!props.issue) return '';
  return `severity-${props.issue.severity}`;
});

const handleClick = () => {
  if (props.issue) {
    emit('click', props.issue);
  }
};

const handleMouseEnter = async () => {
  showTooltip.value = true;
  await nextTick();
  adjustTooltipPosition();
};

const handleMouseLeave = () => {
  showTooltip.value = false;
  tooltipStyle.value = {};
  arrowStyle.value = {};
};

const adjustTooltipPosition = () => {
  if (!tooltipRef.value || !indicatorRef.value) return;

  const indicator = indicatorRef.value;
  const tooltip = tooltipRef.value;

  const indicatorRect = indicator.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;

  // 计算 tooltip 应该显示的位置
  let top = indicatorRect.top - tooltipRect.height - 12; // 12px 间距
  let left = indicatorRect.left + indicatorRect.width / 2;

  // 默认箭头居中
  let arrowLeft = '50%';
  let arrowTransform = 'translateX(-50%)';

  // 检查上方是否有足够空间
  const showBelow = top < 20;
  if (showBelow) {
    // 显示在下方
    top = indicatorRect.bottom + 12;
    tooltipStyle.value = {
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      transform: 'translateX(-50%)',
      zIndex: '99999'
    };
    arrowStyle.value = {
      top: '-6px',
      left: '50%',
      transform: 'translateX(-50%) rotate(180deg)'
    };
    return;
  }

  // 检查左右边界
  const tooltipWidth = tooltipRect.width;
  const halfWidth = tooltipWidth / 2;

  // 检查右边界溢出
  if (left + halfWidth > viewportWidth - 20) {
    left = viewportWidth - tooltipWidth - 20;
    arrowLeft = `${indicatorRect.left + indicatorRect.width / 2 - left}px`;
    arrowTransform = 'none';
  }
  // 检查左边界溢出
  else if (left - halfWidth < 20) {
    left = 20;
    arrowLeft = `${indicatorRect.left + indicatorRect.width / 2 - left}px`;
    arrowTransform = 'none';
  } else {
    // 居中显示
    left = left - halfWidth;
  }

  tooltipStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    zIndex: '99999'
  };

  arrowStyle.value = {
    bottom: '-6px',
    left: arrowLeft,
    transform: arrowTransform
  };
};

const getSeverityText = () => {
  if (!props.issue) return '';

  const severityMap = {
    high: '高风险',
    medium: '中风险',
    low: '低风险'
  };

  return severityMap[props.issue.severity] || '';
};
</script>

<style scoped>
.fact-check-highlight {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
}

.highlighted-text {
  background: linear-gradient(to bottom, transparent 60%, rgba(239, 68, 68, 0.2) 60%);
  border-radius: 2px;
  padding: 0 2px;
}

.issue-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
}

.issue-indicator svg {
  transition: transform 0.2s;
}

.issue-indicator:hover svg {
  transform: scale(1.1);
}

.issue-indicator.severity-high {
  color: #ef4444;
}

.issue-indicator.severity-medium {
  color: #f59e0b;
}

.issue-indicator.severity-low {
  color: #3b82f6;
}

/* Global tooltip rendered via Teleport */
.issue-tooltip-global {
  background: #1f2937;
  color: white;
  border-radius: 8px;
  padding: 14px;
  min-width: 250px;
  max-width: 450px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  pointer-events: none;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.tooltip-arrow {
  position: absolute;
  width: 0;
  height: 0;
  border: 6px solid transparent;
  border-top-color: #1f2937;
}

.tooltip-header {
  margin-bottom: 8px;
}

.severity-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.severity-badge.severity-high {
  background: #ef4444;
  color: white;
}

.severity-badge.severity-medium {
  background: #f59e0b;
  color: white;
}

.severity-badge.severity-low {
  background: #3b82f6;
  color: white;
}

.tooltip-content {
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 8px;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.tooltip-suggestion {
  font-size: 12px;
  line-height: 1.4;
  color: #d1d5db;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 8px;
  white-space: normal;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.tooltip-suggestion strong {
  color: white;
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.2s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}
</style>
