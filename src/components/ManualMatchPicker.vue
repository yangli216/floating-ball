<script setup lang="ts">
/**
 * 共用手动匹配候选弹窗。
 * - 输入关键字筛选标准库候选
 * - 点击候选触发 select 事件
 * - 候选数据由调用方按需查询并传入；本组件不绑定具体业务（药品/检查/检验/处置 都可复用）
 */

export interface ManualMatchCandidate {
  /** 唯一键，用于 v-for key */
  id: string;
  /** 显示名 */
  name: string;
  /** 右侧次要信息（规格、编码等） */
  meta?: string;
}

interface Props {
  /** 候选项列表 */
  candidates: ManualMatchCandidate[];
  /** 关键字（v-model:keyword） */
  keyword: string;
  /** 标题，例如 "从标准库选择药品" */
  title?: string;
  /** 描述说明 */
  description?: string;
  /** 输入框占位文案 */
  placeholder?: string;
  /** 空状态提示文案 */
  emptyText?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: '从标准库选择项目',
  description: '匹配成功后才可纳入本次回写',
  placeholder: '输入名称筛选标准库',
  emptyText: '未找到可用的标准库项目，请修改关键字后重试',
});

const emit = defineEmits<{
  (e: 'update:keyword', value: string): void;
  (e: 'select', candidate: ManualMatchCandidate): void;
}>();

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement | null;
  emit('update:keyword', target?.value || '');
}

function onSelect(candidate: ManualMatchCandidate, event: Event): void {
  event.stopPropagation();
  emit('select', candidate);
}
</script>

<template>
  <div class="manual-match-shell" @click.stop>
    <div class="manual-match-header">
      <div class="manual-match-title">{{ props.title }}</div>
      <div class="manual-match-desc">{{ props.description }}</div>
    </div>

    <input
      :value="props.keyword"
      type="text"
      class="manual-match-input"
      :placeholder="props.placeholder"
      @input="onInput"
    />

    <div class="manual-match-list">
      <button
        v-for="candidate in props.candidates"
        :key="candidate.id"
        class="manual-match-option"
        type="button"
        @click="onSelect(candidate, $event)"
      >
        <span class="manual-match-option-name">{{ candidate.name }}</span>
        <span v-if="candidate.meta" class="manual-match-option-meta">{{ candidate.meta }}</span>
      </button>

      <div v-if="props.candidates.length === 0" class="manual-match-empty">
        {{ props.emptyText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.manual-match-shell {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--mmp-border, var(--voice-border, #e2e8f0));
}

.manual-match-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.manual-match-title {
  font-size: var(--mmp-font-main, var(--voice-font-main, 14px));
  font-weight: 700;
  color: var(--mmp-text, var(--voice-text, #1f2937));
}

.manual-match-desc {
  font-size: var(--mmp-font-min, var(--voice-font-min, 12px));
  color: var(--mmp-text-muted, var(--voice-text-muted, #6b7280));
}

.manual-match-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--mmp-border, var(--voice-border, #e2e8f0));
  border-radius: 8px;
  background: var(--mmp-surface, #fff);
  color: var(--mmp-text, var(--voice-text, #1f2937));
  font-size: var(--mmp-font-main, var(--voice-font-main, 14px));
  outline: none;
  box-sizing: border-box;
}

.manual-match-input:focus {
  border-color: var(--mmp-accent, var(--voice-accent, #2b7fe3));
}

.manual-match-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.manual-match-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 38px;
  width: 100%;
  padding: 0 12px;
  border: 1px solid var(--mmp-border, var(--voice-border, #e2e8f0));
  border-radius: 12px;
  background: var(--mmp-surface-soft, var(--voice-surface-soft, #f8fafc));
  color: var(--mmp-text, var(--voice-text, #1f2937));
  cursor: pointer;
  text-align: left;
}

.manual-match-option:hover {
  border-color: var(--mmp-accent, var(--voice-accent, #2b7fe3));
  background: var(--mmp-accent-softer, var(--voice-accent-softer, #eff6ff));
}

.manual-match-option-name {
  flex: 1;
  min-width: 0;
  font-size: var(--mmp-font-main, var(--voice-font-main, 14px));
  font-weight: 600;
  color: var(--mmp-text, var(--voice-text, #1f2937));
}

.manual-match-option-meta {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: var(--mmp-font-min, var(--voice-font-min, 12px));
  color: var(--mmp-text-muted, var(--voice-text-muted, #6b7280));
}

.manual-match-empty {
  padding: 8px 2px 0;
  font-size: var(--mmp-font-min, var(--voice-font-min, 12px));
  color: var(--mmp-text-muted, var(--voice-text-muted, #6b7280));
}
</style>
