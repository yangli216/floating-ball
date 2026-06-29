export {
  buildSymptomClinicalResultInput,
  cloneClinicalResultInput,
} from './clinicalResultAdapter';
export type {
  ClinicalResultRecordInput,
  SymptomClinicalResultInput,
} from './clinicalResultAdapter';
export type {
  ClinicalResultDiagnosis,
  ClinicalResultInput,
  ClinicalResultMatchedDiagnosis,
  ClinicalResultMatchedItem,
  ClinicalResultMatchedTreatment,
  ClinicalResultRecommendationPolicy,
  ClinicalResultTreatment,
} from './clinicalResultContract';

export {
  buildOutpatientRecord,
  detectOutpatientRecordScenario,
  OUTPATIENT_RECORD_SCHEMA_VERSION,
  validateOutpatientRecord,
} from './outpatientRecord';
export type {
  BuildOutpatientRecordInput,
  OutpatientRecord,
  OutpatientRecordQualityIssue,
  OutpatientRecordScenario,
} from './outpatientRecord';

export {
  buildBodySiteUsageOptions,
  buildExecDeptUsageOptions,
  buildInsuranceUsageOptions,
  buildPharmacyUsageOptions,
  filterAttributeOptions,
} from './clinicalResultAttributeOptions';

export {
  buildClinicalResultTreatmentRecommendationsFromRaw,
  mapClinicalResultAiDiagnoses,
  mapClinicalResultAiTreatments,
  mergeClinicalResultAiTreatmentResponses,
} from './clinicalResultAiMapping';
export type {
  BuildClinicalResultTreatmentRecommendationsInput,
  ClinicalResultAiTreatmentParseFailure,
  ClinicalResultDiagnosisCatalogMatch,
  MapClinicalResultAiDiagnosesInput,
  MapClinicalResultAiTreatmentsInput,
  MergeClinicalResultAiTreatmentResponsesInput,
  RawClinicalResultTreatmentRecommendationInput,
} from './clinicalResultAiMapping';

export {
  buildDiagnosisRecommendationFeedbackSubmitPayload,
  buildTreatmentRecommendationFeedbackSubmitPayload,
  getDiagnosisRecommendationFeedbackKey,
  getTreatmentRecommendationFeedbackKey,
  mapTreatmentTypeToRecommendationType,
  mapTreatmentTypeToTargetType,
} from './clinicalResultFeedback';
export type {
  RecommendationFeedbackSubmitPayload,
} from './clinicalResultFeedback';

export {
  cleanLLMJsonEnvelope,
  extractLLMJsonCandidate,
  findBalancedJsonCandidate,
  parseLLMJson,
} from './clinicalResultLlmJsonParser';

export {
  formatDiagnosisConfidence,
  hasClinicalResultTreatmentState,
  initClinicalDiagnoses,
  initClinicalTreatments,
  mapClinicalTreatmentType,
} from './clinicalResultInitialization';
export type {
  InitClinicalDiagnosesOptions,
  InitClinicalTreatmentsOptions,
} from './clinicalResultInitialization';

export {
  buildDiagnosisRationale,
  buildEncounterSummary,
  buildTreatmentReason,
  getTreatmentEvidenceCorpus,
  isConditionalMedicine,
  isHistoricalSelfMedication,
  normalizeAnalysisText,
  shouldAutoSelectTreatment,
  truncateAnalysisText,
} from './clinicalResultNarrative';
export type {
  ClinicalResultRecordSummaryInput,
} from './clinicalResultNarrative';

export {
  filterUsageOptions,
  findUsageOptionByValue,
  formatUsageOptionLabel,
  getMedicineCollapsedSummary,
  getMedicineFieldDisplay,
  getUsageDisplayValue,
  resolveUsageFilterKeyword,
  resolveUsageKeyFromKeyword,
  resolveUsageValueFromKeyword,
} from './clinicalResultUsageFields';
export type {
  MedicinePrimaryField,
} from './clinicalResultUsageFields';

export {
  buildMedicineQuantityExplanation,
  calculateMedicineQuantity,
} from './clinicalResultMedicineQuantity';
export type {
  CalculateMedicineQuantityOptions,
  MedicineQuantityCalculation,
} from './clinicalResultMedicineQuantity';

export {
  buildClinicalResultDiagnosisRequestSpec,
  buildClinicalResultTreatmentRequestSpec,
  buildClinicalResultTreatmentRequestSpecs,
} from './clinicalResultAiRequest';
export type {
  ClinicalResultAiTraceBase,
  ClinicalResultAiTraceOverride,
  ClinicalResultAiRequestSpec,
  ClinicalResultDiagnosisPromptAsset,
  ClinicalResultDiagnosisPromptParams,
  ClinicalResultDiagnosisRequestSpec,
  ClinicalResultPromptAsset,
  ClinicalResultTreatmentPromptAsset,
  ClinicalResultTreatmentPromptAssets,
  ClinicalResultTreatmentPromptParams,
  ClinicalResultTreatmentRequestKind,
  ClinicalResultTreatmentRequestSpec,
  ClinicalResultTreatmentTraceOverrides,
} from './clinicalResultAiRequest';

export {
  buildInventoryBlockedSubmitMessage,
  buildSelectedTreatments,
  buildTreatmentPlanSummary,
} from './consultationSubmitPayload';
export type {
  BuildSelectedTreatmentsInput,
} from './consultationSubmitPayload';

export {
  normalizeExecDeptSelectionValue,
  normalizeRawTreatmentRecommendationFields,
  syncTreatmentExecDeptSelections,
} from './clinicalResultTreatmentFields';

export {
  getTreatmentNumericFieldConstraintText,
  getTreatmentNumericFieldIssue,
  getTreatmentNumericFieldRule,
  isTreatmentNumericFieldInvalid,
  isTreatmentNumericInputAllowed,
} from './clinicalResultNumericFields';
export type {
  TreatmentNumericField,
} from './clinicalResultNumericFields';

export {
  applyManualMatchCandidate,
  findManualMatchCandidates,
  getManualMatchKey,
  getManualMatchSearchKey,
  isMedicineManualMatchCandidate,
  toManualMatchCandidateView,
} from './manualMatch';
export type {
  ManualMatchCandidateView,
  ManualMatchRawCandidate,
} from './manualMatch';

export {
  assessTreatmentCatalogMatch,
  buildDiagnosisFeedbackSnapshot,
  buildMedicalItemMatchedItem,
  buildMedicineMatchedItem,
  buildTreatmentFeedbackSnapshot,
  getClinicalDiagnosisIdentity,
  getReasonTooltipKey,
  getSuggestedMatchName,
  getTreatmentEditorFieldKey,
  getTreatmentEditorKey,
  getTreatmentMatchLabel,
  getTreatmentOriginalName,
  getTreatmentSpec,
  hasProbableMatch,
} from './recommendationHelpers';
export type {
  TreatmentMatchLabelStyle,
} from './recommendationHelpers';

export {
  alignMedicineRecommendationsToInventory,
  formatAvailableMedicineInventoryPrompt,
  loadAvailableMedicineInventoryContext,
  mergeAvailableMedicineInventoryCatalog,
} from './api/availableMedicineInventory';
export type {
  AvailableMedicineInventoryCatalogItem,
  AvailableMedicineInventoryContext,
  LoadAvailableMedicineInventoryOptions,
  MedicineRecommendationLike,
} from './api/availableMedicineInventory';

export {
  buildDiagList,
  buildOrderListItem,
  buildRecordConfirmedPayload,
  getDefaultOrderServiceCode,
  getDiagnosisKey,
  getMatchedItemRaw,
  getMatchedMedicalItemClientId,
  getMatchedOrderServiceId,
  getOrderFgCheckOrd,
  getOrderFgSkintest,
  getOrderJsonField,
  getOrderPartId,
  getOrderServiceCode,
  getOrderServiceName,
  getStandardDiagnosisId,
  getStandardDiagnosisKey,
  getTreatmentRemarkLength,
  isFrontendDiagnosisId,
  isTreatmentRemarkOverLimit,
  readFirstString,
  TREATMENT_REMARK_MAX_LENGTH,
  toPositiveNumber,
} from './recordConfirmedPayload';
export type {
  BuildDiagListInput,
  BuildRecordConfirmedPayloadInput,
  OrderItemResolvers,
  RecordConfirmedResultType,
} from './recordConfirmedPayload';

export {
  getFirstTreatmentRequiredFieldMessage,
  validateTreatmentRequiredFields,
} from './treatmentRequiredFields';
export type {
  TreatmentRequiredFieldIssue,
  TreatmentRequiredFieldResolverOptions,
  TreatmentRequiredFieldValidationResult,
} from './treatmentRequiredFields';
