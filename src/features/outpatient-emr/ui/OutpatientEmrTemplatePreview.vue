<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import {
  buildEditableOutpatientEmrPreviewHtml,
  readEditableOutpatientEmrField,
} from '../lib/outpatientEmrTemplate';
import type { OutpatientEmrTemplateField } from '../types';

const props = withDefaults(defineProps<{
  sanitizedHtml: string;
  fields: OutpatientEmrTemplateField[];
  fieldValues: Record<string, string>;
  editable?: boolean;
}>(), {
  editable: true,
});

const emit = defineEmits<{
  'update-field': [fieldId: string, value: string];
}>();

const previewRoot = ref<HTMLElement | null>(null);

function renderPreview(): void {
  if (!previewRoot.value) return;
  previewRoot.value.innerHTML = buildEditableOutpatientEmrPreviewHtml(
    props.sanitizedHtml,
    props.fields,
    props.fieldValues,
    props.editable,
  );
}

function syncValuesToPreview(): void {
  const root = previewRoot.value;
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-outpatient-emr-field-id]').forEach((element) => {
    const fieldId = element.getAttribute('data-outpatient-emr-field-id') || '';
    if (!Object.prototype.hasOwnProperty.call(props.fieldValues, fieldId)) return;
    if (element instanceof HTMLSelectElement) {
      if (element.value !== props.fieldValues[fieldId]) {
        element.value = props.fieldValues[fieldId];
      }
      return;
    }
    if (element.textContent !== props.fieldValues[fieldId]) {
      element.textContent = props.fieldValues[fieldId];
    }
  });
}

function emitEditedField(eventTarget: EventTarget | null): void {
  const root = previewRoot.value;
  if (!root || !props.editable) return;
  const edited = readEditableOutpatientEmrField(eventTarget, root);
  if (edited) emit('update-field', edited.fieldId, edited.value);
}

function handleInput(event: Event): void {
  emitEditedField(event.target);
}

function handlePaste(event: ClipboardEvent): void {
  if (!props.editable || !event.clipboardData) return;
  const root = previewRoot.value;
  const edited = root ? readEditableOutpatientEmrField(event.target, root) : null;
  if (!root || !edited) return;

  event.preventDefault();
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(event.clipboardData.getData('text/plain'));
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  emitEditedField(event.target);
}

onMounted(renderPreview);

watch(
  () => [
    props.sanitizedHtml,
    props.editable,
    props.fields.map((field) => (
      `${field.id}:${field.type}:${field.dictionaryItems.map((item) => `${item.value}=${item.text}`).join(',')}`
    )).join('|'),
  ],
  () => void nextTick(renderPreview),
);

watch(
  () => props.fieldValues,
  () => void nextTick(syncValuesToPreview),
  { deep: true },
);
</script>

<template>
  <section class="template-preview" aria-label="门诊病历模板预览">
    <div class="preview-hint">
      <span class="editable-dot"></span>
      <span>{{ editable ? '蓝色虚线区域可直接修改' : '当前参数已发送，等待 HIS 回执' }}</span>
    </div>
    <div
      ref="previewRoot"
      class="template-document"
      @input="handleInput"
      @change="handleInput"
      @paste="handlePaste"
    ></div>
  </section>
</template>

<style scoped>
.template-preview {
  display: grid;
  min-height: 0;
  gap: 10px;
}

.preview-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #64748b;
  font-size: 12px;
}

.editable-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #3b82f6;
}

.template-document {
  min-height: 360px;
  overflow: auto;
  padding: 24px;
  border: 1px solid #dce5ef;
  border-radius: 12px;
  color: #1f2937;
  background: #fff;
  box-shadow: 0 8px 28px rgb(15 23 42 / 6%);
}

.template-document :deep([data-outpatient-emr-field-id]) {
  min-height: 1.5em;
  padding: 2px 4px;
  border-radius: 4px;
  outline: 1px dashed #60a5fa;
  outline-offset: 2px;
  background: #eff6ff;
  white-space: pre-wrap;
}

.template-document :deep([data-outpatient-emr-field-id][contenteditable='true']:focus) {
  outline: 2px solid #2563eb;
  background: #fff;
}

.template-document :deep(.outpatient-emr-dictionary-select) {
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.template-document :deep(.outpatient-emr-dictionary-select:disabled) {
  cursor: default;
  opacity: 1;
}
</style>
