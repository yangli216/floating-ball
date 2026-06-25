export { default as ReceptionCapsule } from './ui/ReceptionCapsule.vue';
export {
  applyReceptionClinicalHistorySummaries,
  buildReceptionPatientDraft,
  resolveIncomingPatientTracking,
} from './lib/receptionPatientSummary';
export {
  useReceptionSessionController,
  type ReceptionSessionController,
  type ReceptionSessionStatus,
} from './model/useReceptionSessionController';
export {
  resolveOutpatientVoiceEntry,
  useOutpatientScenarioRouter,
  type OutpatientScenarioRouter,
  type OutpatientScenarioRouterOptions,
} from './model/useOutpatientScenarioRouter';
export type {
  OutpatientVoiceEntryDecision,
  ReceptionOpportunity,
  ReceptionOpportunityType,
} from './types';
