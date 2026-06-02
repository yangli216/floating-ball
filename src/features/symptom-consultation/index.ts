export { default as BodyPartSelector } from './ui/BodyPartSelector.vue';
export { default as SymptomResultEntry } from './ui/SymptomResultEntry.vue';
export { default as SystemCategorySelector } from './ui/SystemCategorySelector.vue';

export {
  buildCurrentMedicalPayload,
  buildCurrentSummary,
  buildCurrentDiagnosisList,
  buildSmartUserLogSnapshot,
  type BuildCurrentMedicalPayloadOptions,
  type BuildCurrentDiagnosisListInput,
  type BuildCurrentMedicalPayloadInput,
  type BuildSmartUserLogSnapshotInput,
  type IncludedTreatmentType,
} from './lib/consultationPayloadBuilders';
export {
  filterVisitSummaryText,
  readPatientText,
  resolvePastMedicalHistoryFromSources,
  type PatientTextSource,
} from './lib/consultationPatientText';
export {
  filterSymptoms,
  type FilterSymptomsInput,
  type SymptomFilterItem,
} from './lib/symptomFiltering';
export {
  applyCheckboxFieldChange,
  buildInitialSymptomFormData,
  getSymptomFieldKey,
  type ApplyCheckboxFieldChangeInput,
  type SymptomFormConfigLike,
  type SymptomFormData,
  type SymptomFormFieldLike,
  type SymptomFormSectionLike,
  type SymptomFormValue,
} from './lib/symptomFormData';
export {
  buildConsultationRenderPlan,
  type BuildConsultationRenderPlanInput,
  type ConsultationRenderConfigLike,
  type ConsultationRenderMode,
  type ConsultationRenderPlan,
} from './lib/consultationRenderPlan';
export {
  generalConditionConfig,
  tcmInquiryConfig,
} from './lib/consultationFormConfigs';
export {
  buildDiagnosisPrefill,
  buildGeneratedRecordPrefillPatch,
  type BuildDiagnosisPrefillInput,
  type BuildGeneratedRecordPrefillPatchInput,
  type DiagnosisPrefillResult,
  type GeneratedRecordDraft,
  type GeneratedRecordPrefillPatch,
  type MatchedDiagnosisLike,
} from './lib/consultationPrefill';
export {
  buildConsultationGeneratedRecord,
  type BuildConsultationGeneratedRecordInput,
  type ConsultationGeneratedRecordDraft,
  type ConsultationGeneratedRecordMode,
  type ConsultationGeneratedRecordSymptom,
  type ConsultationGeneratedRecordTarget,
} from './lib/consultationGeneratedRecord';
export {
  buildConsultationFormValidationResult,
  type BuildConsultationValidationInput,
  type ConsultationValidationField,
  type ConsultationValidationResult,
  type ConsultationValidationSection,
  type ConsultationValidationSymptom,
} from './lib/consultationFormValidation';
export {
  buildConsultationAssistBannerStyle,
  buildConsultationAssistBannerText,
  getConsultationAssistBannerTone,
  getConsultationAssistFeatureCode,
  getConsultationAssistLabel,
  type BuildConsultationAssistBannerTextInput,
  type ConsultationAssistBannerFeedback,
  type ConsultationAssistBannerStyle,
  type ConsultationAssistBannerTone,
} from './lib/consultationAssistPresentation';
export {
  buildMedicineInlineSummary,
  buildVisibleTreatmentRecommendations,
  filterOtherTreatmentRecommendations,
  getDiagnosisRateClass,
  getTreatmentTagLabel,
  shouldShowDiagnosisCard,
  shouldShowTreatmentCard,
  type BuildMedicineInlineSummaryInput,
  type BuildVisibleTreatmentRecommendationsInput,
  type ConsultationRecordView,
} from './lib/consultationRecommendationPresentation';
export {
  getDiagnosisIdentity,
  isCurrentDiagnosisContext,
  isStaleRecommendationContext,
  type DiagnosisIdentitySource,
  type StaleRecommendationContextInput,
} from './lib/consultationDiagnosisContext';
export {
  buildDiagnosisSwap,
  resolveRelatedDiagnosisCandidates,
  type BuildDiagnosisSwapInput,
  type DiagnosisSwapItem,
  type DiagnosisSwapResult,
  type RelatedDiagnosisCandidate,
  type ResolveRelatedDiagnosisCandidatesInput,
} from './lib/consultationDiagnosisSwap';
export {
  buildDiagnosisRecommendationsFromRaw,
  type BuildDiagnosisRecommendationsInput,
  type DiagnosisCatalogMatch,
  type TcmSyndromeCatalogMatch,
  type TcmTreatmentCatalogMatch,
} from './lib/consultationDiagnosisMapping';
export {
  buildDiagnosisDisplayGroups,
  buildDiagnosisGroupKey,
  type BuildDiagnosisDisplayGroupsInput,
  type DiagnosisCategoryInfo,
  type DiagnosisDisplayGroup,
} from './lib/consultationDiagnosisGrouping';
export {
  cleanLLMJsonEnvelope,
  extractLLMJsonCandidate,
  findBalancedJsonCandidate,
  parseLLMJson,
} from './lib/consultationLlmJsonParser';
export {
  buildMedicalAdvice,
  type BuildMedicalAdviceInput,
  type ConsultationMedicalAdviceMode,
} from './lib/consultationMedicalAdvice';
export {
  buildGeneralConditionHistoryText,
  type GeneralConditionData,
  type GeneralConditionValue,
} from './lib/consultationGeneralCondition';
export {
  buildTcmSignsPromptText,
  buildTcmSignsReportText,
  type TcmSignsConfigLike,
  type TcmSignsFieldLike,
  type TcmSignsFormData,
  type TcmSignsFormValue,
  type TcmSignsSectionLike,
} from './lib/consultationTcmSigns';
export {
  buildFinalRecord,
  buildSelectedTreatmentSnapshots,
  buildTreatmentPrinciple,
  type BuildFinalRecordInput,
  type ConsultationFinalRecordMode,
  type FinalRecordTreatmentSnapshot,
  type GeneratedRecordSnapshot,
} from './lib/consultationFinalRecord';
export {
  registerDiagnosisRecommendationFeedbackTargets,
  registerTreatmentRecommendationFeedbackTargets,
  type RegisterDiagnosisRecommendationFeedbackInput,
  type RegisterRecommendationTargetInput,
  type RegisterTreatmentRecommendationFeedbackInput,
  type SaveTreatmentRecommendationFeedbackInput,
} from './model/recommendationFeedbackRegistration';
export {
  deduplicateFactCheckIssues,
  runDiagnosisFactCheck,
  runTreatmentFactCheck,
  type DiagnosisFactCheckRecordText,
  type FactCheckIssueLike,
  type FactCheckResultLike,
  type RunDiagnosisFactCheckInput,
  type RunTreatmentFactCheckInput,
} from './model/consultationFactCheck';
export {
  trackConsultationCompletion,
  type ConsultationCompletionMode,
  type TrackCompletionFormSubmitInput,
  type TrackConsultationCompletionInput,
  type TrackRecommendationActionInput,
} from './model/consultationCompletionTracking';
export {
  DEFAULT_SYMPTOM_SYSTEM_CATEGORIES,
  useSymptomCategoryFilter,
  type SymptomCategoryFilter,
  type SymptomCategoryOption,
} from './model/useSymptomCategoryFilter';
export {
  useCompanionSymptoms,
  type CompanionSymptomLike,
  type CompanionSymptomsState,
  type UseCompanionSymptomsInput,
} from './model/useCompanionSymptoms';
export {
  useSymptomSelectionController,
  type SelectableSymptom,
  type SymptomSelectionController,
  type SymptomSelectionTrackPayload,
  type UseSymptomSelectionControllerInput,
} from './model/useSymptomSelectionController';
export {
  useSymptomCollectionController,
  type SymptomCollectionController,
  type SymptomCollectionItem,
  type UseSymptomCollectionControllerInput,
} from './model/useSymptomCollectionController';
export {
  useConsultationAssistController,
  type ConsultationAssistController,
  type ConsultationAssistTrackPayload,
  type UseConsultationAssistControllerInput,
} from './model/useConsultationAssistController';
export {
  areAllReferenceItemsSuccessful,
  buildPendingReferenceStatusEntry,
  buildReferenceKey,
  buildReferenceRequestPayload,
  buildReferenceStatusEntryFromFeedback,
  getDiagnosisReferenceButtonLabel,
  getReferenceStatusFromMap,
  getReferenceStatusLabel,
  isPendingReferenceItem,
  isDiagnosisReferenceDisabled,
  mapTreatmentTypeToReferenceAction,
  normalizeReferenceFeedbackPayload,
  resolveReferenceFeedbackItems,
  resolveReferenceItemAction,
  setReferenceStatusesInMap,
  type ReferenceAction,
  type ReferenceFeedbackPayload,
  type ReferenceItemPayload,
  type ReferenceItemType,
  type ReferenceLifecycleStatus,
  type ReferenceStatusEntry,
  type ReferenceStatusMap,
} from './lib/consultationReference';
