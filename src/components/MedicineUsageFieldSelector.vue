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
      class="muf-readonly"
      :title="placeholder"
      @click="activate"
    >
      <span v-if="currentText" class="muf-value">{{ currentText }}</span>
      <span v-else class="muf-placeholder">{{ placeholder }}</span>
      <svg class="muf-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <template v-else>
      <input
        ref="inputRef"
        type="text"
        class="muf-input"
        :value="searchKeyword"
        :placeholder="placeholder"
        @input="onSearchInput(($event.target as HTMLInputElement).value)"
        @keydown.esc.prevent="close"
      />
      <div class="muf-popover" @mousedown.prevent>
        <div class="muf-popover-toolbar">
          <button
            type="button"
            class="muf-clear-btn"
            @mousedown.prevent.stop="clearSelection"
          >清空当前值</button>
        </div>
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
import type { TreatmentRecommendation } from '../types/consultation';
import {
  normalizeUsageKeyword,
  type UsageOption,
} from '../utils/medicalDictionaryHelpers';

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
  if (props.field === 'frequency') {
    props.rec.frequency = option.text;
    props.rec.frequencyKey = option.key;
  } else {
    props.rec.route = option.text;
    props.rec.routeKey = option.key;
  }
  searchKeyword.value = option.text;
  close();
}

function clearSelection() {
  if (props.field === 'frequency') {
    props.rec.frequency = '';
    props.rec.frequencyKey = '';
  } else {
    props.rec.route = '';
    props.rec.routeKey = '';
  }
  searchKeyword.value = '';
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
  if (props.field === 'frequency') {
    props.rec.frequency = keyword;
    props.rec.frequencyKey = '';
  } else {
    props.rec.route = keyword;
    props.rec.routeKey = '';
  }
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

.muf-readonly {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 8px;
  background: #fff;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-strong, #333);
}

.muf-readonly:hover {
  border-color: var(--accent, #007aff);
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
  color: #999;
}

.muf-caret {
  flex-shrink: 0;
  color: #888;
}

.muf-input {
  width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--accent, #007aff);
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

.muf-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 20;
  background: #fff;
  border: 1px solid #e0e6ed;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 4px;
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 220px;
}

.muf-popover-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 2px 4px 4px;
  border-bottom: 1px dashed #eef2f7;
  margin-bottom: 4px;
}

.muf-clear-btn {
  font-size: 11px;
  color: #888;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
}

.muf-clear-btn:hover {
  color: var(--accent, #007aff);
}

.muf-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-strong, #333);
  cursor: pointer;
  text-align: left;
}

.muf-option:hover {
  background: rgba(0, 122, 255, 0.08);
}

.muf-option-current {
  background: rgba(0, 122, 255, 0.12);
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
  color: #999;
  font-size: 11px;
  display: inline-flex;
  gap: 2px;
}

.muf-empty {
  padding: 8px;
  color: #999;
  font-size: 11px;
  text-align: center;
}
</style>
