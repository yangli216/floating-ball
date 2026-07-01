export { default as RiskAlertBubble } from './ui/RiskAlertBubble.vue';
export { default as RiskAlertPanel } from './ui/RiskAlertPanel.vue';
export { default as ChronicRefillConfirmationPage } from './ui/ChronicRefillConfirmationPage.vue';
export { generateChronicRefillRecord } from './api/chronicRefillRecord';
export { generateChronicRefillConfirmationPlan } from './api/chronicRefillConfirmation';
export {
  assessChronicRefillCandidate,
  isReportFollowUpIntent,
} from './lib/chronicRefillAssessment';
export type {
  ChronicRefillCandidate,
  CurrentEncounterIntentContext,
} from './lib/chronicRefillAssessment';
export { buildChronicRefillInventoryTreatments } from './lib/chronicRefillInventory';
export {
  buildConfirmedAnswers,
  buildConfirmedChronicRefillNarrative,
  getChronicRefillNarrativeMedicationNames,
  normalizeChronicRefillSupplementRecordText,
  normalizeChronicRefillConfirmationPlan,
} from './lib/chronicRefillConfirmation';
export type {
  ChronicRefillConfirmationContext,
  ChronicRefillConfirmationItem,
  ChronicRefillConfirmationOption,
  ChronicRefillConfirmationPlan,
  ChronicRefillConfirmedAnswer,
} from './lib/chronicRefillConfirmation';
export type { RiskCategory, RiskItem } from './types';
