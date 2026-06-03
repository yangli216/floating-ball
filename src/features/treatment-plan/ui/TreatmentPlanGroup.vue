<script setup lang="ts">
import Icon from '@shared/ui/Icon.vue';
import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getSuggestedMatchName,
  getTreatmentMatchLabel,
  getTreatmentOriginalName,
  getTreatmentSpec,
  hasProbableMatch,
  type MedicinePrimaryField,
} from '@features/clinical-result';
import {
  ManualMatchPicker,
  TreatmentItemEditor,
  TreatmentRecommendationCard,
  type ManualMatchCandidate,
} from '@features/consultation-result';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';
import type { TreatmentPlanRecommendationSection } from '../model/useTreatmentPlanRecommendations';

type TreatmentPlanAttributeField = 'pharmacy' | 'execDept' | 'bodySite' | 'insurance';
type TreatmentPlanAttributeOption = { key: string; text: string; mcode?: string };

const props = defineProps<{
  section: TreatmentPlanRecommendationSection;
  selectedCount: number;
  totalCount: number;
  isPharmacyRequired: (item: TreatmentRecommendation) => boolean;
  getPharmacyDisplay: (item: TreatmentRecommendation) => string;
  hasRequiredPharmacy: (item: TreatmentRecommendation) => boolean;
  isExecDeptRequired: (item: TreatmentRecommendation) => boolean;
  getExecDeptDisplay: (item: TreatmentRecommendation) => string;
  hasRequiredExecDept: (item: TreatmentRecommendation) => boolean;
  getBodySiteDisplay: (item: TreatmentRecommendation) => string;
  hasRequiredBodySite: (item: TreatmentRecommendation) => boolean;
  frequencyOptions: UsageOption[];
  routeOptions: UsageOption[];
  shouldShowTreatmentEditor: (item: TreatmentRecommendation) => boolean;
  isTreatmentEditorExpanded: (item: TreatmentRecommendation) => boolean;
  isEditableFieldActive: (item: TreatmentRecommendation, field: MedicinePrimaryField) => boolean;
  getEditableFieldKey: (item: TreatmentRecommendation, field: MedicinePrimaryField) => string;
  getMedicineFieldDisplay: (item: TreatmentRecommendation, field: MedicinePrimaryField) => string;
  getMedicineInlineSummary: (item: TreatmentRecommendation) => string;
  isMedicineInventoryChecking: (item: TreatmentRecommendation) => boolean;
  getMedicineInventoryWarning: (item: TreatmentRecommendation) => string;
  isSecondarySelectorOpen: (item: TreatmentRecommendation, field: TreatmentPlanAttributeField) => boolean;
  getPharmacySearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredPharmacyOptions: (item: TreatmentRecommendation) => TreatmentPlanAttributeOption[];
  getExecDeptSearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredExecDeptOptions: (item: TreatmentRecommendation) => TreatmentPlanAttributeOption[];
  getBodySiteSearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredBodySiteOptions: (item: TreatmentRecommendation) => TreatmentPlanAttributeOption[];
  getInsuranceSearchKeyword: (item: TreatmentRecommendation) => string;
  getFilteredInsuranceOptions: (item: TreatmentRecommendation) => TreatmentPlanAttributeOption[];
  isManualMatchOpen: (item: TreatmentRecommendation) => boolean;
  getManualMatchKeyword: (item: TreatmentRecommendation) => string;
  getManualMatchCandidates: (item: TreatmentRecommendation) => ManualMatchCandidate[];
}>();

const emit = defineEmits<{
  toggle: [item: TreatmentRecommendation];
  confirmMatch: [item: TreatmentRecommendation];
  toggleTreatmentEditor: [item: TreatmentRecommendation, event?: Event];
  activateEditableField: [item: TreatmentRecommendation, field: MedicinePrimaryField, event?: Event];
  editableFieldBlur: [item: TreatmentRecommendation, field: MedicinePrimaryField, event: FocusEvent];
  registerEditableFieldElement: [key: string, element: unknown];
  totalQtyInput: [item: TreatmentRecommendation, event: Event];
  frequencyOpenChange: [item: TreatmentRecommendation, open: boolean];
  routeOpenChange: [item: TreatmentRecommendation, open: boolean];
  openPharmacy: [item: TreatmentRecommendation, event?: Event];
  openExecDept: [item: TreatmentRecommendation, event?: Event];
  openBodySite: [item: TreatmentRecommendation, event?: Event];
  openInsurance: [item: TreatmentRecommendation, event?: Event];
  closeSecondarySelector: [item: TreatmentRecommendation, field: TreatmentPlanAttributeField, event: FocusEvent];
  updatePharmacyKeyword: [item: TreatmentRecommendation, event: Event];
  selectPharmacy: [item: TreatmentRecommendation, option: TreatmentPlanAttributeOption];
  clearPharmacy: [item: TreatmentRecommendation];
  updateExecDeptKeyword: [item: TreatmentRecommendation, event: Event];
  selectExecDept: [item: TreatmentRecommendation, option: TreatmentPlanAttributeOption];
  clearExecDept: [item: TreatmentRecommendation];
  updateBodySiteKeyword: [item: TreatmentRecommendation, event: Event];
  selectBodySite: [item: TreatmentRecommendation, option: TreatmentPlanAttributeOption];
  clearBodySite: [item: TreatmentRecommendation];
  updateInsuranceKeyword: [item: TreatmentRecommendation, event: Event];
  selectInsurance: [item: TreatmentRecommendation, option: TreatmentPlanAttributeOption];
  clearInsurance: [item: TreatmentRecommendation];
  toggleManualMatch: [item: TreatmentRecommendation];
  updateManualMatchKeyword: [item: TreatmentRecommendation, value: string];
  selectManualMatchCandidate: [item: TreatmentRecommendation, candidate: ManualMatchCandidate];
}>();

function getTypeBadge(item: TreatmentRecommendation): string {
  switch (item.type) {
    case 'medicine':
      return '药';
    case 'exam':
      return '查';
    case 'lab_test':
      return '验';
    case 'procedure':
      return '处';
    default:
      return '项';
  }
}

function getMatchTone(item: TreatmentRecommendation): 'default' | 'warning' | 'success' {
  if (item.matchStatus === 'probable' || item.matchStatus === 'unmatched' || !item.matchedItem) {
    return 'warning';
  }
  if (item.matchStatus === 'manual' || item.matchStatus === 'confirmed' || item.matchStatus === 'exact') {
    return 'success';
  }
  return 'default';
}

function getDisplayMatchLabel(item: TreatmentRecommendation): string {
  return item.matchedItem || item.matchStatus === 'probable'
    ? getTreatmentMatchLabel(item, 'detailed') || '未匹配标准库'
    : '未匹配标准库';
}

function getManualMatchTitle(sectionTitle: string): string {
  return `从标准库选择${sectionTitle.replace(/^推荐/, '').replace('项目', '')}`;
}

function getUsageToken(item: TreatmentRecommendation): string {
  if (item.type === 'medicine') return '';
  return item.usage || '';
}

function getInlineSummary(item: TreatmentRecommendation): string {
  return item.type === 'medicine' && !props.isTreatmentEditorExpanded(item)
    ? props.getMedicineInlineSummary(item)
    : '';
}

function shouldShowEditorToggle(item: TreatmentRecommendation): boolean {
  return !!item.selected || props.isTreatmentEditorExpanded(item);
}

function shouldShowExecDeptField(item: TreatmentRecommendation): boolean {
  return item.type !== 'medicine';
}

function isExecDeptChipMissing(item: TreatmentRecommendation): boolean {
  return props.isExecDeptRequired(item) && !props.hasRequiredExecDept(item);
}

function getExecDeptChipTitle(item: TreatmentRecommendation): string {
  if (props.hasRequiredExecDept(item) && props.getExecDeptDisplay(item)) {
    return '点击调整执行科室';
  }
  if (props.isExecDeptRequired(item)) {
    return '执行科室为空，点击设置后才能选中';
  }
  return '点击设置执行科室';
}

function getAttributeOptions(item: TreatmentRecommendation, field: TreatmentPlanAttributeField): TreatmentPlanAttributeOption[] {
  switch (field) {
    case 'pharmacy':
      return props.getFilteredPharmacyOptions(item);
    case 'execDept':
      return props.getFilteredExecDeptOptions(item);
    case 'bodySite':
      return props.getFilteredBodySiteOptions(item);
    case 'insurance':
      return props.getFilteredInsuranceOptions(item);
  }
}

function getAttributeKeyword(item: TreatmentRecommendation, field: TreatmentPlanAttributeField): string {
  switch (field) {
    case 'pharmacy':
      return props.getPharmacySearchKeyword(item);
    case 'execDept':
      return props.getExecDeptSearchKeyword(item);
    case 'bodySite':
      return props.getBodySiteSearchKeyword(item);
    case 'insurance':
      return props.getInsuranceSearchKeyword(item);
  }
}

function getAttributePlaceholder(field: TreatmentPlanAttributeField): string {
  switch (field) {
    case 'pharmacy':
      return '输入名称筛选药房';
    case 'execDept':
      return '输入名称筛选科室';
    case 'bodySite':
      return '输入名称筛选部位';
    case 'insurance':
      return '输入名称筛选医保类型';
  }
}

function getAttributeEmptyText(field: TreatmentPlanAttributeField): string {
  switch (field) {
    case 'pharmacy':
      return '未找到匹配药房';
    case 'execDept':
      return '未找到匹配科室';
    case 'bodySite':
      return '暂无可选部位';
    case 'insurance':
      return '未找到匹配医保类型';
  }
}

function hasAttributeValue(item: TreatmentRecommendation, field: TreatmentPlanAttributeField): boolean {
  switch (field) {
    case 'pharmacy':
      return Boolean(item.pharmacy);
    case 'execDept':
      return Boolean(item.execDept);
    case 'bodySite':
      return Boolean(item.bodySite);
    case 'insurance':
      return Boolean(item.insuranceType);
  }
}

function updateAttributeKeyword(item: TreatmentRecommendation, field: TreatmentPlanAttributeField, event: Event): void {
  switch (field) {
    case 'pharmacy':
      emit('updatePharmacyKeyword', item, event);
      return;
    case 'execDept':
      emit('updateExecDeptKeyword', item, event);
      return;
    case 'bodySite':
      emit('updateBodySiteKeyword', item, event);
      return;
    case 'insurance':
      emit('updateInsuranceKeyword', item, event);
      return;
  }
}

function selectAttributeOption(item: TreatmentRecommendation, field: TreatmentPlanAttributeField, option: TreatmentPlanAttributeOption): void {
  switch (field) {
    case 'pharmacy':
      emit('selectPharmacy', item, option);
      return;
    case 'execDept':
      emit('selectExecDept', item, option);
      return;
    case 'bodySite':
      emit('selectBodySite', item, option);
      return;
    case 'insurance':
      emit('selectInsurance', item, option);
      return;
  }
}

function clearAttribute(item: TreatmentRecommendation, field: TreatmentPlanAttributeField): void {
  switch (field) {
    case 'pharmacy':
      emit('clearPharmacy', item);
      return;
    case 'execDept':
      emit('clearExecDept', item);
      return;
    case 'bodySite':
      emit('clearBodySite', item);
      return;
    case 'insurance':
      emit('clearInsurance', item);
      return;
  }
}

function getAttributeAriaLabel(field: TreatmentPlanAttributeField): string {
  switch (field) {
    case 'pharmacy':
      return '药房候选项';
    case 'execDept':
      return '执行科室候选项';
    case 'bodySite':
      return '检查部位候选项';
    case 'insurance':
      return '医保限用候选项';
  }
}
</script>

<template>
  <section class="plan-group">
    <header class="plan-group-header">
      <div class="plan-group-title">
        <h3>{{ section.title }}</h3>
      </div>
      <div class="plan-group-stats">
        <span>{{ totalCount }} 项推荐</span>
        <span>{{ selectedCount }} 项已选</span>
      </div>
    </header>

    <div v-if="section.loading" class="plan-group-state">
      <Icon icon="lucide:loader-2" :size="18" class="spin" aria-hidden="true" />
      <span>正在生成{{ section.title }}...</span>
    </div>

    <div v-else-if="section.error" class="plan-group-state is-error">
      <Icon icon="lucide:circle-alert" :size="18" aria-hidden="true" />
      <span>{{ section.error }}</span>
    </div>

    <div v-else-if="section.items.length === 0" class="plan-group-state">
      <span>当前暂无推荐项目</span>
    </div>

    <div v-else class="plan-list">
      <TreatmentRecommendationCard
        v-for="item in section.items"
        :key="`${item.type}:${item.matchedItem?.id || item.name}`"
        :rec="item"
        :selected="!!item.selected"
        :locked="!item.matchedItem"
        :matching="props.isManualMatchOpen(item)"
        :spec="getTreatmentSpec(item)"
        :match-label="getDisplayMatchLabel(item)"
        :match-tone="getMatchTone(item)"
        :show-exec-dept-chip="shouldShowExecDeptField(item)"
        :exec-dept-display="props.getExecDeptDisplay(item)"
        :exec-dept-missing="isExecDeptChipMissing(item)"
        :exec-dept-title="getExecDeptChipTitle(item)"
        :show-pharmacy-chip="props.isPharmacyRequired(item)"
        :pharmacy-display="props.getPharmacyDisplay(item)"
        :pharmacy-missing="!props.hasRequiredPharmacy(item)"
        :pharmacy-title="props.hasRequiredPharmacy(item) ? '点击调整发药药房' : '发药药房未设置或不在当前药品可用药房列表，点击选择'"
        :usage-token="getUsageToken(item)"
        :probable-match-name="hasProbableMatch(item) ? getSuggestedMatchName(item) : ''"
        :original-name="getTreatmentOriginalName(item)"
        :inline-summary="getInlineSummary(item)"
        :show-feedback="false"
        :show-manual-match-button="!item.matchedItem"
        :manual-match-title="props.isManualMatchOpen(item) ? '收起手动匹配' : '手动匹配标准库项目'"
        :manual-match-button-text="props.isManualMatchOpen(item) ? '收起匹配' : '手动匹配'"
        :show-editor-toggle="shouldShowEditorToggle(item)"
        :editor-expanded="props.isTreatmentEditorExpanded(item)"
        layout-variant="worklist"
        @toggle="emit('toggle', item)"
        @open-pharmacy="emit('openPharmacy', item, $event)"
        @open-exec-dept="emit('openExecDept', item, $event)"
        @confirm-probable-match="emit('confirmMatch', item)"
        @toggle-manual-match="emit('toggleManualMatch', item)"
        @toggle-editor="emit('toggleTreatmentEditor', item, $event)"
      >
        <template #title-prefix>
          <span class="type-badge">{{ getTypeBadge(item) }}</span>
        </template>

        <template #actions>
          <button
            v-if="item.type === 'exam'"
            class="body-site-chip"
            :class="{ missing: !props.hasRequiredBodySite(item) }"
            type="button"
            :title="props.hasRequiredBodySite(item) ? '点击调整检查部位' : '检查部位为空，点击设置后才能选中'"
            @click.stop="emit('openBodySite', item, $event)"
          >
            <span v-if="!props.hasRequiredBodySite(item)" class="body-site-chip-label">检查部位</span>
            <span class="body-site-chip-value">{{ props.getBodySiteDisplay(item) || '待设置' }}</span>
          </button>
        </template>

        <template #manual-match>
          <ManualMatchPicker
            v-if="!item.matchedItem && props.isManualMatchOpen(item)"
            :title="getManualMatchTitle(section.title)"
            :keyword="props.getManualMatchKeyword(item)"
            :candidates="props.getManualMatchCandidates(item)"
            @update:keyword="emit('updateManualMatchKeyword', item, $event)"
            @select="emit('selectManualMatchCandidate', item, $event)"
          />
        </template>

        <template #editor>
          <div v-if="props.shouldShowTreatmentEditor(item)" class="editor-shell" @click.stop>
            <template v-if="item.type === 'medicine'">
              <TreatmentItemEditor
                :rec="item"
                mode="inline"
                :frequency-options="props.frequencyOptions"
                :route-options="props.routeOptions"
                :is-field-active="(field) => props.isEditableFieldActive(item, field)"
                :activate-field="(field, event) => emit('activateEditableField', item, field, event)"
                :on-field-blur="(field, event) => emit('editableFieldBlur', item, field, event)"
                :register-field-element="(field, element) => emit('registerEditableFieldElement', props.getEditableFieldKey(item, field), element)"
                :on-total-qty-input="(event) => emit('totalQtyInput', item, event)"
                :on-field-open-change="(field, open) => field === 'frequency' ? emit('frequencyOpenChange', item, open) : emit('routeOpenChange', item, open)"
                :get-display-value="(field) => props.getMedicineFieldDisplay(item, field)"
              />

              <div v-if="props.isMedicineInventoryChecking(item)" class="medicine-inventory-note checking">
                正在校验库存...
              </div>
              <div v-else-if="props.getMedicineInventoryWarning(item)" class="medicine-inventory-note warning">
                {{ props.getMedicineInventoryWarning(item) }}
              </div>

              <div v-if="props.isTreatmentEditorExpanded(item)" class="secondary-field-grid">
                <div class="secondary-field">
                  <label>规定病</label>
                  <input v-model="item.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                </div>
                <div class="secondary-field">
                  <label>天数</label>
                  <input v-model="item.days" type="text" placeholder="天" class="edit-input mini" />
                </div>
                <div class="secondary-field">
                  <label>药房</label>
                  <div class="field-editor route-field-editor" @focusout="emit('closeSecondarySelector', item, 'pharmacy', $event)">
                    <input
                      :value="getAttributeKeyword(item, 'pharmacy')"
                      type="text"
                      :placeholder="getAttributePlaceholder('pharmacy')"
                      class="edit-input"
                      @focus="emit('openPharmacy', item, $event)"
                      @input="updateAttributeKeyword(item, 'pharmacy', $event)"
                    />
                    <div v-if="props.isSecondarySelectorOpen(item, 'pharmacy')" class="route-option-list" role="listbox" :aria-label="getAttributeAriaLabel('pharmacy')">
                      <button
                        v-if="hasAttributeValue(item, 'pharmacy')"
                        class="route-option-item route-option-clear"
                        type="button"
                        @mousedown.prevent.stop="clearAttribute(item, 'pharmacy')"
                      >
                        <span class="route-option-text">清空当前值</span>
                      </button>
                      <button
                        v-for="option in getAttributeOptions(item, 'pharmacy').slice(0, 8)"
                        :key="option.key"
                        class="route-option-item"
                        type="button"
                        @mousedown.prevent.stop="selectAttributeOption(item, 'pharmacy', option)"
                      >
                        <span class="route-option-text">{{ option.text }}</span>
                        <span v-if="option.mcode" class="route-option-meta">{{ option.mcode }}</span>
                      </button>
                      <div v-if="getAttributeOptions(item, 'pharmacy').length === 0" class="route-option-empty">{{ getAttributeEmptyText('pharmacy') }}</div>
                    </div>
                  </div>
                </div>
                <div class="secondary-field">
                  <label>备注</label>
                  <input v-model="item.remark" type="text" placeholder="备注" class="edit-input" />
                </div>
                <div class="secondary-field">
                  <label>医保限用</label>
                  <div class="field-editor route-field-editor" @focusout="emit('closeSecondarySelector', item, 'insurance', $event)">
                    <input
                      :value="getAttributeKeyword(item, 'insurance')"
                      type="text"
                      :placeholder="getAttributePlaceholder('insurance')"
                      class="edit-input"
                      @focus="emit('openInsurance', item, $event)"
                      @input="updateAttributeKeyword(item, 'insurance', $event)"
                    />
                    <div v-if="props.isSecondarySelectorOpen(item, 'insurance')" class="route-option-list" role="listbox" :aria-label="getAttributeAriaLabel('insurance')">
                      <button
                        v-if="hasAttributeValue(item, 'insurance')"
                        class="route-option-item route-option-clear"
                        type="button"
                        @mousedown.prevent.stop="clearAttribute(item, 'insurance')"
                      >
                        <span class="route-option-text">清空当前值</span>
                      </button>
                      <button
                        v-for="option in getAttributeOptions(item, 'insurance').slice(0, 8)"
                        :key="option.key"
                        class="route-option-item"
                        type="button"
                        @mousedown.prevent.stop="selectAttributeOption(item, 'insurance', option)"
                      >
                        <span class="route-option-text">{{ option.text }}</span>
                      </button>
                      <div v-if="getAttributeOptions(item, 'insurance').length === 0" class="route-option-empty">{{ getAttributeEmptyText('insurance') }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <TreatmentItemEditor
                :rec="item"
                :frequency-options="props.frequencyOptions"
                :route-options="props.routeOptions"
                :show-exec-dept-readonly="false"
                :show-body-site-readonly="false"
              />

              <div v-if="props.isTreatmentEditorExpanded(item)" class="secondary-field-grid">
                <div v-if="shouldShowExecDeptField(item)" class="secondary-field">
                  <label>执行科室</label>
                  <div class="field-editor route-field-editor" @focusout="emit('closeSecondarySelector', item, 'execDept', $event)">
                    <input
                      :value="getAttributeKeyword(item, 'execDept')"
                      type="text"
                      :placeholder="getAttributePlaceholder('execDept')"
                      class="edit-input"
                      @focus="emit('openExecDept', item, $event)"
                      @input="updateAttributeKeyword(item, 'execDept', $event)"
                    />
                    <div v-if="props.isSecondarySelectorOpen(item, 'execDept')" class="route-option-list" role="listbox" :aria-label="getAttributeAriaLabel('execDept')">
                      <button
                        v-if="hasAttributeValue(item, 'execDept')"
                        class="route-option-item route-option-clear"
                        type="button"
                        @mousedown.prevent.stop="clearAttribute(item, 'execDept')"
                      >
                        <span class="route-option-text">清空当前值</span>
                      </button>
                      <button
                        v-for="option in getAttributeOptions(item, 'execDept').slice(0, 8)"
                        :key="option.key"
                        class="route-option-item"
                        type="button"
                        @mousedown.prevent.stop="selectAttributeOption(item, 'execDept', option)"
                      >
                        <span class="route-option-text">{{ option.text }}</span>
                        <span v-if="option.key !== option.text" class="route-option-meta">{{ option.key }}</span>
                      </button>
                      <div v-if="getAttributeOptions(item, 'execDept').length === 0" class="route-option-empty">{{ getAttributeEmptyText('execDept') }}</div>
                    </div>
                  </div>
                </div>
                <div v-if="item.type === 'exam'" class="secondary-field">
                  <label>检查部位</label>
                  <div class="field-editor route-field-editor" @focusout="emit('closeSecondarySelector', item, 'bodySite', $event)">
                    <input
                      :value="getAttributeKeyword(item, 'bodySite')"
                      type="text"
                      :placeholder="getAttributePlaceholder('bodySite')"
                      class="edit-input"
                      @focus="emit('openBodySite', item, $event)"
                      @input="updateAttributeKeyword(item, 'bodySite', $event)"
                    />
                    <div v-if="props.isSecondarySelectorOpen(item, 'bodySite')" class="route-option-list" role="listbox" :aria-label="getAttributeAriaLabel('bodySite')">
                      <button
                        v-if="hasAttributeValue(item, 'bodySite')"
                        class="route-option-item route-option-clear"
                        type="button"
                        @mousedown.prevent.stop="clearAttribute(item, 'bodySite')"
                      >
                        <span class="route-option-text">清空当前值</span>
                      </button>
                      <button
                        v-for="option in getAttributeOptions(item, 'bodySite').slice(0, 8)"
                        :key="option.key"
                        class="route-option-item"
                        type="button"
                        @mousedown.prevent.stop="selectAttributeOption(item, 'bodySite', option)"
                      >
                        <span class="route-option-text">{{ option.text }}</span>
                        <span v-if="option.mcode" class="route-option-meta">{{ option.mcode }}</span>
                      </button>
                      <div v-if="getAttributeOptions(item, 'bodySite').length === 0" class="route-option-empty">{{ getAttributeEmptyText('bodySite') }}</div>
                    </div>
                  </div>
                </div>
                <div class="secondary-field">
                  <label>医保限用</label>
                  <div class="field-editor route-field-editor" @focusout="emit('closeSecondarySelector', item, 'insurance', $event)">
                    <input
                      :value="getAttributeKeyword(item, 'insurance')"
                      type="text"
                      :placeholder="getAttributePlaceholder('insurance')"
                      class="edit-input"
                      @focus="emit('openInsurance', item, $event)"
                      @input="updateAttributeKeyword(item, 'insurance', $event)"
                    />
                    <div v-if="props.isSecondarySelectorOpen(item, 'insurance')" class="route-option-list" role="listbox" :aria-label="getAttributeAriaLabel('insurance')">
                      <button
                        v-if="hasAttributeValue(item, 'insurance')"
                        class="route-option-item route-option-clear"
                        type="button"
                        @mousedown.prevent.stop="clearAttribute(item, 'insurance')"
                      >
                        <span class="route-option-text">清空当前值</span>
                      </button>
                      <button
                        v-for="option in getAttributeOptions(item, 'insurance').slice(0, 8)"
                        :key="option.key"
                        class="route-option-item"
                        type="button"
                        @mousedown.prevent.stop="selectAttributeOption(item, 'insurance', option)"
                      >
                        <span class="route-option-text">{{ option.text }}</span>
                      </button>
                      <div v-if="getAttributeOptions(item, 'insurance').length === 0" class="route-option-empty">{{ getAttributeEmptyText('insurance') }}</div>
                    </div>
                  </div>
                </div>
                <div class="secondary-field">
                  <label>规定病</label>
                  <input v-model="item.regulatedDisease" type="text" placeholder="规定病" class="edit-input" />
                </div>
              </div>
            </template>
          </div>
        </template>
      </TreatmentRecommendationCard>
    </div>
  </section>
</template>

<style scoped>
.plan-group {
  --voice-border: #dbe3ee;
  --voice-border-strong: #cbd5e1;
  --voice-surface: #fff;
  --voice-surface-soft: #f8fafc;
  --voice-accent: #2469f2;
  --voice-accent-soft: rgba(36, 105, 242, 0.18);
  --voice-accent-softer: rgba(36, 105, 242, 0.08);
  --voice-accent-strong: #1d4ed8;
  --voice-warning: #b45309;
  --voice-success: #15803d;
  --voice-text: #111827;
  --voice-text-muted: #64748b;
  --voice-font-min: 12px;
  --voice-font-strong: 15px;
  overflow: visible;
}

.plan-group + .plan-group {
  margin-top: 14px;
}

.plan-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.plan-group-title {
  display: flex;
  align-items: center;
  min-width: 0;
}

.plan-group-title h3 {
  margin: 0;
  color: var(--voice-text);
  font-size: var(--voice-font-strong);
  font-weight: 700;
  line-height: 1.4;
}

.plan-group-stats {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  color: var(--voice-text-muted);
  font-size: var(--voice-font-min);
}

.plan-group-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 76px;
  padding: 18px;
  color: #64748b;
  font-size: 14px;
}

.plan-group-state.is-error {
  color: #b45309;
  background: #fff7ed;
}

.spin {
  animation: spin 0.9s linear infinite;
}

.plan-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.body-site-chip {
  min-height: 28px;
  border-radius: 999px;
  white-space: nowrap;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid #8bb7ff;
  border-radius: 5px;
  color: #2469f2;
  font-weight: 700;
  font-size: 13px;
  line-height: 1;
  background: #f1f6ff;
}

.field-editor {
  flex: 1;
  min-width: 0;
  position: relative;
}

.editor-shell {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--voice-border);
}

.medicine-inventory-note {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.medicine-inventory-note.checking {
  color: #2469f2;
  background: rgba(36, 105, 242, 0.08);
}

.medicine-inventory-note.warning {
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.secondary-field-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.secondary-field {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--voice-border);
  border-radius: 10px;
  background: var(--voice-surface-soft);
}

.secondary-field label {
  flex-shrink: 0;
  color: var(--voice-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.edit-input {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  color: #1f2937;
  font-size: 13px;
  background: #fff;
}

.edit-input.mini {
  max-width: 74px;
}

.edit-input:focus {
  border-color: #2469f2;
  outline: 2px solid rgba(36, 105, 242, 0.16);
}

.route-option-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: min(320px, 72vw);
  max-height: 230px;
  overflow-y: auto;
  padding: 6px;
  border: 1px solid #dbe3ee;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 18px 34px rgba(15, 23, 42, 0.14);
}

.route-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  color: #1f2937;
  font-size: 13px;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.route-option-item:hover {
  background: #f1f6ff;
  color: #2469f2;
}

.route-option-clear {
  color: #64748b;
}

.route-option-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-option-meta {
  flex-shrink: 0;
  color: #94a3b8;
  font-size: 12px;
}

.route-option-empty {
  padding: 9px 8px;
  color: #94a3b8;
  font-size: 13px;
}

.edit-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.edit-unit {
  color: var(--voice-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.body-site-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 150px;
  padding: 0 9px;
  border: 1px solid rgba(37, 99, 235, 0.18);
  background: rgba(248, 250, 252, 0.96);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.body-site-chip:hover {
  border-color: #2469f2;
  background: rgba(37, 99, 235, 0.1);
}

.body-site-chip.missing {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(255, 247, 237, 0.92);
  color: #b45309;
}

.body-site-chip-label {
  flex-shrink: 0;
}

.body-site-chip-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
