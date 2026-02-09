<template>
  <div class="knowledge-result-item" @click="$emit('click')">
    <div class="result-header">
      <h4 class="result-title">{{ result.name }}</h4>
      <span v-if="result.score" class="score-badge" :class="scoreClass">
        {{ Math.round((result.score || 0) * 100) }}%
      </span>
    </div>

    <p class="result-content">{{ truncatedContent }}</p>

    <div v-if="result.aiAbstract" class="ai-abstract">
      <span class="abstract-label">AI 摘要</span>
      <p class="abstract-text">{{ result.aiAbstract }}</p>
    </div>

    <div class="result-meta">
      <span v-if="result.sourceInfo?.knowledgeLibName" class="meta-item">
        <span class="meta-icon">📖</span>
        {{ result.sourceInfo.knowledgeLibName }}
      </span>
      <span v-if="result.sourceInfo?.publishYear" class="meta-item">
        <span class="meta-icon">📅</span>
        {{ result.sourceInfo.publishYear }}
      </span>
      <span v-if="result.words" class="meta-item">
        <span class="meta-icon">📝</span>
        {{ result.words }} 字
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SearchResult } from '../services/pmphai';

const props = defineProps<{
  result: SearchResult;
  query?: string;
}>();

defineEmits<{
  click: [];
}>();

// 截断内容
const truncatedContent = computed(() => {
  const content = props.result.content || '';
  const maxLength = 150;
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '...';
});

// 根据相似度设置样式
const scoreClass = computed(() => {
  const score = props.result.score || 0;
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
});
</script>

<style scoped>
.knowledge-result-item {
  padding: 14px 16px;
  background: var(--color-background-white, #ffffff);
  border: 1px solid var(--color-border-light, #e5e7eb);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.knowledge-result-item:hover {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.12);
  transform: translateY(-1px);
}

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.result-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-strong, #1f2937);
  line-height: 1.4;
  flex: 1;
}

.score-badge {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 6px;
}

.score-badge.high {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
}

.score-badge.medium {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.score-badge.low {
  background: var(--color-background-gray, #f3f4f6);
  color: var(--color-text-medium, #6b7280);
}

.result-content {
  margin: 0 0 10px 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-medium, #4b5563);
}

.ai-abstract {
  margin-bottom: 10px;
  padding: 10px 12px;
  background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
  border-radius: 8px;
  border-left: 3px solid var(--color-primary, #3b82f6);
}

.abstract-label {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
  margin-bottom: 4px;
}

.abstract-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-medium, #4b5563);
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.meta-icon {
  font-size: 12px;
  opacity: 0.8;
}
</style>
