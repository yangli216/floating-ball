import type { Ref } from 'vue';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import type { ReportFollowUpAssessment } from '@/types/reportInterpretation';
import type { AppPatient } from '@/types/appState';
import { getPatientContextAnchorId } from '@/utils/patientContext';
import { hasPatientReportedLabOrExamResults } from '../lib/reportedApplyResults';
import type { ReceptionSessionController } from './useReceptionSessionController';
import type {
  OutpatientVoiceEntryDecision,
  ReceptionOpportunity,
} from '../types';

interface ResolveVoiceEntryOptions {
  hasCachedResult: boolean;
  fetchFollowUpContext: () => Promise<HisOutpatientFollowUpContext | null>;
}

export async function resolveOutpatientVoiceEntry(
  options: ResolveVoiceEntryOptions,
): Promise<OutpatientVoiceEntryDecision> {
  if (options.hasCachedResult) {
    return { type: 'restore-voice-result' };
  }

  const context = await options.fetchFollowUpContext();
  if (context?.followUpEligible) {
    return { type: 'report-follow-up', context };
  }

  return { type: 'voice-capture' };
}

export interface OutpatientScenarioRouterOptions {
  currentPatient: Ref<AppPatient | null>;
  session: ReceptionSessionController;
  hasCachedVoiceResult: (patient?: AppPatient | null) => boolean;
  fetchFollowUpContext?: (patient: AppPatient | null) => Promise<HisOutpatientFollowUpContext | null>;
  applyFollowUpContext: (context: HisOutpatientFollowUpContext) => void;
  openChronicRefillConfirmation: () => Promise<void>;
  resetVoiceSessionState: () => void;
  openOutpatientFollowUp: () => Promise<void>;
  openReportInterpretation: () => Promise<void>;
  startVoiceInteraction: (options?: { skipCacheRestore?: boolean }) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  trackError: (name: string, error: unknown) => void;
}

export function useOutpatientScenarioRouter(options: OutpatientScenarioRouterOptions) {
  const {
    currentPatient,
    session,
    hasCachedVoiceResult,
    fetchFollowUpContext,
    applyFollowUpContext,
    openChronicRefillConfirmation,
    resetVoiceSessionState,
    openOutpatientFollowUp,
    openReportInterpretation,
    startVoiceInteraction,
    showToast,
    trackError,
  } = options;

  function isCurrentOpportunity(
    opportunity: ReceptionOpportunity,
    patientAnchorId: string,
  ): boolean {
    return getPatientContextAnchorId(currentPatient.value) === patientAnchorId
      && session.getOpportunity(opportunity.type) === opportunity;
  }

  async function confirmChronicRefill(): Promise<void> {
    const patient = currentPatient.value;
    const opportunity = session.getOpportunity('chronic-refill');
    if (
      !patient
      || opportunity?.type !== 'chronic-refill'
      || session.executingOpportunity.value
    ) {
      return;
    }

    const patientAnchorId = getPatientContextAnchorId(patient);
    session.setExecutingOpportunity('chronic-refill');
    try {
      await openChronicRefillConfirmation();
      if (!isCurrentOpportunity(opportunity, patientAnchorId)) {
        return;
      }
    } catch (error) {
      if (!isCurrentOpportunity(opportunity, patientAnchorId)) {
        return;
      }
      trackError('open_chronic_refill_confirmation_failed', error);
      showToast('进入复诊配药确认失败，请稍后重试', 'error');
    } finally {
      if (
        isCurrentOpportunity(opportunity, patientAnchorId)
        && session.executingOpportunity.value === 'chronic-refill'
      ) {
        session.setExecutingOpportunity(null);
      }
    }
  }

  async function confirmFollowUp(assessment?: ReportFollowUpAssessment): Promise<void> {
    const patient = currentPatient.value;
    const opportunity = session.getOpportunity('report-follow-up');
    if (
      !patient
      || opportunity?.type !== 'report-follow-up'
      || session.executingOpportunity.value
    ) {
      return;
    }

    const patientAnchorId = getPatientContextAnchorId(patient);
    session.setExecutingOpportunity('report-follow-up');
    try {
      const context = assessment
        ? { ...opportunity.context, assessment }
        : opportunity.context;
      session.replaceOpportunity('report-follow-up', { type: 'report-follow-up', context });
      applyFollowUpContext(context);
      resetVoiceSessionState();
      await openOutpatientFollowUp();
    } catch (error) {
      trackError('confirm_follow_up_failed', error);
      showToast('进入回诊失败，请稍后重试', 'error');
    } finally {
      if (
        getPatientContextAnchorId(currentPatient.value) === patientAnchorId
        && session.executingOpportunity.value === 'report-follow-up'
      ) {
        session.setExecutingOpportunity(null);
      }
    }
  }

  async function confirmReportAssistant(): Promise<void> {
    const patient = currentPatient.value;
    const reportOpportunity = session.getOpportunity('report-interpretation');
    const followUpOpportunity = session.getOpportunity('report-follow-up');
    if (
      !patient
      || (!reportOpportunity && !followUpOpportunity)
      || session.executingOpportunity.value
    ) {
      return;
    }

    const patientAnchorId = getPatientContextAnchorId(patient);
    session.setExecutingOpportunity('report-interpretation');
    try {
      await openReportInterpretation();
    } catch (error) {
      if (getPatientContextAnchorId(currentPatient.value) !== patientAnchorId) return;
      trackError('confirm_report_assistant_failed', error);
      showToast('进入报告助手失败，请稍后重试', 'error');
    } finally {
      if (
        getPatientContextAnchorId(currentPatient.value) === patientAnchorId
        && session.executingOpportunity.value === 'report-interpretation'
      ) {
        session.setExecutingOpportunity(null);
      }
    }
  }

  async function openVoiceEntry(): Promise<OutpatientVoiceEntryDecision> {
    const patient = currentPatient.value;
    const patientAnchorId = getPatientContextAnchorId(patient);
    const hasCache = hasCachedVoiceResult(patient);

    if (hasCache) {
      await startVoiceInteraction({ skipCacheRestore: false });
      return { type: 'restore-voice-result' };
    }

    const opportunity = session.getOpportunity('report-follow-up');
    if (opportunity?.type === 'report-follow-up') {
      await openReportInterpretation();
      return { type: 'report-follow-up', context: opportunity.context };
    }

    if (fetchFollowUpContext && patient && hasPatientReportedLabOrExamResults(patient)) {
      const context = await fetchFollowUpContext(patient);
      if (
        context?.followUpEligible
        && getPatientContextAnchorId(currentPatient.value) === patientAnchorId
      ) {
        session.replaceOpportunity('report-follow-up', { type: 'report-follow-up', context });
        await openReportInterpretation();
        return { type: 'report-follow-up', context };
      }
    }

    if (getPatientContextAnchorId(currentPatient.value) !== patientAnchorId) {
      return { type: 'voice-capture' };
    }

    await startVoiceInteraction({
      skipCacheRestore: true,
    });
    return { type: 'voice-capture' };
  }

  return {
    confirmChronicRefill,
    confirmFollowUp,
    confirmReportAssistant,
    openVoiceEntry,
  };
}

export type OutpatientScenarioRouter = ReturnType<typeof useOutpatientScenarioRouter>;
