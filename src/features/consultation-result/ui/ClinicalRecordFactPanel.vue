<script setup lang="ts">
import { computed, reactive } from 'vue';
import Icon from '@shared/ui/Icon.vue';
import {
  getClinicalRecordFactFieldLabel,
  type ClinicalRecordExplicitFact,
  type ClinicalRecordFactSuggestion,
} from '@features/clinical-result';

const props = defineProps<{
  explicitFacts: ClinicalRecordExplicitFact[];
  suggestions: ClinicalRecordFactSuggestion[];
  loading: boolean;
  error: string;
  expanded: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle', value: boolean): void;
  (event: 'refresh'): void;
  (event: 'confirm-negative', id: string): void;
  (event: 'confirm-positive', id: string, text: string): void;
  (event: 'not-applicable', id: string): void;
}>();

const positiveDrafts = reactive<Record<string, string>>({});

const pendingSuggestions = computed(() => props.suggestions.filter((item) => item.status === 'pending'));
const pendingCritical = computed(() => pendingSuggestions.value.filter((item) => item.priority === 'critical'));
const resolvedCount = computed(() => props.suggestions.length - pendingSuggestions.value.length);

function focusNextSuggestion(): void {
  const next = pendingCritical.value[0] || pendingSuggestions.value[0];
  if (!next) return;
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-clinical-fact-id]'))
    .find((element) => element.dataset.clinicalFactId === next.id);
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.requestAnimationFrame(() => target?.click());
}
</script>

<template>
  <section class="record-fact-panel">
    <button class="record-fact-summary" type="button" @click="emit('toggle', !expanded)">
      <span class="record-fact-summary-main">
        <Icon icon="lucide:list-checks" size="16" aria-hidden="true" />
        <strong>AI补充核查</strong>
        <span v-if="pendingCritical.length" class="record-fact-count is-critical">
          重点待核查 {{ pendingCritical.length }}
        </span>
        <span v-else-if="pendingSuggestions.length" class="record-fact-count">
          待核查 {{ pendingSuggestions.length }}
        </span>
        <span v-else class="record-fact-count is-clear">
          无待核查项
        </span>
      </span>
      <Icon :icon="expanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" size="16" aria-hidden="true" />
    </button>

    <div v-if="expanded" class="record-fact-body">
      <div class="record-fact-toolbar">
        <p>虚线内容由 AI 按病例和书写要求补充，尚非患者事实；完成核查后才会进入正式病历。</p>
        <div class="record-fact-toolbar-actions">
          <button v-if="pendingSuggestions.length" type="button" @click="focusNextSuggestion">
            <Icon icon="lucide:locate-fixed" size="14" />
            定位下一项
          </button>
          <button type="button" :disabled="loading" @click="emit('refresh')">
            <Icon :icon="loading ? 'lucide:loader-2' : 'lucide:refresh-cw'" :class="{ spin: loading }" size="14" />
            {{ loading ? '分析中' : '重新分析' }}
          </button>
        </div>
      </div>

      <div v-if="error" class="record-fact-error">{{ error }}</div>
      <div v-else-if="loading && suggestions.length === 0" class="record-fact-loading">正在结合当前病历和书写要求生成待核查内容……</div>
      <div v-else-if="pendingSuggestions.length" class="record-fact-list">
        <article
          v-for="item in pendingSuggestions"
          :key="item.id"
          class="record-fact-item"
          :class="`is-${item.priority}`"
        >
          <div class="record-fact-item-head">
            <span class="record-fact-field">{{ getClinicalRecordFactFieldLabel(item.field) }}</span>
            <span :class="['record-fact-priority', `is-${item.priority}`]">
                {{ item.priority === 'critical' ? '重点待核查' : '一般待核查' }}
            </span>
          </div>
          <strong>{{ item.question }}</strong>
          <p v-if="item.rationale">{{ item.rationale }}</p>
          <p class="record-fact-preview">AI 候选阴性表述：{{ item.negativeRecordText }}</p>

          <textarea
            v-model="positiveDrafts[item.id]"
            rows="2"
            placeholder="如存在异常，请填写实际情况后确认"
          ></textarea>
          <div class="record-fact-actions">
            <button class="is-negative" type="button" @click="emit('confirm-negative', item.id)">确认无异常并写入</button>
            <button type="button" :disabled="!positiveDrafts[item.id]?.trim()" @click="emit('confirm-positive', item.id, positiveDrafts[item.id] || '')">记录实际异常</button>
            <button class="is-subtle" type="button" @click="emit('not-applicable', item.id)">本次不适用</button>
          </div>
        </article>
      </div>
      <div v-else class="record-fact-empty">
        当前没有待核查项<span v-if="resolvedCount">，本轮已处理 {{ resolvedCount }} 项</span>。
      </div>
    </div>
  </section>
</template>

<style scoped>
.record-fact-panel { margin-top: 14px; border: 1px solid var(--voice-border); border-radius: 12px; background: var(--voice-surface-soft); overflow: hidden; }
.record-fact-summary { width: 100%; min-height: 42px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; border: 0; background: transparent; color: var(--voice-text); cursor: pointer; }
.record-fact-summary-main { display: inline-flex; align-items: center; gap: 8px; }
.record-fact-count { padding: 3px 8px; border-radius: 999px; background: rgba(214, 151, 25, .14); color: #9a6200; font-size: 12px; }
.record-fact-count.is-clear { background: var(--voice-accent-soft); color: var(--voice-accent-strong); }
.record-fact-count.is-critical { background: var(--voice-danger-soft); color: var(--voice-danger); }
.record-fact-body { padding: 0 12px 12px; display: flex; flex-direction: column; gap: 10px; }
.record-fact-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.record-fact-toolbar p { margin: 0; color: var(--voice-text-muted); font-size: 12px; line-height: 1.5; }
.record-fact-toolbar button, .record-fact-actions button { min-height: 30px; padding: 0 10px; border: 1px solid var(--voice-border); border-radius: 8px; background: var(--voice-surface); color: var(--voice-text); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.record-fact-toolbar-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.record-fact-list { display: flex; flex-direction: column; gap: 9px; }
.record-fact-item { padding: 10px; border: 1px solid var(--voice-border); border-left-width: 3px; border-radius: 10px; background: var(--voice-surface); }
.record-fact-item.is-critical { border-left-color: var(--voice-danger); }
.record-fact-item.is-general { border-left-color: var(--voice-accent); }
.record-fact-item-head { display: flex; align-items: center; gap: 6px; margin-bottom: 7px; }
.record-fact-field, .record-fact-priority { padding: 2px 7px; border-radius: 999px; font-size: 11px; }
.record-fact-field { background: var(--voice-surface-soft); color: var(--voice-text-muted); }
.record-fact-priority.is-critical { background: var(--voice-danger-soft); color: var(--voice-danger); }
.record-fact-priority.is-general { background: var(--voice-accent-soft); color: var(--voice-accent-strong); }
.record-fact-item > strong { color: var(--voice-text); font-size: 13px; line-height: 1.5; }
.record-fact-item > p { margin: 5px 0 0; color: var(--voice-text-muted); font-size: 12px; line-height: 1.5; }
.record-fact-preview { padding: 6px 8px; border-radius: 7px; background: var(--voice-surface-soft); }
.record-fact-item textarea { width: 100%; margin-top: 8px; padding: 7px 9px; border: 1px solid var(--voice-border); border-radius: 8px; background: var(--voice-surface); color: var(--voice-text); resize: vertical; }
.record-fact-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.record-fact-actions .is-negative { border-color: rgba(15, 143, 123, .32); color: var(--voice-accent-strong); }
.record-fact-actions .is-subtle { color: var(--voice-text-muted); }
.record-fact-actions button:disabled, .record-fact-toolbar button:disabled { opacity: .5; cursor: not-allowed; }
.record-fact-error { color: var(--voice-danger); }
.record-fact-loading, .record-fact-empty { padding: 10px; color: var(--voice-text-muted); text-align: center; font-size: 12px; }
.spin { animation: fact-spin 1s linear infinite; }
@keyframes fact-spin { to { transform: rotate(360deg); } }
@media (max-width: 880px) { .record-fact-toolbar { align-items: flex-start; flex-direction: column; } }
</style>
