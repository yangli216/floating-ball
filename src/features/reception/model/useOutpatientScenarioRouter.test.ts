import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import { buildPatientContext } from '@/utils/patientContext';
import {
  resolveOutpatientVoiceEntry,
  useOutpatientScenarioRouter,
} from './useOutpatientScenarioRouter';
import { useReceptionSessionController } from './useReceptionSessionController';

const followUpContext = {
  followUpEligible: true,
  source: { visitId: 'visit-0' },
  medicalRecordText: '既往门诊病历。',
  labReports: [],
  examReports: [{ examName: '胸部CT', conclusion: '未见明显异常。' }],
  ineligibleReason: null,
} as HisOutpatientFollowUpContext;

describe('resolveOutpatientVoiceEntry', () => {
  it('prioritizes cached voice results without querying follow-up context', async () => {
    const fetchFollowUpContext = vi.fn();

    await expect(resolveOutpatientVoiceEntry({
      hasCachedResult: true,
      fetchFollowUpContext,
    })).resolves.toEqual({ type: 'restore-voice-result' });
    expect(fetchFollowUpContext).not.toHaveBeenCalled();
  });

  it('routes eligible report follow-up and falls back to voice capture', async () => {
    await expect(resolveOutpatientVoiceEntry({
      hasCachedResult: false,
      fetchFollowUpContext: async () => followUpContext,
    })).resolves.toEqual({ type: 'report-follow-up', context: followUpContext });

    await expect(resolveOutpatientVoiceEntry({
      hasCachedResult: false,
      fetchFollowUpContext: async () => null,
    })).resolves.toEqual({ type: 'voice-capture' });
  });
});

describe('useOutpatientScenarioRouter', () => {
  it('allows entering report follow-up without AI interpretation and preserves one when available', async () => {
    const currentPatient = ref(buildPatientContext({
      payload: { patientId: 'patient-1', visitId: 'visit-1', name: '张建国' },
    }));
    const session = useReceptionSessionController(currentPatient);
    session.replaceOpportunity('report-follow-up', { type: 'report-follow-up', context: followUpContext });
    const applyFollowUpContext = vi.fn();
    const openOutpatientFollowUp = vi.fn();
    const showToast = vi.fn();
    const router = useOutpatientScenarioRouter({
      currentPatient,
      session,
      hasCachedVoiceResult: () => false,
      applyFollowUpContext,
      openChronicRefillConfirmation: vi.fn(),
      resetVoiceSessionState: vi.fn(),
      openOutpatientFollowUp,
      openReportInterpretation: vi.fn(),
      startVoiceInteraction: vi.fn(),
      showToast,
      trackError: vi.fn(),
    });

    await router.confirmFollowUp();
    expect(applyFollowUpContext).toHaveBeenCalledWith(followUpContext);
    expect(openOutpatientFollowUp).toHaveBeenCalledOnce();

    const assessment = { actionability: 'needs_follow_up' as const, summary: '建议复查', problems: [], medicationIntents: [] };
    await router.confirmFollowUp(assessment);

    expect(applyFollowUpContext).toHaveBeenCalledWith(expect.objectContaining({ assessment }));
    expect(openOutpatientFollowUp).toHaveBeenCalledTimes(2);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('opens the refill confirmation page before generating a record', async () => {
    const currentPatient = ref(buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-1',
        name: '张建国',
      },
    }));
    const session = useReceptionSessionController(currentPatient);
    session.replaceOpportunity('chronic-refill', {
      type: 'chronic-refill',
      candidate: {
        diagnosis: '高血压',
        diagnoses: ['高血压'],
        diagnosisGroups: ['高血压'],
        medications: ['苯磺酸氨氯地平片'],
        chronicVisitCount: 1,
        chronicVisits: [],
        diagnosisEvidenceText: '近期历史就诊记录有“高血压”诊断',
        medicationEvidenceText: '历史用药记录：苯磺酸氨氯地平片',
        evidenceText: '最近3次就诊中存在高血压慢病就诊和配药',
      },
    });

    const openChronicRefillConfirmation = vi.fn();
    const showToast = vi.fn();
    const router = useOutpatientScenarioRouter({
      currentPatient,
      session,
      hasCachedVoiceResult: () => false,
      fetchFollowUpContext: async () => null,
      applyFollowUpContext: vi.fn(),
      openChronicRefillConfirmation,
      resetVoiceSessionState: vi.fn(),
      openOutpatientFollowUp: vi.fn(),
      openReportInterpretation: vi.fn(),
      startVoiceInteraction: vi.fn(),
      showToast,
      trackError: vi.fn(),
    });

    await router.confirmChronicRefill();

    expect(openChronicRefillConfirmation).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
    expect(session.executingOpportunity.value).toBeNull();
  });

  it('routes voice entry to report follow-up when HIS context is available', async () => {
    const currentPatient = ref(buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-1',
        name: '张建国',
      },
    }));
    currentPatient.value!.hasReportedLabOrExamResults = true;
    const session = useReceptionSessionController(currentPatient);
    const applyFollowUpContext = vi.fn();
    const openOutpatientFollowUp = vi.fn();
    const openReportInterpretation = vi.fn();
    const startVoiceInteraction = vi.fn();
    const router = useOutpatientScenarioRouter({
      currentPatient,
      session,
      hasCachedVoiceResult: () => false,
      fetchFollowUpContext: async () => followUpContext,
      applyFollowUpContext,
      openChronicRefillConfirmation: vi.fn(),
      resetVoiceSessionState: vi.fn(),
      openOutpatientFollowUp,
      openReportInterpretation,
      startVoiceInteraction,
      showToast: vi.fn(),
      trackError: vi.fn(),
    });

    await expect(router.openVoiceEntry()).resolves.toEqual({
      type: 'report-follow-up',
      context: followUpContext,
    });

    expect(applyFollowUpContext).not.toHaveBeenCalled();
    expect(openOutpatientFollowUp).not.toHaveBeenCalled();
    expect(openReportInterpretation).toHaveBeenCalledOnce();
    expect(startVoiceInteraction).not.toHaveBeenCalled();
    expect(session.getOpportunity('report-follow-up')).toEqual({
      type: 'report-follow-up',
      context: followUpContext,
    });
  });

  it('starts normal voice entry without querying follow-up context when no report is finished', async () => {
    const currentPatient = ref(buildPatientContext({
      payload: {
        patientId: 'patient-1',
        visitId: 'visit-1',
        name: '张建国',
      },
    }));
    const session = useReceptionSessionController(currentPatient);
    const fetchFollowUpContext = vi.fn(async () => followUpContext);
    const startVoiceInteraction = vi.fn();
    const router = useOutpatientScenarioRouter({
      currentPatient,
      session,
      hasCachedVoiceResult: () => false,
      fetchFollowUpContext,
      applyFollowUpContext: vi.fn(),
      openChronicRefillConfirmation: vi.fn(),
      resetVoiceSessionState: vi.fn(),
      openOutpatientFollowUp: vi.fn(),
      openReportInterpretation: vi.fn(),
      startVoiceInteraction,
      showToast: vi.fn(),
      trackError: vi.fn(),
    });

    await expect(router.openVoiceEntry()).resolves.toEqual({ type: 'voice-capture' });

    expect(fetchFollowUpContext).not.toHaveBeenCalled();
    expect(startVoiceInteraction).toHaveBeenCalledWith({ skipCacheRestore: true });
  });

  it('opens the report workspace for a historical report opportunity', async () => {
    const currentPatient = ref(buildPatientContext({
      payload: { patientId: 'patient-1', visitId: 'visit-1', name: '张建国' },
    }));
    const session = useReceptionSessionController(currentPatient);
    session.replaceOpportunity('report-interpretation', {
      type: 'report-interpretation',
      visits: [{
        visitId: 'history-1',
        visitTime: Date.now(),
        reportedApplications: [{
          applicationId: 'apply-1',
          name: '血常规',
          type: 'lab',
          status: 'reported',
        }],
      }],
    });
    const openReportInterpretation = vi.fn();
    const router = useOutpatientScenarioRouter({
      currentPatient,
      session,
      hasCachedVoiceResult: () => false,
      applyFollowUpContext: vi.fn(),
      openChronicRefillConfirmation: vi.fn(),
      resetVoiceSessionState: vi.fn(),
      openOutpatientFollowUp: vi.fn(),
      openReportInterpretation,
      startVoiceInteraction: vi.fn(),
      showToast: vi.fn(),
      trackError: vi.fn(),
    });

    await router.confirmReportAssistant();

    expect(openReportInterpretation).toHaveBeenCalledOnce();
    expect(session.executingOpportunity.value).toBeNull();
  });
});
