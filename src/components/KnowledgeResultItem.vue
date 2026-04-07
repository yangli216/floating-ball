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
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #EEF2F6;
  border-left: 3px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.knowledge-result-item:hover {
  border-left-color: #2B7FE3;
  background: rgba(43, 127, 227, 0.03);
}

.result-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.result-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
  line-height: 1.4;
  flex: 1;
}

.score-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
}

.score-badge.high {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.score-badge.medium {
  background: rgba(245, 158, 11, 0.1);
  color: #D97706;
}

.score-badge.low {
  background: #F8FAFC;
  color: #94A3B8;
}

.result-content {
  margin: 0 0 8px 0;
  font-size: 12px;
  line-height: 1.5;
  color: #64748B;
}

.ai-abstract {
  margin-bottom: 8px;
  padding: 8px 10px;
  background: #F0F6FF;
  border-radius: 4px;
  border-left: 2px solid #2B7FE3;
}

.abstract-label {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: #2B7FE3;
  margin-bottom: 3px;
}

.abstract-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #475569;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #94A3B8;
}

.meta-icon {
  font-size: 11px;
  opacity: 0.7;
}
</style>
