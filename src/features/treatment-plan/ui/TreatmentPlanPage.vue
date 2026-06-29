<script setup lang="ts">
import { computed, inject, onMounted, ref, useSlots } from 'vue';
import { PatientHeader } from '@entities/patient';
import Icon from '@shared/ui/Icon.vue';
import type { AppPatient } from '@/types/appState';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import { getHisAdapter } from '@/services/his';
import { medicalDataService } from '@/services/medicalData';
import { trackTreatmentMatchPreference } from '@/services/recommendationPreferenceTracker';
import { getPatientContextAnchorId } from '@/utils/patientContext';
import { formatUserFacingError } from '@shared/lib/errorMessages';
import {
  useBodySiteOptions,
  useMedicineFieldEditing,
  useMedicineUsageSearch,
  useManualMatchState,
  useMedicalDictionaries,
  useSecondarySelector,
  useTreatmentAttributeSearch,
  useTreatmentEditorState,
  useTreatmentGates,
  useTreatmentHydration,
  useTreatmentNormalization,
  useTreatmentPharmacyResolution,
  useTreatmentSelectionReadiness,
  type SecondarySelectorField,
  type ManualMatchCandidate,
} from '@features/consultation-result';
import {
  applyManualMatchCandidate,
  findManualMatchCandidates,
  getMatchedItemRaw,
  getMedicineCollapsedSummary,
  getMedicineFieldDisplay as getSharedMedicineFieldDisplay,
  getTreatmentEditorKey,
  getTreatmentEditorFieldKey,
  hasProbableMatch,
  syncTreatmentExecDeptSelections as syncSharedTreatmentExecDeptSelections,
  toManualMatchCandidateView,
  type MedicinePrimaryField,
  type ManualMatchRawCandidate,
} from '@features/clinical-result';
import type { UsageOption } from '@/utils/medicalDictionaryHelpers';
import {
  useTreatmentPlanRecommendations,
} from '../model/useTreatmentPlanRecommendations';
import {
  useTreatmentPlanWriteback,
} from '../model/useTreatmentPlanWriteback';
import TreatmentPlanGroup from './TreatmentPlanGroup.vue';

type TreatmentPlanAttributeOption = { key: string; text: string; mcode?: string };

const props = defineProps<{
  patient?: AppPatient | null;
  followUpContext?: HisOutpatientFollowUpContext | null;
}>();

const emit = defineEmits<{
  close: [];
}>();
const slots = useSlots();
const hasEvidencePanel = computed(() => Boolean(slots.evidence));

const showToast = inject<((msg: string, type?: 'success' | 'error' | 'info') => void)>('showToast');

const currentDiagnosis = ref<Diagnosis | null>(null);
const treatments = ref<TreatmentRecommendation[]>([]);

const dictionaries = useMedicalDictionaries();
const {
  frequencyOptions,
  routeOptions,
  pharmacyOptions,
  execDeptOptions,
  loadFrequencyOptions,
  loadRouteOptions,
  loadPharmacyOptions,
  loadExecDeptOptions,
} = dictionaries;

const treatmentGates = useTreatmentGates({ pharmacyOptions, execDeptOptions });
const {
  getCandidatePharmaciesForMedicine,
  getDefaultPharmacyOption,
  ensureMedicineDefaultPharmacy,
  findMatchedPharmacyOption,
  getNormalizedPharmacyValue,
} = useTreatmentPharmacyResolution({
  pharmacyOptions: () => pharmacyOptions.value,
  treatmentGates,
  warn: (message, payload) => console.warn(`[TreatmentPlan] ${message}`, payload),
});

const treatmentNormalization = useTreatmentNormalization({
  frequencyOptions,
  routeOptions,
  ensurePharmacy: ensureMedicineDefaultPharmacy,
  isExecDeptSatisfied: (rec) => treatmentGates.hasRequiredExecDept(rec),
});

function normalizeTreatment(rec: Partial<TreatmentRecommendation>): TreatmentRecommendation {
  return treatmentNormalization.normalize(rec);
}

const { applyMedicalItemPartOption, applyMedicalItemPartOptions } = useBodySiteOptions();
const treatmentHydration = useTreatmentHydration({
  pharmacyOptions,
  getCandidatePharmaciesForMedicine,
  findFrequencyOptionByValue: treatmentNormalization.findFrequencyOptionByValue,
  findRouteOptionByValue: treatmentNormalization.findRouteOptionByValue,
  applyMedicalItemPartOptions,
  afterMedicalItemHydrated: syncTreatmentExecDeptSelections,
  logContext: 'TreatmentPlanPage',
  notify: (message) => showToast?.(message, 'info'),
});

const secondarySelector = useSecondarySelector({
  getEditorKey: getTreatmentEditorKey,
  fields: {
    pharmacy: { getCurrentValue: (rec) => getNormalizedPharmacyValue(rec) },
    execDept: { getCurrentValue: (rec) => treatmentGates.getExecDeptDisplay(rec) },
    bodySite: { getCurrentValue: (rec) => treatmentGates.getBodySiteDisplay(rec) },
    insurance: { getCurrentValue: (rec) => rec.insuranceType || '' },
  },
});

const treatmentAttributeSearch = useTreatmentAttributeSearch({
  secondarySelector,
  pharmacyOptions: () => pharmacyOptions.value,
  execDeptOptions: () => execDeptOptions.value,
  getCandidatePharmaciesForMedicine,
  getNormalizedPharmacyValue,
});

const medicineUsageSearch = useMedicineUsageSearch({
  getEditorKey: getTreatmentEditorKey,
  getCurrentValue: (rec, field) => {
    const normalized = normalizeTreatment(rec);
    return field === 'frequency' ? normalized.frequency || '' : normalized.route || '';
  },
  getCurrentKey: (rec, field) => {
    const normalized = normalizeTreatment(rec);
    return field === 'frequency' ? normalized.frequencyKey || '' : normalized.routeKey || '';
  },
  getOptions: (field) => field === 'frequency' ? frequencyOptions.value : routeOptions.value,
});

function getEditableFieldKey(item: TreatmentRecommendation, field: MedicinePrimaryField): string {
  return getTreatmentEditorFieldKey(item, field);
}

const treatmentEditorState = useTreatmentEditorState({
  getEditorKey: getTreatmentEditorKey,
  getFieldKey: (rec, field) => getEditableFieldKey(rec, field as MedicinePrimaryField),
  resetDependents: () => {
    medicineUsageSearch.resetAll();
    secondarySelector.resetAll();
  },
});
const {
  isTreatmentEditorExpanded,
  toggleTreatmentEditor,
  expandTreatmentEditor,
  shouldShowTreatmentEditor,
  registerEditableFieldElement,
  isEditableFieldActive,
  setActiveEditableField,
  clearActiveEditableField,
  focusActiveEditableField,
} = treatmentEditorState;

const medicineFieldEditing = useMedicineFieldEditing({
  normalize: normalizeTreatment,
  syncUsageKeyword: (rec, field) => medicineUsageSearch.syncKeyword(rec, field),
  resolveUsageValue: (rec, field) => medicineUsageSearch.resolveValue(rec, field),
  resolveUsageKey: (rec, field) => medicineUsageSearch.resolveKey(rec, field),
  setActiveField: setActiveEditableField,
  isFieldActive: isEditableFieldActive,
  clearActiveField: clearActiveEditableField,
  focusActiveField: focusActiveEditableField,
  clearInventoryWarning: (rec) => treatmentHydration.clearMedicineInventoryWarning(rec),
  checkInventoryEnough: (rec, showWarning) => treatmentHydration.checkMedicineInventoryEnough(rec, showWarning),
});

const treatmentSelectionReadiness = useTreatmentSelectionReadiness({
  ensureMedicineSelectable: treatmentHydration.ensureMedicineSelectable,
  hydrateMedicalItemDetail: treatmentHydration.hydrateMatchedMedicalItemDetail,
  checkMedicineInventoryEnough: treatmentHydration.checkMedicineInventoryEnough,
  normalize: normalizeTreatment,
  hasRequiredPharmacy: treatmentGates.hasRequiredPharmacy,
  hasRequiredExecDept: treatmentGates.hasRequiredExecDept,
  hasRequiredBodySite: treatmentGates.hasRequiredBodySite,
  openPharmacySelector: openPharmacyQuickSelector,
  openExecDeptSelector: openExecDeptQuickSelector,
  openBodySiteSelector: openBodySiteQuickSelector,
  expandTreatmentEditor,
  notify: (message, type) => showToast?.(message, type === 'error' ? 'error' : 'info'),
});

const recommendations = useTreatmentPlanRecommendations({
  patient: computed(() => props.patient ?? null),
  followUpContext: computed(() => props.followUpContext ?? null),
  diagnosis: currentDiagnosis,
  treatments,
  pharmacies: pharmacyOptions,
  normalizeTreatment,
});

const writeback = useTreatmentPlanWriteback({
  patient: computed(() => props.patient ?? null),
  diagnosis: currentDiagnosis,
  treatments,
  recordContext: recommendations.recordContext,
  execDeptOptions,
  normalizeTreatment,
  findFrequencyOptionByValue: treatmentNormalization.findFrequencyOptionByValue,
  findRouteOptionByValue: treatmentNormalization.findRouteOptionByValue,
  getDefaultPharmacyOption,
  findMatchedPharmacyOption,
  ensureMedicineSelectable: treatmentHydration.ensureMedicineSelectable,
  checkMedicineInventoryEnough: treatmentHydration.checkMedicineInventoryEnough,
  hydrateMedicalItemDetail: treatmentHydration.hydrateMatchedMedicalItemDetail,
  hasRequiredPharmacy: treatmentGates.hasRequiredPharmacy,
  hasRequiredExecDept: treatmentGates.hasRequiredExecDept,
  hasRequiredBodySite: treatmentGates.hasRequiredBodySite,
  onWritebackSuccess: () => emit('close'),
  notify: (message, type) => showToast?.(message, type),
});

const selectedCount = computed(() => recommendations.selectedTreatments.value.length);
const totalCount = computed(() => treatments.value.length);
const canRecommend = computed(() => recommendations.canRecommend.value);
const missingContextTipsText = computed(() => recommendations.missingContextTips.value.join('、'));
const isFollowUpMode = computed(() => Boolean(props.followUpContext?.followUpEligible));
const diagnosisReferenceText = computed(() => recommendations.recordContext.value.diagnosisText);
const planTitle = computed(() => (isFollowUpMode.value ? '后续治疗方案' : '推荐方案'));
const planSubtitle = computed(() => {
  if (isFollowUpMode.value) {
    return '基于左侧本次病历和已出报告生成，勾选后可一键回写到 PHIS。';
  }
  return '勾选需要同步到 PHIS 的处置项目，一键回写会按所选项生成诊断和医嘱清单。';
});
const missingPlanContextText = computed(() => {
  if (isFollowUpMode.value) {
    return '缺少本次病历或已出报告，暂不能生成后续治疗方案。';
  }
  return `缺少${missingContextTipsText.value}，请先在 HIS 中补齐后重新触发。`;
});
const recommendationSections = computed(() => recommendations.sections.value);
const recommendationsLoading = computed(() => recommendations.isLoading.value);
const selectedCountByType = computed(() => {
  const counts = new Map<TreatmentRecommendation['type'], number>();
  treatments.value.forEach((item) => {
    if (item.selected) {
      counts.set(item.type, (counts.get(item.type) || 0) + 1);
    }
  });
  return counts;
});
const bannerText = computed(() => writeback.writebackStatus.writebackBannerText.value);
const bannerTone = computed(() => writeback.writebackStatus.writebackBannerTone.value);
const canSubmit = computed(() => selectedCount.value > 0 && !writeback.writebackStatus.isWritebackBusy.value);
const submitButtonText = computed(() => writeback.writebackStatus.submitButtonText.value);
const manualMatchState = useManualMatchState();
const {
  closeManualMatch,
  getManualMatchKeyword,
  isManualMatchOpen,
  openManualMatch,
  setManualMatchKeyword,
  toggleManualMatch: toggleManualMatchState,
} = manualMatchState;

function syncTreatmentExecDeptSelections(): void {
  syncSharedTreatmentExecDeptSelections(treatments.value, execDeptOptions.value);
}

async function loadDictionaries(): Promise<void> {
  await Promise.all([
    loadFrequencyOptions(),
    loadRouteOptions(),
    loadPharmacyOptions(),
    loadExecDeptOptions(),
  ]);

  const his = getHisAdapter();
  const activeStoreIds = pharmacyOptions.value
    .map((option) => (option.idSto || '').trim())
    .filter((value): value is string => Boolean(value));
  if (!his || activeStoreIds.length === 0) {
    medicalDataService.setActivePharmacyStoreIds(null);
  } else {
    await medicalDataService.ensureMedicineCatalogForStoreIds(activeStoreIds, his);
  }
  syncTreatmentExecDeptSelections();
}

async function refreshRecommendations(): Promise<void> {
  if (!canRecommend.value) {
    showToast?.(`缺少${missingContextTipsText.value}，暂不能生成诊疗方案。`, 'info');
    return;
  }

  try {
    await loadDictionaries();
    await recommendations.refresh();
    await treatmentHydration.hydrateMatchedMedicalItemDetails(treatments.value);
  } catch (error) {
    console.error('[TreatmentPlan] refresh failed', error);
    showToast?.(formatUserFacingError(error, {
      context: '方案推荐失败',
      fallback: '请稍后重试。',
    }), 'error');
  }
}

function requiresManualMatchBeforeSelect(item: TreatmentRecommendation): boolean {
  return !item.matchedItem;
}

function getManualMatchPickerCandidates(item: TreatmentRecommendation): ManualMatchCandidate[] {
  return findManualMatchCandidates(item, getManualMatchKeyword(item))
    .map(toManualMatchCandidateView);
}

function findManualMatchRawCandidate(
  item: TreatmentRecommendation,
  candidate: ManualMatchCandidate,
): ManualMatchRawCandidate | undefined {
  return findManualMatchCandidates(item, getManualMatchKeyword(item))
    .find((raw) => raw.id === candidate.id);
}

function isSecondarySelectorOpen(item: TreatmentRecommendation, field: SecondarySelectorField): boolean {
  return secondarySelector.isOpen(item, field);
}

function openSecondarySelector(item: TreatmentRecommendation, field: SecondarySelectorField): void {
  secondarySelector.open(item, field);
}

function closeSecondarySelector(
  item: TreatmentRecommendation,
  field: SecondarySelectorField,
  event: FocusEvent,
): void {
  secondarySelector.close(item, field, event);
}

function openPharmacyQuickSelector(item: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  expandTreatmentEditor(item);
  openSecondarySelector(item, 'pharmacy');
}

function openExecDeptQuickSelector(item: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  expandTreatmentEditor(item);
  if (item.type !== 'medicine' && item.matchedItem) {
    void treatmentHydration.hydrateMatchedMedicalItemDetail(item);
  }
  openSecondarySelector(item, 'execDept');
}

function openBodySiteQuickSelector(item: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  expandTreatmentEditor(item);
  if (item.type === 'exam' && item.matchedItem) {
    void treatmentHydration.hydrateMatchedMedicalItemDetail(item);
  }
  openSecondarySelector(item, 'bodySite');
}

function openInsuranceQuickSelector(item: TreatmentRecommendation, event?: Event): void {
  event?.stopPropagation();
  expandTreatmentEditor(item);
  openSecondarySelector(item, 'insurance');
}

function getPharmacySearchKeyword(item: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(item, 'pharmacy');
}

function handlePharmacySearchInput(item: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(item, 'pharmacy', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  item.pharmacy = '';
  item.pharmacyCleared = true;
  treatmentHydration.clearMedicineInventoryWarning(item);
  if (treatmentGates.isPharmacyRequired(item)) {
    item.selected = false;
  }
}

function getFilteredPharmacyOptions(item: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getPharmacyOptionsForRecord(item);
}

function selectPharmacyOption(item: TreatmentRecommendation, option: TreatmentPlanAttributeOption): void {
  item.pharmacy = option.text;
  item.pharmacyCleared = false;
  treatmentAttributeSearch.setSearchKeyword(item, 'pharmacy', option.text);
  treatmentHydration.clearMedicineInventoryWarning(item);
  if (item.selected) {
    item.selected = false;
    showToast?.('发药药房已调整，请重新选中该药品。', 'info');
  }
  secondarySelector.closeAll();
}

function clearPharmacySelection(item: TreatmentRecommendation): void {
  item.pharmacy = '';
  item.pharmacyCleared = true;
  treatmentAttributeSearch.setSearchKeyword(item, 'pharmacy', '');
  treatmentHydration.clearMedicineInventoryWarning(item);
  if (item.selected) {
    item.selected = false;
    showToast?.('发药药房已清空，请重新设置后再选中该药品。', 'info');
  }
  secondarySelector.closeAll();
}

function getExecDeptSearchKeyword(item: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(item, 'execDept');
}

function handleExecDeptSearchInput(item: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(item, 'execDept', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  item.execDept = '';
  item.execDeptCleared = true;
  if (treatmentGates.isExecDeptRequired(item)) {
    item.selected = false;
  }
}

function getFilteredExecDeptOptions(item: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getExecDeptOptionsForRecord(item);
}

function selectExecDeptOption(item: TreatmentRecommendation, option: TreatmentPlanAttributeOption): void {
  item.execDept = option.key || option.text;
  item.execDeptCleared = false;
  treatmentAttributeSearch.setSearchKeyword(item, 'execDept', option.text);
  secondarySelector.closeAll();
}

function clearExecDeptSelection(item: TreatmentRecommendation): void {
  item.execDept = '';
  item.execDeptCleared = true;
  treatmentAttributeSearch.setSearchKeyword(item, 'execDept', '');
  if (item.selected && treatmentGates.isExecDeptRequired(item)) {
    item.selected = false;
    showToast?.('执行科室已清空，请重新设置后再选中该项目。', 'info');
  }
  secondarySelector.closeAll();
}

function getBodySiteSearchKeyword(item: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(item, 'bodySite');
}

function handleBodySiteSearchInput(item: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(item, 'bodySite', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  item.bodySite = '';
  item.bodySiteId = '';
  if (item.type === 'exam') {
    item.selected = false;
  }
}

function getFilteredBodySiteOptions(item: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getBodySiteOptionsForRecord(item);
}

function selectBodySiteOption(item: TreatmentRecommendation, option: TreatmentPlanAttributeOption): void {
  const matched = (item.bodySiteOptions || []).find((candidate) => (
    candidate.partId === option.key || candidate.name === option.text
  ));
  if (matched) {
    applyMedicalItemPartOption(item, matched);
  } else {
    item.bodySiteId = option.key;
    item.bodySite = option.text;
  }
  treatmentAttributeSearch.setSearchKeyword(item, 'bodySite', option.text);
  secondarySelector.closeAll();
}

function clearBodySiteSelection(item: TreatmentRecommendation): void {
  item.bodySite = '';
  item.bodySiteId = '';
  treatmentAttributeSearch.setSearchKeyword(item, 'bodySite', '');
  if (item.matchedItem) {
    item.matchedItem = {
      ...item.matchedItem,
      idPart: '',
      raw: {
        ...(getMatchedItemRaw(item) || {}),
        idPart: '',
      },
    };
  }
  if (item.selected && !treatmentGates.hasRequiredBodySite(item)) {
    item.selected = false;
    showToast?.('检查部位已清空，请重新设置后再选中该项目。', 'info');
  }
  secondarySelector.closeAll();
}

function getInsuranceSearchKeyword(item: TreatmentRecommendation): string {
  return treatmentAttributeSearch.getSearchKeyword(item, 'insurance');
}

function handleInsuranceSearchInput(item: TreatmentRecommendation, event: Event): void {
  treatmentAttributeSearch.handleSearchInput(item, 'insurance', event);
  const target = event.target as HTMLInputElement | null;
  if ((target?.value || '').trim()) {
    return;
  }
  item.insuranceType = '';
  item.insuranceCleared = true;
  item.selected = false;
}

function getFilteredInsuranceOptions(item: TreatmentRecommendation): UsageOption[] {
  return treatmentAttributeSearch.getInsuranceOptionsForRecord(item);
}

function selectInsuranceOption(item: TreatmentRecommendation, option: TreatmentPlanAttributeOption): void {
  item.insuranceType = option.text;
  item.insuranceCleared = false;
  treatmentAttributeSearch.setSearchKeyword(item, 'insurance', option.text);
  secondarySelector.closeAll();
}

function clearInsuranceSelection(item: TreatmentRecommendation): void {
  item.insuranceType = '';
  item.insuranceCleared = true;
  treatmentAttributeSearch.setSearchKeyword(item, 'insurance', '');
  if (item.selected) {
    item.selected = false;
    showToast?.('医保限用已清空，请重新设置后再选中该项目。', 'info');
  }
  secondarySelector.closeAll();
}

function activateEditableField(
  item: TreatmentRecommendation,
  field: MedicinePrimaryField,
  event?: Event,
): void {
  medicineFieldEditing.activateField(item, field, event);
}

function handleEditableFieldBlur(
  item: TreatmentRecommendation,
  field: MedicinePrimaryField,
  event: FocusEvent,
): void {
  medicineFieldEditing.handleFieldBlur(item, field, event);
}

function handleTotalQtyInput(item: TreatmentRecommendation, event: Event): void {
  medicineFieldEditing.handleTotalQtyInput(item, event);
}

function handleFrequencyOpenChange(item: TreatmentRecommendation, open: boolean): void {
  medicineFieldEditing.handleUsageOpenChange(item, 'frequency', open);
}

function handleRouteOpenChange(item: TreatmentRecommendation, open: boolean): void {
  medicineFieldEditing.handleUsageOpenChange(item, 'route', open);
}

function handleUsageFieldChange(
  item: TreatmentRecommendation,
  field: Extract<MedicinePrimaryField, 'frequency' | 'route'>,
  value: string,
  key: string,
): void {
  medicineFieldEditing.handleUsageFieldChange(item, field, value, key);
}

function getMedicineFieldDisplay(item: TreatmentRecommendation, field: MedicinePrimaryField): string {
  return getSharedMedicineFieldDisplay(normalizeTreatment(item), field, frequencyOptions.value);
}

function getMedicineInlineSummary(item: TreatmentRecommendation): string {
  return getMedicineCollapsedSummary(normalizeTreatment(item), frequencyOptions.value);
}

function getMedicineInventoryWarning(item: TreatmentRecommendation): string {
  return treatmentHydration.getMedicineInventoryWarning(item);
}

function isMedicineInventoryChecking(item: TreatmentRecommendation): boolean {
  return treatmentHydration.isMedicineInventoryChecking(item);
}

async function ensureMatchedTreatmentSelectable(
  item: TreatmentRecommendation,
  labelName?: string,
): Promise<boolean> {
  return treatmentSelectionReadiness.ensureTreatmentSelectable(item, {
    labelName,
    showMedicineUnavailableWarning: true,
    medicineUnavailableMessage: `${labelName || item.name} 已完成标准库匹配，但当前药房无药品详情，暂不能选中`,
    pharmacyMissingMessage: `${labelName || item.name} 当前发药药房不可用，暂不能选中`,
    execDeptMissingMessage: `${labelName || item.name} 未设置执行科室，暂不能选中`,
    bodySiteMissingMessage: `${labelName || item.name} 未设置检查部位，暂不能选中`,
    hydrateNonMedicine: true,
  });
}

async function confirmSuggestedMatch(item: TreatmentRecommendation): Promise<void> {
  if (!item.suggestedMatchItem) {
    return;
  }

  const originalName = item.originalName || item.name;
  const candidateName = item.suggestedMatchItem.name || item.name;
  const candidate: TreatmentRecommendation = normalizeTreatment({
    ...item,
    originalName,
    matchedItem: { ...item.suggestedMatchItem },
    name: candidateName,
    matchStatus: 'confirmed',
    manualMatched: false,
    selected: false,
    pharmacyCleared: false,
    execDeptCleared: false,
    insuranceCleared: false,
    suggestedMatchItem: undefined,
  });

  if (!(await ensureMatchedTreatmentSelectable(candidate))) {
    Object.assign(item, candidate);
    item.suggestedMatchItem = undefined;
    item.selected = false;
    return;
  }

  Object.assign(item, candidate);
  item.suggestedMatchItem = undefined;
  item.selected = true;
  trackTreatmentMatchPreference(item, 'confirm_match', {
    consultationId: getPatientContextAnchorId(props.patient || null) || '',
    sourceModule: 'treatment_plan',
    scene: 'treatment-plan',
  });
  closeManualMatch();
  showToast?.(`${item.name} 已确认匹配`, 'success');
}

async function applyManualMatch(item: TreatmentRecommendation, candidate: ManualMatchCandidate): Promise<void> {
  const raw = findManualMatchRawCandidate(item, candidate);
  if (!raw) {
    showToast?.('未找到可用的标准库候选，请调整关键字后重试。', 'info');
    return;
  }

  const candidateItem: TreatmentRecommendation = { ...item, selected: false };
  if (!applyManualMatchCandidate(candidateItem, raw)) {
    showToast?.('该标准库候选类型与当前推荐项不匹配。', 'info');
    return;
  }
  candidateItem.pharmacyCleared = false;
  candidateItem.execDeptCleared = false;
  candidateItem.insuranceCleared = false;

  Object.assign(candidateItem, normalizeTreatment(candidateItem));

  if (!(await ensureMatchedTreatmentSelectable(candidateItem, candidate.name))) {
    Object.assign(item, candidateItem);
    item.selected = false;
    closeManualMatch();
    return;
  }

  Object.assign(item, candidateItem);
  item.selected = true;
  trackTreatmentMatchPreference(item, 'manual_match', {
    consultationId: getPatientContextAnchorId(props.patient || null) || '',
    sourceModule: 'treatment_plan',
    scene: 'treatment-plan',
  });
  closeManualMatch();
  showToast?.(`${candidate.name} 已完成标准库匹配`, 'success');
}

async function toggleTreatment(item: TreatmentRecommendation): Promise<void> {
  if (!item.selected && requiresManualMatchBeforeSelect(item)) {
    if (hasProbableMatch(item)) {
      showToast?.('该推荐存在候选标准项，请先确认匹配或改为手动匹配。', 'info');
      return;
    }

    openManualMatch(item);
    showToast?.('该推荐尚未匹配标准库，请先手动匹配。', 'info');
    return;
  }

  if (!item.selected) {
    if (!(await ensureMatchedTreatmentSelectable(item))) {
      return;
    }
  }

  item.selected = !item.selected;
  if (item.selected && item.type === 'medicine') {
    Object.assign(item, normalizeTreatment(item));
  }
  if (!item.selected) {
    treatmentHydration.clearMedicineInventoryWarning(item);
  }
}

function getGroupSelectedCount(type: TreatmentRecommendation['type']): number {
  return selectedCountByType.value.get(type) || 0;
}

onMounted(() => {
  void refreshRecommendations();
});
</script>

<template>
  <div class="treatment-plan-page">
    <PatientHeader :patient="patient ?? null" />

    <main :class="['plan-workspace', { 'has-evidence': hasEvidencePanel }]">
      <aside v-if="hasEvidencePanel" class="evidence-slot">
        <slot name="evidence" />
      </aside>
      <section class="plan-card">
        <header class="plan-card-header">
          <div>
            <h2>{{ planTitle }}</h2>
            <p v-if="canRecommend" class="plan-subtitle">
              {{ planSubtitle }}
            </p>
            <p v-else class="plan-subtitle is-warning">
              {{ missingPlanContextText }}
            </p>
            <div v-if="isFollowUpMode" class="follow-up-context-strip">
              <span>依据：本次病历 + 已出报告</span>
              <span v-if="diagnosisReferenceText">诊断参考：{{ diagnosisReferenceText }}</span>
              <span v-else class="muted">未读取到诊断，不阻断方案生成</span>
            </div>
          </div>
          <button class="icon-action" title="刷新方案" :disabled="recommendationsLoading" @click="refreshRecommendations">
            <Icon icon="lucide:refresh-cw" :size="18" aria-hidden="true" />
          </button>
        </header>

        <div v-if="bannerText" :class="['writeback-banner', `is-${bannerTone}`]">
          {{ bannerText }}
        </div>

        <div class="plan-scroll">
          <TreatmentPlanGroup
            v-for="section in recommendationSections"
            :key="section.key"
            :section="section"
            :selected-count="getGroupSelectedCount(section.itemType)"
            :total-count="section.items.length"
            :is-pharmacy-required="treatmentGates.isPharmacyRequired"
            :get-pharmacy-display="treatmentGates.getPharmacyDisplay"
            :has-required-pharmacy="treatmentGates.hasRequiredPharmacy"
            :is-exec-dept-required="treatmentGates.isExecDeptRequired"
            :get-exec-dept-display="treatmentGates.getExecDeptDisplay"
            :has-required-exec-dept="treatmentGates.hasRequiredExecDept"
            :get-body-site-display="treatmentGates.getBodySiteDisplay"
            :has-required-body-site="treatmentGates.hasRequiredBodySite"
            :frequency-options="frequencyOptions"
            :route-options="routeOptions"
            :should-show-treatment-editor="shouldShowTreatmentEditor"
            :is-treatment-editor-expanded="isTreatmentEditorExpanded"
            :is-editable-field-active="isEditableFieldActive"
            :get-editable-field-key="getEditableFieldKey"
            :get-medicine-field-display="getMedicineFieldDisplay"
            :get-medicine-inline-summary="getMedicineInlineSummary"
            :is-medicine-inventory-checking="isMedicineInventoryChecking"
            :get-medicine-inventory-warning="getMedicineInventoryWarning"
            :is-secondary-selector-open="isSecondarySelectorOpen"
            :get-pharmacy-search-keyword="getPharmacySearchKeyword"
            :get-filtered-pharmacy-options="getFilteredPharmacyOptions"
            :get-exec-dept-search-keyword="getExecDeptSearchKeyword"
            :get-filtered-exec-dept-options="getFilteredExecDeptOptions"
            :get-body-site-search-keyword="getBodySiteSearchKeyword"
            :get-filtered-body-site-options="getFilteredBodySiteOptions"
            :get-insurance-search-keyword="getInsuranceSearchKeyword"
            :get-filtered-insurance-options="getFilteredInsuranceOptions"
            :is-manual-match-open="isManualMatchOpen"
            :get-manual-match-keyword="getManualMatchKeyword"
            :get-manual-match-candidates="getManualMatchPickerCandidates"
            @toggle="toggleTreatment"
            @confirm-match="confirmSuggestedMatch"
            @toggle-treatment-editor="toggleTreatmentEditor"
            @activate-editable-field="activateEditableField"
            @editable-field-blur="handleEditableFieldBlur"
            @register-editable-field-element="registerEditableFieldElement"
            @total-qty-input="handleTotalQtyInput"
            @frequency-open-change="handleFrequencyOpenChange"
            @route-open-change="handleRouteOpenChange"
            @usage-field-change="handleUsageFieldChange"
            @open-pharmacy="openPharmacyQuickSelector"
            @open-exec-dept="openExecDeptQuickSelector"
            @open-body-site="openBodySiteQuickSelector"
            @open-insurance="openInsuranceQuickSelector"
            @close-secondary-selector="closeSecondarySelector"
            @update-pharmacy-keyword="handlePharmacySearchInput"
            @select-pharmacy="selectPharmacyOption"
            @clear-pharmacy="clearPharmacySelection"
            @update-exec-dept-keyword="handleExecDeptSearchInput"
            @select-exec-dept="selectExecDeptOption"
            @clear-exec-dept="clearExecDeptSelection"
            @update-body-site-keyword="handleBodySiteSearchInput"
            @select-body-site="selectBodySiteOption"
            @clear-body-site="clearBodySiteSelection"
            @update-insurance-keyword="handleInsuranceSearchInput"
            @select-insurance="selectInsuranceOption"
            @clear-insurance="clearInsuranceSelection"
            @toggle-manual-match="toggleManualMatchState"
            @update-manual-match-keyword="setManualMatchKeyword"
            @select-manual-match-candidate="applyManualMatch"
          />
        </div>
      </section>
    </main>

    <footer class="plan-footer">
      <div class="selection-summary">
        <span>{{ totalCount }} 项推荐</span>
        <span>{{ selectedCount }} 项已选</span>
      </div>
      <div class="footer-actions">
        <button class="secondary-btn" @click="emit('close')">放弃</button>
        <button
          class="primary-btn"
          :disabled="!canSubmit"
          @click="writeback.submit"
        >
          {{ submitButtonText }}
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.treatment-plan-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #eef3f8;
}

.plan-workspace {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 24px 0 16px;
}

.plan-workspace.has-evidence {
  display: grid;
  grid-template-columns: minmax(320px, 0.78fr) minmax(590px, 1.45fr);
  gap: 16px;
  padding: 16px 20px;
}

.evidence-slot {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.plan-card {
  display: flex;
  flex-direction: column;
  width: min(930px, calc(100% - 64px));
  height: 100%;
  min-height: 0;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.08);
}

.plan-workspace.has-evidence .plan-card {
  width: 100%;
  margin: 0;
}

@media (max-width: 1050px) {
  .plan-workspace.has-evidence {
    grid-template-columns: minmax(290px, 0.72fr) minmax(540px, 1.28fr);
    padding-inline: 14px;
  }
}

.plan-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid #e5e7eb;
}

.plan-card-header h2 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  line-height: 1.4;
}

.plan-card-header h2 span {
  font-weight: 700;
}

.plan-subtitle {
  margin-top: 6px;
  color: #64748b;
  font-size: 14px;
  line-height: 1.5;
}

.plan-subtitle.is-warning {
  color: #c2410c;
}

.follow-up-context-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.follow-up-context-strip span {
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid #dbeafe;
  border-radius: 999px;
  color: #1d4ed8;
  background: #eff6ff;
  font-size: 12px;
  line-height: 1.5;
}

.follow-up-context-strip span.muted {
  color: #64748b;
  border-color: #e2e8f0;
  background: #f8fafc;
}

.icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  color: #2469f2;
  background: #f8fbff;
  cursor: pointer;
}

.icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.writeback-banner {
  margin: 14px 18px 0;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.writeback-banner.is-info {
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.writeback-banner.is-error {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.plan-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 20px;
}

.plan-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 14px 22px;
  border-top: 1px solid #dbe3ee;
  background: rgba(255, 255, 255, 0.95);
}

.selection-summary {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #475569;
  font-size: 14px;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.secondary-btn,
.primary-btn {
  min-width: 84px;
  height: 34px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.secondary-btn {
  border: 1px solid #d1d5db;
  color: #334155;
  background: #fff;
}

.primary-btn {
  border: 1px solid #ea580c;
  color: #fff;
  background: #ea580c;
}

.primary-btn:disabled {
  border-color: #cbd5e1;
  color: #94a3b8;
  background: #f1f5f9;
  cursor: not-allowed;
}
</style>
