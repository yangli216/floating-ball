<template>
  <!-- 药品频次/用法可搜索下拉
    - 单一字段编辑入口：点击只读按钮展开 -> 输入关键字过滤 -> 选中候选写回 rec
    - 候选项最多展示 8 条；当前值若不在过滤结果中会自动作为首条
    - 关键字匹配走 normalizeUsageKeyword（小写去空格 + 拼音/五笔/医保码 token）
    - 失焦自动关闭：使用 @focusout + relatedTarget.closest 容忍点击候选项
    - 直接 mutate 传入的 rec.frequency/frequencyKey 或 rec.route/routeKey
    - 可选 v-model:open 让父组件在多卡片场景下做"互斥展开"协调；不绑定时由组件自管
  -->
  <div
    ref="containerRef"
    class="muf-field"
    :class="{ 'muf-active': open }"
    @focusout="handleFocusOut"
  >
    <button
      v-if="!open"
      type="button"
      class="muf-trigger"
      :title="field === 'frequency' ? '点击修改频次' : '点击修改用法'"
      @click="activate"
    >
      <span v-if="currentText" class="muf-value">{{ currentText }}</span>
      <span v-else class="muf-placeholder">{{ placeholder }}</span>
      <svg class="muf-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <template v-else>
      <div class="muf-input-wrap">
        <input
          ref="inputRef"
          type="text"
          class="muf-input"
          :value="searchKeyword"
          :placeholder="placeholder"
          @input="onSearchInput(($event.target as HTMLInputElement).value)"
          @keydown.esc.prevent="close"
        />
        <button
          v-if="currentText"
          type="button"
          class="muf-clear-icon"
          :aria-label="field === 'frequency' ? '清空频次' : '清空用法'"
          :title="field === 'frequency' ? '清空频次' : '清空用法'"
          @mousedown.prevent.stop="clearSelection"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="muf-popover" @mousedown.prevent>
        <button
          v-for="option in filteredOptions"
          :key="option.key"
          type="button"
          class="muf-option"
          :class="{ 'muf-option-current': option.key === (currentKey || '') }"
          @mousedown.prevent.stop="selectOption(option)"
        >
          <span class="muf-option-text">{{ option.text }}</span>
          <span v-if="showMeta && (option.py || option.mcode)" class="muf-option-meta">
            <span v-if="option.py">{{ option.py }}</span>
            <span v-if="option.mcode">·{{ option.mcode }}</span>
          </span>
        </button>
        <div v-if="filteredOptions.length === 0" class="muf-empty">无匹配项，按当前输入保留为自定义值</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type PropType } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  normalizeUsageKeyword,
  type UsageOption,
} from '@/utils/medicalDictionaryHelpers';

const props = defineProps({
  rec: {
    type: Object as PropType<TreatmentRecommendation>,
    required: true,
  },
  field: {
    type: String as PropType<'frequency' | 'route'>,
    required: true,
  },
  options: {
    type: Array as PropType<UsageOption[]>,
    default: () => [],
  },
  placeholder: {
    type: String,
    default: '请选择',
  },
  /** 是否在候选项末尾展示拼音/医保码等元信息（用法下拉常用） */
  showMeta: {
    type: Boolean,
    default: false,
  },
  /** 最多展示多少条候选 */
  maxVisible: {
    type: Number,
    default: 8,
  },
  /** 父组件可通过 v-model:open 强制控制展开态（多卡片互斥场景） */
  open: {
    type: Boolean,
    default: undefined,
  },
});

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'change', field: 'frequency' | 'route', value: string, key: string): void;
}>();

const internalOpen = ref(false);
const open = computed<boolean>(() => (props.open === undefined ? internalOpen.value : props.open));

function setOpen(value: boolean) {
  if (props.open === undefined) {
    internalOpen.value = value;
  }
  emit('update:open', value);
}

const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const searchKeyword = ref<string>('');

const currentText = computed(() => (props.field === 'frequency' ? props.rec.frequency : props.rec.route) || '');
const currentKey = computed(() => (props.field === 'frequency' ? props.rec.frequencyKey : props.rec.routeKey) || '');

function commitFieldValue(value: string, key: string): void {
  if (props.field === 'frequency') {
    props.rec.frequency = value;
    props.rec.frequencyKey = key;
  } else {
    props.rec.route = value;
    props.rec.routeKey = key;
  }
  searchKeyword.value = value;
  emit('change', props.field, value, key);
}

const filteredOptions = computed<UsageOption[]>(() => {
  const all = props.options;
  const query = normalizeUsageKeyword(searchKeyword.value || '');
  const queryLessOptions = query
    ? all.filter((option) => option.normalizedTokens.some((token) => token.includes(query)))
    : all;

  // 当前值若不在过滤结果中，作为首条置入，方便用户看到"当前选中"
  const currentVal = currentText.value;
  const containsCurrent = queryLessOptions.some((opt) => opt.text === currentVal || opt.key === currentVal);
  let result = queryLessOptions;
  if (currentVal && !containsCurrent) {
    const synthetic: UsageOption = {
      key: currentKey.value || currentVal,
      text: currentVal,
      py: '',
      wb: '',
      mcode: '',
      normalizedTokens: [normalizeUsageKeyword(currentVal)],
    };
    result = [synthetic, ...queryLessOptions];
  }
  return result.slice(0, props.maxVisible);
});

function activate() {
  if (open.value) return;
  searchKeyword.value = currentText.value || '';
  setOpen(true);
  void nextTick(() => {
    inputRef.value?.focus();
    inputRef.value?.select();
  });
}

function close() {
  setOpen(false);
}

function onSearchInput(value: string) {
  searchKeyword.value = value;
}

function selectOption(option: UsageOption) {
  commitFieldValue(option.text, option.key);
  close();
}

function clearSelection() {
  commitFieldValue('', '');
}

// 失焦时若关键字已经精确匹配某候选则确认；否则保留为自定义值
function handleFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as HTMLElement | null;
  if (next && containerRef.value && containerRef.value.contains(next)) {
    return;
  }

  const keyword = (searchKeyword.value || '').trim();
  if (!keyword) {
    clearSelection();
    close();
    return;
  }

  // 精确匹配优先
  const exact = props.options.find((opt) => opt.text === keyword);
  if (exact) {
    selectOption(exact);
    return;
  }

  // 规范化 token 唯一匹配
  const q = normalizeUsageKeyword(keyword);
  const tokenMatches = props.options.filter((opt) => opt.normalizedTokens.some((t) => t.includes(q)));
  if (tokenMatches.length === 1) {
    selectOption(tokenMatches[0]);
    return;
  }

  // 其余作为自定义文本保留
  commitFieldValue(keyword, '');
  close();
}

// rec 切换时同步搜索框为当前值
watch(
  () => [props.rec, props.field, currentText.value],
  () => {
    if (!open.value) {
      searchKeyword.value = '';
    }
  },
);
</script>

<style scoped>
.muf-field {
  position: relative;
  flex: 1;
  min-width: 0;
}

.muf-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 34px;
  padding: 0 10px;
  background: #fff;
  border: 1px solid var(--voice-border-strong, #cbd5e1);
  border-radius: 10px;
  font-size: var(--voice-font-main, 14px);
  cursor: pointer;
  color: var(--voice-text, #0f172a);
  box-sizing: border-box;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.muf-trigger:hover,
.muf-trigger:focus-visible {
  border-color: var(--voice-accent, #2563eb);
  background: #fff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
  outline: none;
}

.muf-value {
  flex: 1;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.muf-placeholder {
  flex: 1;
  text-align: left;
  color: var(--voice-text-muted, #64748b);
}

.muf-caret {
  flex-shrink: 0;
  color: var(--voice-accent, #2563eb);
}

.muf-input-wrap {
  position: relative;
}

.muf-input {
  width: 100%;
  min-height: 34px;
  padding: 0 34px 0 10px;
  border: 1px solid var(--voice-accent, #2563eb);
  border-radius: 10px;
  font-size: var(--voice-font-main, 14px);
  outline: none;
  color: var(--voice-text, #0f172a);
  background: #fff;
  box-sizing: border-box;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.muf-clear-icon {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #94a3b8;
  background: transparent;
  cursor: pointer;
  transform: translateY(-50%);
  transition: color 0.16s ease, background-color 0.16s ease;
}

.muf-clear-icon:hover {
  color: #475569;
  background: rgba(148, 163, 184, 0.16);
}

.muf-clear-icon:focus-visible {
  outline: 2px solid var(--voice-accent, #2563eb);
  outline-offset: 2px;
}

.muf-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid var(--voice-border, #dbe3ee);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 6px;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 240px;
}

.muf-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border: none;
  background: transparent;
  border-radius: 8px;
  font-size: 13px;
  color: var(--voice-text, #0f172a);
  cursor: pointer;
  text-align: left;
}

.muf-option:hover {
  background: rgba(37, 99, 235, 0.08);
}

.muf-option-current {
  background: rgba(37, 99, 235, 0.12);
  font-weight: 500;
}

.muf-option-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.muf-option-meta {
  flex-shrink: 0;
  color: var(--voice-text-muted, #64748b);
  font-size: 12px;
  display: inline-flex;
  gap: 4px;
}

.muf-empty {
  padding: 8px;
  color: var(--voice-text-muted, #64748b);
  font-size: 12px;
  text-align: center;
}
</style>
