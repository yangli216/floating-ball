import { computed, ref, shallowReadonly, type Ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import {
  getPatientContextAgeText,
  getPatientContextGenderCode,
  getPatientContextGenderText,
  getPatientContextName,
} from '@/utils/patientContext';
import type { RiskItem } from '@features/reception-risk';
import type { PatientMemoryBrief } from '@entities/patient-memory';
import type {
  ReceptionOpportunity,
  ReceptionOpportunityType,
} from '../types';

export type ReceptionSessionStatus =
  | 'idle'
  | 'hydrating'
  | 'assessing'
  | 'ready'
  | 'error';

export type ReceptionPatientMemoryStatus = 'idle' | 'syncing' | 'ready' | 'error';

export function useReceptionSessionController(currentPatient: Ref<AppPatient | null>) {
  const status = ref<ReceptionSessionStatus>('idle');
  const risks = ref<RiskItem[]>([]);
  const opportunities = ref<ReceptionOpportunity[]>([]);
  const executingOpportunity = ref<ReceptionOpportunityType | null>(null);
  const patientMemoryStatus = ref<ReceptionPatientMemoryStatus>('idle');
  const patientMemoryBrief = ref<PatientMemoryBrief | null>(null);

  const patientName = computed(() => getPatientContextName(currentPatient.value) || '未知患者');
  const patientGender = computed<'M' | 'F'>(() => {
    const genderCode = getPatientContextGenderCode(currentPatient.value);
    const genderText = getPatientContextGenderText(currentPatient.value);
    return genderCode === 'F' || genderText.includes('女') ? 'F' : 'M';
  });
  const patientAgeText = computed(() => getPatientContextAgeText(currentPatient.value));
  const isAnalyzing = computed(() => status.value === 'hydrating' || status.value === 'assessing');
  const chronicRefillCandidate = computed(() => {
    const opportunity = opportunities.value.find((item) => item.type === 'chronic-refill');
    return opportunity?.type === 'chronic-refill' ? opportunity.candidate : null;
  });
  const outpatientFollowUpContext = computed(() => {
    const opportunity = opportunities.value.find((item) => item.type === 'report-follow-up');
    return opportunity?.type === 'report-follow-up' ? opportunity.context : null;
  });
  const reportInterpretationVisits = computed(() => {
    const opportunity = opportunities.value.find((item) => item.type === 'report-interpretation');
    return opportunity?.type === 'report-interpretation' ? opportunity.visits : [];
  });
  const chronicRefillGenerating = computed(() => executingOpportunity.value === 'chronic-refill');
  const reportAssistantOpening = computed(() => executingOpportunity.value === 'report-interpretation');

  function clearAssessment(): void {
    risks.value = [];
    opportunities.value = [];
    executingOpportunity.value = null;
  }

  function startHydrating(): void {
    clearAssessment();
    patientMemoryStatus.value = 'idle';
    patientMemoryBrief.value = null;
    status.value = 'hydrating';
  }

  function startAssessing(): void {
    risks.value = [];
    opportunities.value = [];
    status.value = 'assessing';
  }

  function setRisks(nextRisks: RiskItem[]): void {
    risks.value = [...nextRisks];
  }

  function startPatientMemorySync(): void {
    patientMemoryStatus.value = 'syncing';
    patientMemoryBrief.value = null;
  }

  function setPatientMemoryBrief(nextBrief: PatientMemoryBrief | null): void {
    patientMemoryBrief.value = nextBrief;
    patientMemoryStatus.value = nextBrief ? 'ready' : 'idle';
  }

  function failPatientMemorySync(): void {
    patientMemoryBrief.value = null;
    patientMemoryStatus.value = 'error';
  }

  function finishAssessment(): void {
    if (status.value === 'assessing') {
      status.value = 'ready';
    }
  }

  function fail(): void {
    executingOpportunity.value = null;
    status.value = 'error';
  }

  function replaceOpportunity(
    type: ReceptionOpportunityType,
    opportunity: ReceptionOpportunity | null,
  ): void {
    opportunities.value = [
      ...opportunities.value.filter((item) => item.type !== type),
      ...(opportunity ? [opportunity] : []),
    ];
  }

  function getOpportunity(type: ReceptionOpportunityType): ReceptionOpportunity | null {
    return opportunities.value.find((item) => item.type === type) || null;
  }

  function setExecutingOpportunity(type: ReceptionOpportunityType | null): void {
    executingOpportunity.value = type;
  }

  function reset(): void {
    clearAssessment();
    patientMemoryStatus.value = 'idle';
    patientMemoryBrief.value = null;
    status.value = 'idle';
  }

  return {
    status: shallowReadonly(status),
    risks: shallowReadonly(risks),
    opportunities: shallowReadonly(opportunities),
    executingOpportunity: shallowReadonly(executingOpportunity),
    patientMemoryStatus: shallowReadonly(patientMemoryStatus),
    patientMemoryBrief: shallowReadonly(patientMemoryBrief),
    chronicRefillCandidate: shallowReadonly(chronicRefillCandidate),
    outpatientFollowUpContext: shallowReadonly(outpatientFollowUpContext),
    reportInterpretationVisits: shallowReadonly(reportInterpretationVisits),
    chronicRefillGenerating: shallowReadonly(chronicRefillGenerating),
    reportAssistantOpening: shallowReadonly(reportAssistantOpening),
    patientName,
    patientGender,
    patientAgeText,
    isAnalyzing,
    startHydrating,
    startAssessing,
    setRisks,
    startPatientMemorySync,
    setPatientMemoryBrief,
    failPatientMemorySync,
    finishAssessment,
    fail,
    replaceOpportunity,
    getOpportunity,
    setExecutingOpportunity,
    reset,
  };
}

export type ReceptionSessionController = ReturnType<typeof useReceptionSessionController>;
