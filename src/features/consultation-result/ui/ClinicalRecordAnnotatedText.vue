<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  buildClinicalRecordAnnotationSegments,
  type ClinicalRecordExplicitFact,
  type ClinicalRecordFactSuggestion,
} from '@features/clinical-result';

const props = defineProps<{
  modelValue: string;
  title: string;
  placeholder: string;
  facts: ClinicalRecordExplicitFact[];
  suggestions: ClinicalRecordFactSuggestion[];
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'confirm-negative', id: string): void;
  (event: 'confirm-positive', id: string, text: string): void;
  (event: 'not-applicable', id: string): void;
}>();

const annotationRootRef = ref<HTMLElement | null>(null);
const editableContentRef = ref<HTMLElement | null>(null);
const editing = ref(false);
const activeFactId = ref('');
const activeSuggestionId = ref('');
const positiveDrafts = reactive<Record<string, string>>({});
const popoverPosition = reactive({ top: 0, left: 0 });

const pendingSuggestions = computed(() => props.suggestions.filter((item) => item.status === 'pending'));
const segments = computed(() => {
  const annotated = buildClinicalRecordAnnotationSegments(
    props.modelValue,
    props.facts,
    pendingSuggestions.value,
  );
  const inlineSuggestionIds = new Set(
    annotated
      .filter((item) => item.kind === 'suggestion')
      .map((item) => item.suggestion.id),
  );
  const appended = pendingSuggestions.value.filter((item) => !inlineSuggestionIds.has(item.id));
  const combined = [...annotated];
  appended.forEach((suggestion) => {
    if (combined.length > 0) combined.push({ kind: 'text' as const, text: ' ' });
    combined.push({
      kind: 'suggestion' as const,
      text: suggestion.negativeRecordText,
      suggestion,
    });
  });
  return combined;
});
function sourceLabel(fact: ClinicalRecordExplicitFact): string {
  if (fact.source === 'doctor-confirmed') return '医生已确认';
  if (fact.source === 'structured-answer') return '结构化问诊已明确';
  return '问诊中已明确';
}

function readEditableText(element: HTMLElement): string {
  return element.innerText.replace(/\u00a0/g, ' ').replace(/\n+$/u, '');
}

function syncEditableContent(): void {
  const element = editableContentRef.value;
  if (!element || document.activeElement === element) return;
  if (element.innerText !== props.modelValue) element.textContent = props.modelValue || '';
}

async function startEditing(): Promise<void> {
  if (activeFactId.value || activeSuggestionId.value) return;
  editing.value = true;
  await nextTick();
  syncEditableContent();
  editableContentRef.value?.focus();
}

function handleDocumentInput(event: Event): void {
  const target = event.target as HTMLElement | null;
  emit('update:modelValue', target ? readEditableText(target) : '');
}

function finishEditing(): void {
  editing.value = false;
}

function positionPopover(event: MouseEvent): void {
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const expectedWidth = 330;
  const expectedHeight = 280;
  popoverPosition.left = Math.max(12, Math.min(rect.left, window.innerWidth - expectedWidth - 12));
  popoverPosition.top = rect.bottom + 7 + expectedHeight > window.innerHeight
    ? Math.max(12, rect.top - expectedHeight - 7)
    : rect.bottom + 7;
}

function toggleFact(id: string, event: MouseEvent): void {
  activeSuggestionId.value = '';
  positionPopover(event);
  activeFactId.value = activeFactId.value === id ? '' : id;
}

function toggleSuggestion(id: string, event: MouseEvent): void {
  activeFactId.value = '';
  positionPopover(event);
  activeSuggestionId.value = activeSuggestionId.value === id ? '' : id;
}

function confirmNegative(id: string): void {
  emit('confirm-negative', id);
  activeSuggestionId.value = '';
}

function confirmPositive(id: string): void {
  const value = positiveDrafts[id]?.trim() || '';
  if (!value) return;
  emit('confirm-positive', id, value);
  activeSuggestionId.value = '';
}

function markNotApplicable(id: string): void {
  emit('not-applicable', id);
  activeSuggestionId.value = '';
}

function closeOnOutside(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (target && annotationRootRef.value?.contains(target)) return;
  activeFactId.value = '';
  activeSuggestionId.value = '';
}

onMounted(() => document.addEventListener('mousedown', closeOnOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', closeOnOutside));
watch(() => props.modelValue, () => void nextTick(syncEditableContent));
</script>

<template>
  <div ref="annotationRootRef" class="clinical-record-annotated-text">
    <p v-if="editing" class="clinical-record-line is-editing">
      <label>{{ title }}：</label>
      <span
        ref="editableContentRef"
        class="clinical-record-editable"
        contenteditable="true"
        role="textbox"
        :aria-label="title"
        :data-placeholder="placeholder"
        @input="handleDocumentInput"
        @blur="finishEditing"
      ></span>
    </p>

    <p
      v-else
      class="clinical-record-line"
      :aria-label="`${title}，点击正文可编辑，点击标记可查看来源或确认`"
      @click="startEditing"
    >
      <label>{{ title }}：</label>
      <template v-if="segments.length">
        <template v-for="(segment, index) in segments" :key="`${segment.kind}-${index}-${segment.text}`">
          <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
          <span v-else-if="segment.kind === 'fact'" class="clinical-record-annotation-anchor">
            <button
              type="button"
              class="clinical-record-annotation"
              :class="[
                `is-${segment.fact.polarity}`,
                `is-${segment.fact.source}`,
              ]"
              :aria-label="`${segment.text}，${sourceLabel(segment.fact)}，${segment.fact.polarity === 'positive' ? '阳性指标' : '阴性事实'}`"
              @click.stop="toggleFact(segment.fact.id, $event)"
            >
              <span class="clinical-record-annotation-sign" aria-hidden="true">
                {{ segment.fact.source === 'doctor-confirmed' ? '✓' : segment.fact.polarity === 'positive' ? '+' : '−' }}
              </span>
              {{ segment.text }}
            </button>
            <span
              v-if="activeFactId === segment.fact.id"
              class="clinical-record-popover is-fact"
              role="dialog"
              :style="{ top: `${popoverPosition.top}px`, left: `${popoverPosition.left}px` }"
              @click.stop
            >
              <strong>{{ sourceLabel(segment.fact) }}</strong>
              <span class="clinical-record-popover-tags">
                <span>{{ segment.fact.polarity === 'positive' ? '阳性指标' : '阴性事实' }}</span>
                <span v-if="segment.fact.source === 'doctor-confirmed'">已完成确认</span>
              </span>
              <span>该内容已属于正式病历，点击正文空白处可继续编辑。</span>
            </span>
          </span>
          <span v-else class="clinical-record-annotation-anchor">
            <button
              type="button"
              class="clinical-record-annotation is-suggestion"
              :class="{ 'is-critical': segment.suggestion.priority === 'critical' }"
              :data-clinical-fact-id="segment.suggestion.id"
              :aria-label="`${segment.text}，AI 补充，尚非患者事实，${segment.suggestion.priority === 'critical' ? '重点待核查' : '一般待核查'}`"
              @click.stop="toggleSuggestion(segment.suggestion.id, $event)"
            >
              <span class="clinical-record-annotation-sign" aria-hidden="true">{{ segment.suggestion.priority === 'critical' ? '!' : 'AI' }}</span>
              {{ segment.text }}
            </button>
            <span
              v-if="activeSuggestionId === segment.suggestion.id"
              class="clinical-record-popover"
              role="dialog"
              :style="{ top: `${popoverPosition.top}px`, left: `${popoverPosition.left}px` }"
              @click.stop
            >
              <span class="clinical-record-popover-head">
                <strong>{{ segment.suggestion.question }}</strong>
                <span :class="['clinical-record-priority', { 'is-critical': segment.suggestion.priority === 'critical' }]">
                  {{ segment.suggestion.priority === 'critical' ? '重点待核查' : '一般待核查' }}
                </span>
              </span>
              <span v-if="segment.suggestion.rationale" class="clinical-record-rationale">{{ segment.suggestion.rationale }}</span>
              <span class="clinical-record-preview">AI 候选阴性表述：{{ segment.suggestion.negativeRecordText }}</span>
              <textarea
                v-model="positiveDrafts[segment.suggestion.id]"
                rows="2"
                aria-label="填写实际异常情况"
                placeholder="如存在异常，请填写实际情况"
              ></textarea>
              <span class="clinical-record-popover-actions">
                <button type="button" class="is-negative" @click="confirmNegative(segment.suggestion.id)">确认无异常并写入</button>
                <button type="button" :disabled="!positiveDrafts[segment.suggestion.id]?.trim()" @click="confirmPositive(segment.suggestion.id)">记录实际异常</button>
                <button type="button" class="is-subtle" @click="markNotApplicable(segment.suggestion.id)">本次不适用</button>
              </span>
              <span class="clinical-record-safety-note">AI 生成，尚非患者事实；完成核查前不会写入正式病历。</span>
            </span>
          </span>
        </template>
      </template>
      <span v-else class="clinical-record-placeholder">未记录（点击补充）</span>
    </p>
  </div>
</template>

<style scoped>
.clinical-record-annotated-text { position: relative; }
.clinical-record-line { margin: 0; color: var(--voice-text); font-size: 15px; line-height: 1.75; white-space: pre-wrap; word-break: break-word; cursor: text; }
.clinical-record-line label { display: inline; color: inherit; font-size: inherit; font-weight: 700; }
.clinical-record-placeholder { color: var(--voice-text-disabled); border-bottom: 1px dashed rgba(100, 116, 139, .32); }
.clinical-record-editable { display: inline; min-width: 2em; margin: 0 -3px; padding: 1px 3px; border: 0; border-radius: 3px; outline: none; white-space: pre-wrap; word-break: break-word; }
.clinical-record-editable:empty::before { content: attr(data-placeholder); color: var(--voice-text-disabled); }
.clinical-record-editable:focus { background: rgba(15, 143, 123, .045); box-shadow: inset 0 -1px 0 rgba(15, 143, 123, .22); }
.clinical-record-annotation-anchor { position: relative; display: inline; }
.clinical-record-annotation { display: inline; margin: 0; padding: 0 1px; border: 0; border-radius: 2px; background: transparent; color: inherit; font: inherit; line-height: inherit; text-align: left; white-space: normal; vertical-align: baseline; cursor: pointer; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.clinical-record-annotation-sign { display: inline-flex; align-items: center; justify-content: center; min-width: 11px; height: 12px; margin-right: 1px; border-radius: 2px; background: transparent; font-size: 9px; font-weight: 800; line-height: 1; vertical-align: 1px; }
.clinical-record-annotation.is-positive { background: rgba(225, 139, 20, .055); box-shadow: inset 0 -1px 0 rgba(225, 139, 20, .52); }
.clinical-record-annotation.is-positive .clinical-record-annotation-sign { color: #a75b00; }
.clinical-record-annotation.is-negative { background: rgba(15, 143, 123, .035); box-shadow: inset 0 -1px 0 rgba(15, 143, 123, .4); }
.clinical-record-annotation.is-negative .clinical-record-annotation-sign { color: var(--voice-accent-strong); }
.clinical-record-annotation.is-doctor-confirmed { background: rgba(31, 138, 91, .045); box-shadow: inset 0 -1px 0 rgba(31, 138, 91, .5); }
.clinical-record-annotation.is-doctor-confirmed .clinical-record-annotation-sign { color: var(--voice-success); }
.clinical-record-annotation.is-suggestion { padding: 0 1px; border-bottom: 1px dashed rgba(44, 119, 180, .72); border-radius: 0; background: rgba(44, 119, 180, .035); color: #285f8f; }
.clinical-record-annotation.is-suggestion .clinical-record-annotation-sign { min-width: 17px; color: #285f8f; }
.clinical-record-annotation.is-suggestion.is-critical { border-color: rgba(197, 48, 48, .75); background: rgba(197, 48, 48, .035); color: #9f2929; }
.clinical-record-annotation.is-suggestion.is-critical .clinical-record-annotation-sign { min-width: 11px; color: #b52f2f; }
.clinical-record-annotation:focus-visible { outline: 2px solid var(--voice-accent); outline-offset: 2px; }
.clinical-record-popover { position: fixed; z-index: 120; width: min(330px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow-y: auto; padding: 12px; border: 1px solid var(--voice-border); border-radius: 11px; background: var(--voice-surface); color: var(--voice-text); box-shadow: 0 12px 30px rgba(15, 23, 42, .16); font-size: 12px; line-height: 1.5; white-space: normal; cursor: default; }
.clinical-record-popover, .clinical-record-popover-head, .clinical-record-popover-tags, .clinical-record-popover-actions { display: flex; }
.clinical-record-popover { flex-direction: column; gap: 8px; }
.clinical-record-popover-head { align-items: flex-start; justify-content: space-between; gap: 8px; }
.clinical-record-popover-head strong { font-size: 13px; }
.clinical-record-popover-tags, .clinical-record-popover-actions { flex-wrap: wrap; gap: 6px; }
.clinical-record-popover-tags > span, .clinical-record-priority { padding: 2px 7px; border-radius: 999px; background: var(--voice-accent-soft); color: var(--voice-accent-strong); font-size: 11px; white-space: nowrap; }
.clinical-record-priority.is-critical { background: var(--voice-danger-soft); color: var(--voice-danger); }
.clinical-record-rationale, .clinical-record-safety-note { color: var(--voice-text-muted); }
.clinical-record-preview { padding: 6px 8px; border-radius: 7px; background: var(--voice-surface-soft); }
.clinical-record-popover textarea { width: 100%; padding: 7px 9px; border: 1px solid var(--voice-border); border-radius: 8px; background: var(--voice-surface); color: var(--voice-text); font: inherit; resize: vertical; }
.clinical-record-popover-actions button { min-height: 30px; padding: 0 10px; border: 1px solid var(--voice-border); border-radius: 8px; background: var(--voice-surface); color: var(--voice-text); cursor: pointer; }
.clinical-record-popover-actions .is-negative { border-color: rgba(15, 143, 123, .35); color: var(--voice-accent-strong); }
.clinical-record-popover-actions .is-subtle { color: var(--voice-text-muted); }
.clinical-record-popover-actions button:disabled { opacity: .45; cursor: not-allowed; }
.clinical-record-popover.is-fact { width: 250px; }
@media (max-width: 720px) { .clinical-record-popover { top: auto !important; right: 16px; bottom: 16px; left: 16px !important; width: auto; } }
</style>
