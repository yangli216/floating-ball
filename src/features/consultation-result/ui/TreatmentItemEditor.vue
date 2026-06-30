<template>
  <!-- 治疗项可编辑字段：
       - compact：症状问诊当前使用的紧凑网格模式
       - inline：语音问诊药品主编辑区使用的受控模式（父级注入字段激活/收口逻辑） -->
  <div class="treatment-item-editor" :class="[`mode-${mode}`]" @click.stop>
    <template v-if="mode === 'inline' && isMedicine">
      <div class="medicine-primary-fields">
        <div class="primary-field" :class="{ editing: isActive('dosage'), required: isPrimaryFieldRequired('dosage'), missing: isPrimaryFieldMissing('dosage') }">
          <label>一次剂量</label>
          <div v-if="isActive('dosage')" class="field-editor edit-field-row" @focusout="handleFieldBlur('dosage', $event)">
            <div class="numeric-field">
              <input
                :ref="(el) => registerFieldElement('dosage', el as Element | null)"
                :value="rec.dosage || ''"
                type="text"
                inputmode="decimal"
                placeholder="剂量"
                class="edit-input small"
                :aria-invalid="isPrimaryFieldMissing('dosage') ? 'true' : undefined"
                :aria-describedby="getNumericMetaId('dosage')"
                @beforeinput="handleNumericBeforeInput('dosage', $event)"
                @paste="handleNumericPaste('dosage', $event)"
                @input="handleDosageInput"
              />
              <div
                v-if="getNumericFieldMessage('dosage')"
                :id="getNumericMetaId('dosage')"
                class="numeric-field-message"
                :class="{ 'is-error': isNumericFieldInvalid('dosage') }"
              >
                {{ getNumericFieldMessage('dosage') }}
              </div>
            </div>
            <span class="edit-unit static-unit" :class="{ placeholder: !rec.dosageUnit }">{{ rec.dosageUnit || '单位待识别' }}</span>
          </div>
          <button v-else class="field-read-btn" :class="{ placeholder: !rec.dosage }" type="button" @click.stop="activateField('dosage', $event)">
            {{ getDisplayValue('dosage') }}
          </button>
        </div>

        <div class="primary-field" :class="{ editing: isActive('frequency'), required: isPrimaryFieldRequired('frequency'), missing: isPrimaryFieldMissing('frequency') }">
          <label>频次</label>
          <MedicineUsageFieldSelector
            :rec="rec"
            field="frequency"
            :options="frequencyOptions"
            :show-meta="true"
            placeholder="请选择频次"
            :open="getSelectorOpen('frequency')"
            @update:open="(v) => handleFieldOpenChange('frequency', v)"
            @change="(field, value, key) => handleUsageFieldChange(field, value, key)"
          />
        </div>

        <div class="primary-field" :class="{ editing: isActive('route'), required: isPrimaryFieldRequired('route'), missing: isPrimaryFieldMissing('route') }">
          <label>用法</label>
          <MedicineUsageFieldSelector
            :rec="rec"
            field="route"
            :options="routeOptions"
            :show-meta="true"
            placeholder="请选择用法"
            :open="getSelectorOpen('route')"
            @update:open="(v) => handleFieldOpenChange('route', v)"
            @change="(field, value, key) => handleUsageFieldChange(field, value, key)"
          />
        </div>

        <div class="primary-field" :class="{ editing: isActive('total'), required: isPrimaryFieldRequired('total'), missing: isPrimaryFieldMissing('total') }">
          <label>总量</label>
          <div v-if="isActive('total')" class="field-editor edit-field-row" @focusout="handleFieldBlur('total', $event)">
            <div class="numeric-field">
              <input
                :ref="(el) => registerFieldElement('total', el as Element | null)"
                :value="rec.totalQty"
                type="text"
                inputmode="decimal"
                placeholder="数量"
                class="edit-input small"
                :aria-invalid="isPrimaryFieldMissing('total') ? 'true' : undefined"
                :aria-describedby="getNumericMetaId('totalQty')"
                @beforeinput="handleNumericBeforeInput('totalQty', $event)"
                @paste="handleNumericPaste('totalQty', $event)"
                @input="handleTotalQtyInput"
              />
              <div
                v-if="getNumericFieldMessage('totalQty')"
                :id="getNumericMetaId('totalQty')"
                class="numeric-field-message"
                :class="{ 'is-error': isNumericFieldInvalid('totalQty') }"
              >
                {{ getNumericFieldMessage('totalQty') }}
              </div>
            </div>
            <span class="edit-unit static-unit" :class="{ placeholder: !rec.totalUnit }">{{ rec.totalUnit || '单位待识别' }}</span>
          </div>
          <button v-else class="field-read-btn" :class="{ placeholder: !rec.totalQty }" type="button" @click.stop="activateField('total', $event)">
            {{ getDisplayValue('total') }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="isMedicine">
      <div class="te-row required" :class="{ missing: isPrimaryFieldMissing('route') }">
        <label class="te-label">用法</label>
        <MedicineUsageFieldSelector
          :rec="rec"
          field="route"
          :options="routeOptions"
          :show-meta="true"
          placeholder="请选择用法"
          @change="(field, value, key) => handleUsageFieldChange(field, value, key)"
        />
      </div>
      <div class="te-row required" :class="{ missing: isPrimaryFieldMissing('frequency') }">
        <label class="te-label">频次</label>
        <MedicineUsageFieldSelector
          :rec="rec"
          field="frequency"
          :options="frequencyOptions"
          :show-meta="true"
          placeholder="请选择频次"
          @change="(field, value, key) => handleUsageFieldChange(field, value, key)"
        />
      </div>
      <div class="te-row required" :class="{ missing: isPrimaryFieldMissing('dosage') }">
        <label class="te-label">单次剂量</label>
        <div class="numeric-field">
          <input
            class="te-input te-input-num"
            type="text"
            inputmode="decimal"
            :value="rec.dosage || ''"
            :aria-invalid="isPrimaryFieldMissing('dosage') ? 'true' : undefined"
            :aria-describedby="getNumericMetaId('dosage')"
            @beforeinput="handleNumericBeforeInput('dosage', $event)"
            @paste="handleNumericPaste('dosage', $event)"
            @input="handleDosageInput"
          />
          <div
            v-if="getNumericFieldMessage('dosage')"
            :id="getNumericMetaId('dosage')"
            class="numeric-field-message"
            :class="{ 'is-error': isNumericFieldInvalid('dosage') }"
          >
            {{ getNumericFieldMessage('dosage') }}
          </div>
        </div>
        <span class="te-suffix">{{ rec.dosageUnit || '' }}</span>
      </div>
      <div class="te-row required" :class="{ missing: isPrimaryFieldMissing('total') }">
        <label class="te-label">总量</label>
        <div class="numeric-field">
          <input
            class="te-input te-input-num"
            type="text"
            inputmode="decimal"
            :value="rec.totalQty || ''"
            :aria-invalid="isPrimaryFieldMissing('total') ? 'true' : undefined"
            :aria-describedby="getNumericMetaId('totalQty')"
            @beforeinput="handleNumericBeforeInput('totalQty', $event)"
            @paste="handleNumericPaste('totalQty', $event)"
            @input="handleTotalQtyInput"
          />
          <div
            v-if="getNumericFieldMessage('totalQty')"
            :id="getNumericMetaId('totalQty')"
            class="numeric-field-message"
            :class="{ 'is-error': isNumericFieldInvalid('totalQty') }"
          >
            {{ getNumericFieldMessage('totalQty') }}
          </div>
        </div>
        <span class="te-suffix">{{ rec.totalUnit || '' }}</span>
      </div>
      <div class="te-row">
        <label class="te-label">用药天数</label>
        <div class="numeric-field">
          <input
            class="te-input te-input-num"
            type="text"
            inputmode="numeric"
            :value="rec.days || ''"
            :aria-invalid="isNumericFieldInvalid('days') ? 'true' : undefined"
            :aria-describedby="getNumericMetaId('days')"
            @beforeinput="handleNumericBeforeInput('days', $event)"
            @paste="handleNumericPaste('days', $event)"
            @input="handleDaysInput"
          />
          <div
            v-if="getNumericFieldMessage('days')"
            :id="getNumericMetaId('days')"
            class="numeric-field-message"
            :class="{ 'is-error': isNumericFieldInvalid('days') }"
          >
            {{ getNumericFieldMessage('days') }}
          </div>
        </div>
        <span class="te-suffix">天</span>
      </div>
    </template>

    <template v-else>
      <div v-if="shouldShowQuantityEditor" class="te-row required" :class="{ missing: isQuantityMissing }">
        <label class="te-label">数量</label>
        <div class="numeric-field">
          <input
            class="te-input te-input-num"
            type="text"
            inputmode="decimal"
            :value="rec.totalQty || ''"
            :aria-invalid="isQuantityMissing ? 'true' : undefined"
            :aria-describedby="getNumericMetaId('totalQty')"
            @beforeinput="handleNumericBeforeInput('totalQty', $event)"
            @paste="handleNumericPaste('totalQty', $event)"
            @input="handleNonMedicineTotalQtyInput"
          />
          <div
            v-if="getNumericFieldMessage('totalQty')"
            :id="getNumericMetaId('totalQty')"
            class="numeric-field-message"
            :class="{ 'is-error': isNumericFieldInvalid('totalQty') }"
          >
            {{ getNumericFieldMessage('totalQty') }}
          </div>
        </div>
        <span class="te-suffix">{{ rec.totalUnit || '次' }}</span>
      </div>
      <div v-if="showExecDeptReadonly && rec.execDept" class="te-row">
        <label class="te-label">执行科室</label>
        <span class="te-readonly">{{ rec.execDept }}</span>
      </div>
      <div v-if="showBodySiteReadonly && rec.bodySite" class="te-row">
        <label class="te-label">部位方式</label>
        <span class="te-readonly">{{ rec.bodySite }}</span>
      </div>
    </template>

    <slot v-if="mode !== 'inline'" name="after-default" />

    <div
      v-if="mode !== 'inline'"
      class="te-row te-row-wide remark-row"
      :class="{ 'is-over-limit': isRemarkOverLimit }"
    >
      <label class="te-label">备注</label>
      <div class="remark-field">
        <input
          class="te-input"
          type="text"
          :value="rec.remark || ''"
          placeholder="可选"
          :aria-invalid="isRemarkOverLimit ? 'true' : undefined"
          :aria-describedby="remarkMetaId"
          @beforeinput="handleRemarkBeforeInput"
          @paste="handleRemarkPaste"
          @input="handleRemarkInput"
        />
        <div
          :id="remarkMetaId"
          class="remark-field-meta"
          :class="{ 'is-warning': isRemarkAtLimit || remarkInputBlocked, 'is-error': isRemarkOverLimit }"
        >
          <span>{{ remarkLength }}/{{ TREATMENT_REMARK_MAX_LENGTH }}</span>
          <span v-if="remarkLimitMessage" class="remark-field-message">{{ remarkLimitMessage }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, type PropType } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';
import {
  getTreatmentNumericFieldConstraintText,
  getTreatmentNumericFieldIssue,
  getTreatmentRemarkLength,
  isTreatmentNumericInputAllowed,
  isTreatmentRemarkOverLimit,
  TREATMENT_REMARK_MAX_LENGTH,
  type TreatmentNumericField,
} from '@features/clinical-result';
import MedicineUsageFieldSelector from './MedicineUsageFieldSelector.vue';

type InlineEditableField = 'dosage' | 'frequency' | 'route' | 'total';

type ActivateField = (field: InlineEditableField, event?: Event) => void;
type HandleFieldBlur = (field: InlineEditableField, event: FocusEvent) => void;
type RegisterFieldElement = (field: InlineEditableField, element: Element | null) => void;
type HandleFieldOpenChange = (field: 'frequency' | 'route', open: boolean) => void;
type HandleUsageFieldChange = (field: 'frequency' | 'route', value: string, key: string) => void;

const props = defineProps({
  rec: {
    type: Object as PropType<TreatmentRecommendation>,
    required: true,
  },
  mode: {
    type: String as PropType<'compact' | 'inline'>,
    default: 'compact',
  },
  frequencyOptions: {
    type: Array as PropType<UsageOption[]>,
    default: () => [],
  },
  routeOptions: {
    type: Array as PropType<UsageOption[]>,
    default: () => [],
  },
  showExecDeptReadonly: {
    type: Boolean,
    default: true,
  },
  showBodySiteReadonly: {
    type: Boolean,
    default: true,
  },
  isFieldActive: {
    type: Function as PropType<(field: InlineEditableField) => boolean>,
    default: undefined,
  },
  activateField: {
    type: Function as PropType<ActivateField>,
    default: undefined,
  },
  onFieldBlur: {
    type: Function as PropType<HandleFieldBlur>,
    default: undefined,
  },
  registerFieldElement: {
    type: Function as PropType<RegisterFieldElement>,
    default: undefined,
  },
  onTotalQtyInput: {
    type: Function as PropType<(event: Event) => void>,
    default: undefined,
  },
  onFieldOpenChange: {
    type: Function as PropType<HandleFieldOpenChange>,
    default: undefined,
  },
  onUsageFieldChange: {
    type: Function as PropType<HandleUsageFieldChange>,
    default: undefined,
  },
  getDisplayValue: {
    type: Function as PropType<(field: 'dosage' | 'total') => string>,
    default: undefined,
  },
});

const isMedicine = computed(() => (props.rec.type || 'medicine') === 'medicine');
const shouldShowQuantityEditor = computed(() => {
  const type = props.rec.type || 'medicine';
  return type !== 'exam' && type !== 'lab_test';
});
const isQuantityMissing = computed(() => shouldShowQuantityEditor.value && !hasPositiveNumber(props.rec.totalQty));
const internalActiveField = ref<InlineEditableField | null>(null);
const internalFieldElements = new Map<InlineEditableField, Element | null>();
const remarkInputBlocked = ref(false);
const remarkMetaId = `${useId()}-remark-meta`;
const numericMetaIdPrefix = useId();
const numericInputBlockedField = ref<TreatmentNumericField | null>(null);
const remarkLength = computed(() => getTreatmentRemarkLength(props.rec.remark || ''));
const isRemarkOverLimit = computed(() => remarkLength.value > TREATMENT_REMARK_MAX_LENGTH);
const isRemarkAtLimit = computed(() => remarkLength.value === TREATMENT_REMARK_MAX_LENGTH);
const remarkLimitMessage = computed(() => {
  if (isRemarkOverLimit.value) {
    return `已超出 ${remarkLength.value - TREATMENT_REMARK_MAX_LENGTH} 字，请删减后再提交`;
  }
  if (remarkInputBlocked.value) {
    return `最多 ${TREATMENT_REMARK_MAX_LENGTH} 字，已阻止超长输入`;
  }
  if (isRemarkAtLimit.value) {
    return '已达上限';
  }
  return '';
});
const isControlledInline = computed(
  () => Boolean(
    props.isFieldActive
    || props.activateField
    || props.onFieldBlur
    || props.registerFieldElement
    || props.onFieldOpenChange,
  ),
);

function isActive(field: InlineEditableField): boolean {
  if (props.isFieldActive) {
    return props.isFieldActive(field);
  }
  return internalActiveField.value === field;
}

function activateField(field: InlineEditableField, event?: Event): void {
  if (props.activateField) {
    props.activateField(field, event);
    return;
  }
  internalActiveField.value = field;
  void nextTick(() => {
    const target = internalFieldElements.get(field);
    if (target instanceof HTMLElement) {
      target.focus();
      if ('select' in target && typeof target.select === 'function') {
        target.select();
      }
    }
  });
}

function handleFieldBlur(field: InlineEditableField, event: FocusEvent): void {
  if (props.onFieldBlur) {
    props.onFieldBlur(field, event);
    return;
  }
  const next = event.relatedTarget as HTMLElement | null;
  const current = event.currentTarget as HTMLElement | null;
  if (next && current?.contains(next)) {
    return;
  }
  if (internalActiveField.value === field) {
    internalActiveField.value = null;
  }
}

function registerFieldElement(field: InlineEditableField, element: Element | null): void {
  if (props.registerFieldElement) {
    props.registerFieldElement(field, element);
    return;
  }
  internalFieldElements.set(field, element);
}

function handleTotalQtyInput(event: Event): void {
  if (!handleNumericInput('totalQty', event, (value) => {
    props.rec.totalQty = value;
    props.rec.totalManualEdited = true;
  })) {
    return;
  }
  if (props.onTotalQtyInput) {
    props.onTotalQtyInput(event);
    if (!hasPositiveNumber(props.rec.totalQty)) {
      props.rec.selected = false;
    }
    return;
  }
  if (!hasPositiveNumber(props.rec.totalQty)) {
    props.rec.selected = false;
  }
}

function handleDaysInput(event: Event): void {
  handleNumericInput('days', event, (value) => {
    props.rec.days = value;
  });
  if (isNumericFieldInvalid('days')) {
    props.rec.selected = false;
  }
}

function handleNonMedicineTotalQtyInput(event: Event): void {
  handleNumericInput('totalQty', event, (value) => {
    props.rec.totalQty = value;
  });
  if (isQuantityMissing.value) {
    props.rec.selected = false;
  }
}

function handleFieldOpenChange(field: 'frequency' | 'route', open: boolean): void {
  if (props.onFieldOpenChange) {
    props.onFieldOpenChange(field, open);
    return;
  }
  if (open) {
    internalActiveField.value = field;
  } else if (internalActiveField.value === field) {
    internalActiveField.value = null;
  }
}

function handleUsageFieldChange(field: 'frequency' | 'route', value: string, key: string): void {
  props.onUsageFieldChange?.(field, value, key);
  if (!value.trim() || !key.trim()) {
    props.rec.selected = false;
  }
}

function getSelectorOpen(field: 'frequency' | 'route'): boolean | undefined {
  return isControlledInline.value ? isActive(field) : undefined;
}

function getDisplayValue(field: 'dosage' | 'total'): string {
  if (props.getDisplayValue) {
    return props.getDisplayValue(field);
  }
  if (field === 'dosage') {
    return props.rec.dosage ? `${props.rec.dosage}${props.rec.dosageUnit || ''}` : '点击输入剂量';
  }
  return props.rec.totalQty ? `${props.rec.totalQty}${props.rec.totalUnit || ''}` : '点击输入总量';
}

function hasPositiveNumber(value: unknown): boolean {
  const parsed = Number(typeof value === 'string' ? value.trim() : String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0;
}

function resolveUsageKey(field: Extract<InlineEditableField, 'frequency' | 'route'>): string {
  const value = field === 'frequency' ? props.rec.frequency : props.rec.route;
  const directKey = field === 'frequency' ? props.rec.frequencyKey : props.rec.routeKey;
  if ((directKey || '').trim()) {
    return directKey || '';
  }
  const options = field === 'frequency' ? props.frequencyOptions : props.routeOptions;
  return options.find((option) => option.key === value || option.text === value)?.key || '';
}

function isPrimaryFieldRequired(field: InlineEditableField): boolean {
  return isMedicine.value && (field === 'dosage' || field === 'frequency' || field === 'route' || field === 'total');
}

function isPrimaryFieldMissing(field: InlineEditableField): boolean {
  if (!isPrimaryFieldRequired(field)) {
    return false;
  }
  if (field === 'dosage') {
    return !(props.rec.dosage || '').trim()
      || !(props.rec.dosageUnit || '').trim()
      || isNumericFieldInvalid('dosage');
  }
  if (field === 'frequency' || field === 'route') {
    return !resolveUsageKey(field);
  }
  return !hasPositiveNumber(props.rec.totalQty) || isNumericFieldInvalid('totalQty');
}

function handleDosageInput(event: Event): void {
  handleNumericInput('dosage', event, (value) => {
    props.rec.dosage = value;
    props.rec.dosageManualEdited = true;
  });
  if (!(props.rec.dosage || '').trim() || !(props.rec.dosageUnit || '').trim() || isNumericFieldInvalid('dosage')) {
    props.rec.selected = false;
  }
}

function getNumericFieldValue(field: TreatmentNumericField): string {
  if (field === 'dosage') {
    return props.rec.dosage || '';
  }
  if (field === 'days') {
    return props.rec.days || '';
  }
  return props.rec.totalQty || '';
}

function getNumericMetaId(field: TreatmentNumericField): string {
  return `${numericMetaIdPrefix}-${field}-meta`;
}

function isNumericFieldInvalid(field: TreatmentNumericField): boolean {
  return Boolean(getTreatmentNumericFieldIssue(field, getNumericFieldValue(field)));
}

function getNumericFieldMessage(field: TreatmentNumericField): string {
  const issue = getTreatmentNumericFieldIssue(field, getNumericFieldValue(field));
  if (issue) {
    return issue;
  }
  if (numericInputBlockedField.value === field) {
    return `仅允许${getTreatmentNumericFieldConstraintText(field)}`;
  }
  return '';
}

function getProjectedInputValue(input: HTMLInputElement, insertedText: string): string {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  return `${input.value.slice(0, start)}${insertedText}${input.value.slice(end)}`;
}

function blockNumericInput(field: TreatmentNumericField, event: Event): void {
  event.preventDefault();
  numericInputBlockedField.value = field;
}

function shouldBlockNumericValue(field: TreatmentNumericField, input: HTMLInputElement, insertedText: string): boolean {
  const projected = getProjectedInputValue(input, insertedText);
  return !isTreatmentNumericInputAllowed(field, projected);
}

function handleNumericBeforeInput(field: TreatmentNumericField, event: Event): void {
  const inputEvent = event as InputEvent;
  if (inputEvent.isComposing || inputEvent.inputType.startsWith('delete')) {
    return;
  }
  const input = event.target as HTMLInputElement | null;
  const insertedText = inputEvent.data || '';
  if (!input || !insertedText) {
    return;
  }
  if (shouldBlockNumericValue(field, input, insertedText)) {
    blockNumericInput(field, event);
  }
}

function handleNumericPaste(field: TreatmentNumericField, event: ClipboardEvent): void {
  const input = event.target as HTMLInputElement | null;
  const pastedText = event.clipboardData?.getData('text') || '';
  if (!input || !pastedText) {
    return;
  }
  if (shouldBlockNumericValue(field, input, pastedText)) {
    blockNumericInput(field, event);
  }
}

function handleNumericInput(
  field: TreatmentNumericField,
  event: Event,
  assign: (value: string) => void,
): boolean {
  const input = event.target as HTMLInputElement | null;
  if (!input) {
    return false;
  }
  const nextValue = input.value;
  if (!isTreatmentNumericInputAllowed(field, nextValue)) {
    input.value = getNumericFieldValue(field);
    numericInputBlockedField.value = field;
    return false;
  }
  assign(nextValue);
  if (!getTreatmentNumericFieldIssue(field, nextValue)) {
    numericInputBlockedField.value = null;
  }
  return true;
}

function shouldBlockRemarkValue(input: HTMLInputElement, insertedText: string): boolean {
  const projected = getProjectedInputValue(input, insertedText);
  const currentLength = getTreatmentRemarkLength(input.value);
  const projectedLength = getTreatmentRemarkLength(projected);
  return projectedLength > TREATMENT_REMARK_MAX_LENGTH && projectedLength > currentLength;
}

function blockRemarkInput(event: Event): void {
  event.preventDefault();
  remarkInputBlocked.value = true;
}

function handleRemarkBeforeInput(event: Event): void {
  const inputEvent = event as InputEvent;
  if (inputEvent.isComposing || inputEvent.inputType.startsWith('delete')) {
    return;
  }
  const input = event.target as HTMLInputElement | null;
  const insertedText = inputEvent.data || '';
  if (!input || !insertedText) {
    return;
  }
  if (shouldBlockRemarkValue(input, insertedText)) {
    blockRemarkInput(event);
  }
}

function handleRemarkPaste(event: ClipboardEvent): void {
  const input = event.target as HTMLInputElement | null;
  const pastedText = event.clipboardData?.getData('text') || '';
  if (!input || !pastedText) {
    return;
  }
  if (shouldBlockRemarkValue(input, pastedText)) {
    blockRemarkInput(event);
  }
}

function handleRemarkInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const nextValue = input.value;
  const currentValue = props.rec.remark || '';
  const nextLength = getTreatmentRemarkLength(nextValue);
  const currentLength = getTreatmentRemarkLength(currentValue);

  if (nextLength > TREATMENT_REMARK_MAX_LENGTH && nextLength > currentLength) {
    input.value = currentValue;
    remarkInputBlocked.value = true;
    return;
  }

  props.rec.remark = nextValue;
  if (!isTreatmentRemarkOverLimit(nextValue)) {
    remarkInputBlocked.value = false;
  }
}
</script>

<style scoped>
.treatment-item-editor {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  border: 1px solid var(--voice-border);
  background: var(--voice-surface-soft);
}

.treatment-item-editor.mode-inline {
  margin-top: 0;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  display: block;
}

.medicine-primary-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
}

.primary-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.primary-field > label {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.primary-field.required > label::after,
.te-row.required .te-label::after {
  content: "*";
  margin-left: 2px;
  color: #dc2626;
}

.field-editor {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-field-row {
  min-height: 34px;
}

.numeric-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.numeric-field-message {
  max-width: 160px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.35;
}

.numeric-field-message.is-error {
  color: #dc2626;
  font-weight: 600;
}

.edit-input {
  width: 100%;
  min-width: 0;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--voice-border, #dbe3ee);
  border-radius: 10px;
  background: var(--voice-surface-soft, #f8fafc);
  color: var(--voice-text, #0f172a);
  font-size: var(--voice-font-main, 14px);
  outline: none;
  box-sizing: border-box;
}

.edit-input.small {
  max-width: 120px;
}

.edit-input:focus {
  border-color: var(--voice-accent, #2563eb);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.field-read-btn {
  min-height: 34px;
  width: 100%;
  padding: 0 10px;
  border: 1px solid var(--voice-border, #dbe3ee);
  border-radius: 10px;
  background: #fff;
  color: var(--voice-text, #0f172a);
  font-size: var(--voice-font-main, 14px);
  text-align: left;
  cursor: pointer;
}

.field-read-btn.placeholder {
  color: var(--voice-text-muted, #64748b);
}

.primary-field.missing .edit-input,
.primary-field.missing .field-read-btn,
.te-row.missing .te-input,
.numeric-field .edit-input[aria-invalid="true"],
.numeric-field .te-input[aria-invalid="true"],
.te-row.missing :deep(.muf-trigger),
.te-row.missing :deep(.muf-input),
.primary-field.missing :deep(.muf-trigger),
.primary-field.missing :deep(.muf-input) {
  border-color: rgba(220, 38, 38, 0.72);
  background: rgba(254, 242, 242, 0.94);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.18);
}

.primary-field.missing .edit-input:focus,
.te-row.missing .te-input:focus,
.numeric-field .edit-input[aria-invalid="true"]:focus,
.numeric-field .te-input[aria-invalid="true"]:focus,
.te-row.missing :deep(.muf-trigger:hover),
.te-row.missing :deep(.muf-trigger:focus-visible),
.te-row.missing :deep(.muf-input:focus),
.primary-field.missing :deep(.muf-trigger:hover),
.primary-field.missing :deep(.muf-trigger:focus-visible),
.primary-field.missing :deep(.muf-input:focus) {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.26);
}

.static-unit {
  color: var(--voice-text-muted, #64748b);
  font-size: var(--voice-font-min, 12px);
  white-space: nowrap;
}

.static-unit.placeholder {
  color: #94a3b8;
}

.te-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-strong, #333);
}

.te-row-wide {
  grid-column: 1 / -1;
}

.remark-row {
  align-items: flex-start;
}

.remark-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.remark-field-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-height: 16px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.remark-field-meta.is-warning {
  color: #b45309;
}

.remark-field-meta.is-error {
  color: #dc2626;
  font-weight: 600;
}

.remark-field-message {
  text-align: right;
}

.te-label {
  flex: 0 0 64px;
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.te-input {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid #d0d7de;
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  line-height: 1.4;
}

.te-input-num {
  flex: 0 0 80px;
}

.te-suffix {
  flex: 0 0 auto;
  color: #888;
  font-size: 12px;
}

.te-readonly {
  flex: 1;
  padding: 3px 6px;
  color: #555;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
}

.te-input:focus {
  outline: none;
  border-color: var(--accent, #007aff);
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
}

.remark-row.is-over-limit .te-input {
  border-color: rgba(220, 38, 38, 0.72);
  background: rgba(254, 242, 242, 0.94);
  box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.18);
}
</style>
