import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { HisOutpatientFollowUpContext } from '@/services/his/types';
import { buildPatientContext } from '@/utils/patientContext';
import type { ClinicalResultInput } from '@features/clinical-result';
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

const clinicalResult: ClinicalResultInput = {
  chiefComplaint: '高血压复诊配药',
  historyOfPresentIllness: '未提供新发不适信息。',
  pastMedicalHistory: '高血压病史。',
  allergyHistory: '未记录',
  currentMedicationHistory: '苯磺酸氨氯地平片',
  familyHistory: '',
  symptoms: [],
  negativeSymptoms: [],
  diagnoses: [],
  treatments: [],
  treatmentPlan: '',
  healthEducation: '',
};

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
  it('drops a generated refill result when its opportunity was reset while awaiting AI', async () => {
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
        medications: ['苯磺酸氨氯地平片'],
        chronicVisitCount: 1,
        chronicVisits: [],
        evidenceText: '最近3次就诊中存在高血压慢病就诊和配药',
      },
    });

    let resolveGeneration!: (result: ClinicalResultInput) => void;
    const generateChronicRefillRecord = vi.fn(() => new Promise<ClinicalResultInput>((resolve) => {
      resolveGeneration = resolve;
    }));
    const showGeneratedClinicalResult = vi.fn();
    const showToast = vi.fn();
    const router = useOutpatientScenarioRouter({
      currentPatient,
      session,
      hasCachedVoiceResult: () => false,
      fetchFollowUpContext: async () => null,
      applyFollowUpContext: vi.fn(),
      generateChronicRefillRecord,
      showGeneratedClinicalResult,
      resetVoiceSessionState: vi.fn(),
      openOutpatientFollowUp: vi.fn(),
      startVoiceInteraction: vi.fn(),
      showToast,
      trackError: vi.fn(),
    });

    const pending = router.confirmChronicRefill();
    session.reset();
    resolveGeneration(clinicalResult);
    await pending;

    expect(showGeneratedClinicalResult).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
