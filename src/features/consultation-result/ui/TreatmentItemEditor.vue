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
            <input
              :ref="(el) => registerFieldElement('dosage', el as Element | null)"
              :value="rec.dosage || ''"
              type="text"
              placeholder="剂量"
              class="edit-input small"
              :aria-invalid="isPrimaryFieldMissing('dosage') ? 'true' : undefined"
              @input="handleDosageInput"
            />
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
            <input
              :ref="(el) => registerFieldElement('total', el as Element | null)"
              :value="rec.totalQty"
              type="text"
              placeholder="数量"
              class="edit-input small"
              :aria-invalid="isPrimaryFieldMissing('total') ? 'true' : undefined"
              @input="handleTotalQtyInput"
            />
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
          placeholder="请选择频次"
          @change="(field, value, key) => handleUsageFieldChange(field, value, key)"
        />
      </div>
      <div class="te-row required" :class="{ missing: isPrimaryFieldMissing('dosage') }">
        <label class="te-label">单次剂量</label>
        <input class="te-input te-input-num" type="text" :value="rec.dosage || ''" :aria-invalid="isPrimaryFieldMissing('dosage') ? 'true' : undefined" @input="handleDosageInput" />
        <span class="te-suffix">{{ rec.dosageUnit || '' }}</span>
      </div>
      <div class="te-row required" :class="{ missing: isPrimaryFieldMissing('total') }">
        <label class="te-label">总量</label>
        <input
          class="te-input te-input-num"
          type="text"
          :value="rec.totalQty || ''"
          :aria-invalid="isPrimaryFieldMissing('total') ? 'true' : undefined"
          @input="(e) => { rec.totalQty = (e.target as HTMLInputElement).value; rec.totalManualEdited = true; }"
        />
        <span class="te-suffix">{{ rec.totalUnit || '' }}</span>
      </div>
      <div class="te-row">
        <label class="te-label">用药天数</label>
        <input class="te-input te-input-num" type="text" :value="rec.days || ''" @input="(e) => rec.days = (e.target as HTMLInputElement).value" />
        <span class="te-suffix">天</span>
      </div>
    </template>

    <template v-else>
      <div v-if="shouldShowQuantityEditor" class="te-row required" :class="{ missing: isQuantityMissing }">
        <label class="te-label">数量</label>
        <input class="te-input te-input-num" type="text" :value="rec.totalQty || ''" :aria-invalid="isQuantityMissing ? 'true' : undefined" @input="(e) => rec.totalQty = (e.target as HTMLInputElement).value" />
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

    <div v-if="mode !== 'inline'" class="te-row te-row-wide">
      <label class="te-label">备注</label>
      <input class="te-input" type="text" :value="rec.remark || ''" placeholder="可选" @input="(e) => rec.remark = (e.target as HTMLInputElement).value" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, type PropType } from 'vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';
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
  if (props.onTotalQtyInput) {
    props.onTotalQtyInput(event);
    if (!hasPositiveNumber(props.rec.totalQty)) {
      props.rec.selected = false;
    }
    return;
  }
  props.rec.totalQty = (event.target as HTMLInputElement).value;
  props.rec.totalManualEdited = true;
  if (!hasPositiveNumber(props.rec.totalQty)) {
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
    return !(props.rec.dosage || '').trim() || !(props.rec.dosageUnit || '').trim();
  }
  if (field === 'frequency' || field === 'route') {
    return !resolveUsageKey(field);
  }
  return !hasPositiveNumber(props.rec.totalQty);
}

function handleDosageInput(event: Event): void {
  props.rec.dosage = (event.target as HTMLInputElement).value;
  if (!(props.rec.dosage || '').trim() || !(props.rec.dosageUnit || '').trim()) {
    props.rec.selected = false;
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
</style>
