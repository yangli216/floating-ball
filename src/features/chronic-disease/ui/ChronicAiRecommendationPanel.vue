<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type { ChronicAiRecommendation } from '../types';

defineProps<{
  eligible: boolean;
  items: readonly ChronicAiRecommendation[];
  selectedIds: readonly string[];
  loading: boolean;
  loaded: boolean;
  error: string;
  preparing: boolean;
  prepareError: string;
}>();

const emit = defineEmits<{
  retry: [];
  submit: [];
  toggle: [id: string];
}>();
</script>

<template>
  <div v-if="!eligible" class="recommendation-state">
    该患者未识别为高血压或 2 型糖尿病管理对象，不生成慢病 AI 推荐。
  </div>

  <div v-else-if="loading" class="recommendation-state loading" role="status">
    <Icon icon="lucide:loader-circle" size="17" />
    <span><b>正在生成 AI 推荐</b><small>分析慢病资料与 HIS 可开立目录</small></span>
  </div>

  <div v-else-if="error" class="recommendation-state error" role="alert">
    <Icon icon="lucide:circle-alert" size="17" />
    <span><b>暂时无法生成推荐</b><small>{{ error }}</small></span>
    <button type="button" @click="emit('retry')">重试</button>
  </div>

  <template v-else-if="loaded && items.length > 0">
    <div class="subsection-heading">
      <strong>当前 HIS 可开立项目</strong>
      <span>AI 推荐 · 医生确认</span>
    </div>
    <div class="recommendation-list">
      <label v-for="item in items" :key="item.id">
        <input
          type="checkbox"
          :checked="selectedIds.includes(item.id)"
          @change="emit('toggle', item.id)"
        />
        <span class="recommendation-copy">
          <span class="recommendation-title">
            <b>{{ item.name }}</b>
            <small>{{ item.type === 'exam' ? '检查' : '检验' }}</small>
          </span>
          <span class="recommendation-reason">{{ item.reason }}</span>
        </span>
      </label>
    </div>
    <p class="writeback-hint">
      <Icon icon="lucide:info" size="13" />
      加入后继续确认执行科室、检查部位等必填项，再回写 HIS
    </p>
    <button
      type="button"
      class="inline-action"
      :disabled="selectedIds.length === 0 || preparing"
      :aria-busy="preparing"
      @click="emit('submit')"
    >
      <Icon :icon="preparing ? 'lucide:loader-circle' : 'lucide:circle-plus'" size="16" />
      {{ preparing ? '正在准备诊疗方案…' : '加入诊疗方案' }}
    </button>
    <p v-if="prepareError" class="prepare-error" role="alert">{{ prepareError }}</p>
  </template>

  <div v-else-if="loaded" class="recommendation-state">
    <span>
      <b>暂无可直接回写的推荐</b>
      <small>
        AI 已完成本次分析，当前院内目录中没有适合推荐的检查/检验项目。
      </small>
    </span>
  </div>

  <div v-else class="recommendation-state">
    展开后将基于当前慢病资料，从 HIS 可开立检查/检验目录中生成 AI 推荐。
  </div>
</template>

<style scoped>
button:focus-visible,
input:focus-visible {
  outline: 3px solid rgba(43, 127, 227, 0.24);
  outline-offset: 2px;
}

.subsection-heading {
  margin-bottom: 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #1e293b;
  font-size: 11px;
}

.subsection-heading span {
  color: #64748b;
  font-size: 8px;
}

.recommendation-list {
  border-top: 1px solid #eef2f6;
}

.recommendation-list > label {
  min-height: 48px;
  padding: 7px 3px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-bottom: 1px solid #eef2f6;
}

.recommendation-list input {
  width: 15px;
  height: 15px;
  margin-top: 2px;
  flex: none;
  accent-color: #2b7fe3;
}

.recommendation-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.recommendation-title {
  display: flex;
  align-items: center;
  gap: 5px;
}

.recommendation-title b {
  color: #334155;
  font-size: 10px;
}

.recommendation-title small {
  padding: 1px 4px;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  font-size: 7px;
}

.recommendation-reason {
  color: #94a3b8;
  font-size: 8px;
  line-height: 1.45;
}

.writeback-hint {
  margin: 8px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  color: #64748b;
  font-size: 8px;
  line-height: 1.5;
}

.writeback-hint svg {
  flex: none;
}

.inline-action {
  min-height: 34px;
  padding: 7px 10px;
  margin-top: 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #2b7fe3;
  background: #fff;
  border: 1px solid #2b7fe3;
  border-radius: 5px;
  font-size: 10px;
}

.prepare-error {
  margin: 7px 0 0;
  color: #dc2626;
  font-size: 8px;
  line-height: 1.5;
}

@media (prefers-reduced-motion: no-preference) {
  .inline-action[aria-busy="true"] svg {
    animation: recommendation-spin .8s linear infinite;
  }

  @keyframes recommendation-spin {
    to { transform: rotate(360deg); }
  }
}

.inline-action:disabled {
  color: #94a3b8;
  border-color: #cbd5e1;
  cursor: not-allowed;
}

.recommendation-state {
  min-height: 52px;
  padding: 12px 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  background: #f8fafc;
  border: 1px solid #eef2f6;
  border-radius: 6px;
  font-size: 10px;
  line-height: 1.55;
}

.recommendation-state > span {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.recommendation-state b {
  color: #334155;
  font-size: 10px;
}

.recommendation-state small {
  color: #64748b;
  font-size: 8px;
}

.recommendation-state.loading > svg {
  color: #2b7fe3;
  animation: spin 0.9s linear infinite;
}

.recommendation-state.error > svg {
  color: #dc2626;
}

.recommendation-state.error button {
  margin-left: auto;
  padding: 4px 7px;
  flex: none;
  color: #2b7fe3;
  background: #fff;
  border: 1px solid #93c5fd;
  border-radius: 5px;
  font-size: 9px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
