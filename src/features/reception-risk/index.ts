export { default as RiskAlertBubble } from './ui/RiskAlertBubble.vue';
export { default as RiskAlertPanel } from './ui/RiskAlertPanel.vue';
export { generateChronicRefillRecord } from './api/chronicRefillRecord';
export type { ChronicRefillRecordGenerationOptions } from './api/chronicRefillRecord';
export {
  assessChronicRefillCandidate,
  getChronicRefillConditionOptions,
  isReportFollowUpIntent,
  scopeChronicRefillCandidate,
} from './lib/chronicRefillAssessment';
export {
  buildChronicRefillHistoryQuery,
  CHRONIC_REFILL_HISTORY_LOOKBACK_DAYS,
  CHRONIC_REFILL_HISTORY_QUERY_LIMIT,
} from './lib/chronicRefillHistoryWindow';
export type {
  ChronicRefillCandidate,
  ChronicRefillConditionOption,
  CurrentEncounterIntentContext,
} from './lib/chronicRefillAssessment';
export { buildChronicRefillInventoryTreatments } from './lib/chronicRefillInventory';
export {
  getChronicRefillNarrativeMedicationNames,
  normalizeChronicRefillConfirmationPlan,
} from './lib/chronicRefillConfirmation';
export type {
  ChronicRefillConfirmationItem,
  ChronicRefillConfirmationOption,
  ChronicRefillConfirmationPlan,
} from './lib/chronicRefillConfirmation';
export type { RiskCategory, RiskItem } from './types';
