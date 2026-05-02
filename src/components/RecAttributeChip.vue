<script setup lang="ts">
/**
 * 通用必填属性 Chip 选择器：用于渲染"发药药房 / 执行科室"等回写前必填项。
 * - 折叠态：一个 chip 按钮，缺省时显示 label + 待设置（高亮警示色）。
 * - 展开态：chip 下方弹出关键字过滤的候选列表（最多 maxVisible 项）。
 *
 * 父组件控制候选列表的过滤口径（如药房需按药品 storeIds 收窄）。本组件仅做关键字 contains 过滤。
 */

import { computed, ref, watch } from 'vue';

export interface AttrOption {
  /** 唯一键（idSto / execDeptKey 等），点击时通过 select 事件回传 */
  key: string;
  /** 展示用文本 */
  text: string;
  /** 次要展示（编码、备注等） */
  meta?: string;
}

interface Props {
  label: string;
  /** 当前显示文本（已解析为可读名称，空字符串视为未设置） */
  valueText: string;
  /** 候选项 */
  options: AttrOption[];
  /** 是否缺失（决定是否高亮警示色与 label 是否常显） */
  missing: boolean;
  /** 占位提示，默认"待设置" */
  placeholder?: string;
  /** 候选区无项时的提示 */
  emptyText?: string;
  /** 候选最多显示条数 */
  maxVisible?: number;
  /** 附加状态指示（如"检测中""库存不足"），不影响 chip 主体颜色 */
  status?: { kind: 'checking' | 'warning'; message?: string } | null;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '待设置',
  emptyText: '当前可选范围内无可用项',
  maxVisible: 8,
});

const emit = defineEmits<{
  (e: 'select', option: AttrOption): void;
}>();

const open = ref(false);
const keyword = ref('');

watch(() => props.valueText, (value) => {
  if (!open.value) keyword.value = value;
});

const filteredOptions = computed<AttrOption[]>(() => {
  const query = keyword.value.trim();
  const list = !query
    ? props.options
    : props.options.filter((option) =>
      option.text.includes(query)
      || option.key.includes(query)
      || (option.meta || '').includes(query)
    );
  return list.slice(0, props.maxVisible);
});

function toggleOpen(event: Event): void {
  event.stopPropagation();
  open.value = !open.value;
  if (open.value) {
    keyword.value = '';
  }
}

function pick(option: AttrOption, event: Event): void {
  event.stopPropagation();
  emit('select', option);
  open.value = false;
}

function onKeyword(event: Event): void {
  const target = event.target as HTMLInputElement | null;
  keyword.value = target?.value || '';
}

function close(): void {
  open.value = false;
}

defineExpose({ close });
</script>

<template>
  <div class="attr-chip-wrapper" @click.stop>
    <button
      class="attr-chip"
      :class="{ missing: props.missing, open }"
      type="button"
      @click="toggleOpen"
    >
      <span v-if="props.missing" class="attr-chip-label">{{ props.label }}</span>
      <span class="attr-chip-value">{{ props.valueText || props.placeholder }}</span>
      <span
        v-if="props.status"
        class="attr-chip-status"
        :class="props.status.kind"
        :title="props.status.message || ''"
      >{{ props.status.kind === 'checking' ? '检测中…' : '!' }}</span>
      <span class="attr-chip-caret" :class="{ open }"></span>
    </button>

    <div v-if="open" class="attr-chip-popover">
      <input
        :value="keyword"
        type="text"
        class="attr-chip-input"
        :placeholder="`筛选${props.label}`"
        @input="onKeyword"
        @click.stop
      />
      <div class="attr-chip-list">
        <button
          v-for="option in filteredOptions"
          :key="option.key"
          class="attr-chip-option"
          type="button"
          @click="pick(option, $event)"
        >
          <span class="attr-chip-option-text">{{ option.text }}</span>
          <span v-if="option.meta" class="attr-chip-option-meta">{{ option.meta }}</span>
        </button>
        <div v-if="filteredOptions.length === 0" class="attr-chip-empty">
          {{ props.emptyText }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.attr-chip-wrapper {
  position: relative;
  display: inline-flex;
}

.attr-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  color: #1f2937;
  font-size: 12px;
  cursor: pointer;
  transition: all 160ms ease;
}

.attr-chip.open {
  border-color: #2B7FE3;
  background: rgba(43, 127, 227, 0.08);
}

.attr-chip:hover {
  border-color: #2B7FE3;
}

.attr-chip.missing {
  border-color: #f59e0b;
  background: #fff7ed;
  color: #b45309;
}

.attr-chip.missing:hover {
  border-color: #d97706;
  background: #ffedd5;
}

.attr-chip-label {
  font-weight: 600;
  margin-right: 2px;
}

.attr-chip-value {
  white-space: nowrap;
}

.attr-chip-caret {
  width: 0;
  height: 0;
  margin-left: 2px;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid currentColor;
  transition: transform 160ms ease;
}

.attr-chip-caret.open {
  transform: rotate(180deg);
}

.attr-chip-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 30;
  min-width: 220px;
  max-width: 320px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attr-chip-input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
}

.attr-chip-input:focus {
  border-color: #2B7FE3;
}

.attr-chip-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 240px;
  overflow-y: auto;
}

.attr-chip-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  font-size: 13px;
  color: #1f2937;
  cursor: pointer;
  text-align: left;
}

.attr-chip-option:hover {
  background: rgba(43, 127, 227, 0.08);
  border-color: rgba(43, 127, 227, 0.2);
}

.attr-chip-option-text {
  flex: 1;
  min-width: 0;
}

.attr-chip-option-meta {
  flex-shrink: 0;
  font-size: 12px;
  color: #6b7280;
}

.attr-chip-empty {
  padding: 8px 4px;
  font-size: 12px;
  color: #6b7280;
}

.attr-chip-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  padding: 0 6px;
  margin-left: 4px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.attr-chip-status.checking {
  background: rgba(43, 127, 227, 0.12);
  color: #1d4ed8;
}

.attr-chip-status.warning {
  background: #fee2e2;
  color: #b91c1c;
  cursor: help;
}
</style>
