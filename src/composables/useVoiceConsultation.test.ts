import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const mocks = vi.hoisted(() => ({
  clearTranscripts: vi.fn(),
  addTranscript: vi.fn(),
  processTranscript: vi.fn(),
  persistCache: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@services/operationTracker', () => ({
  trackClick: vi.fn(), trackError: vi.fn(), trackRecommendationAction: vi.fn(),
}));
vi.mock('@services/consultationUserLog', () => ({ submitConsultationUserLog: vi.fn() }));
vi.mock('@/utils/patientContext', () => ({
  getPatientContextAllergyHistory: vi.fn(() => ''),
  getPatientContextCurrentMedicationHistory: vi.fn(() => ''),
  getPatientContextPastMedicalHistory: vi.fn(() => ''),
}));
vi.mock('@shared/lib/errorMessages', () => ({ formatUserFacingError: vi.fn(() => 'error') }));
vi.mock('@features/clinical-result', () => ({ cloneClinicalResultInput: vi.fn((value) => value) }));
vi.mock('@features/voice-consultation', () => ({
  clearVoiceConsultationCacheById: vi.fn(),
  hasVoiceConsultationCache: vi.fn(() => false),
  loadVoiceConsultationCacheEntry: vi.fn(() => null),
  persistVoiceConsultationCacheEntry: mocks.persistCache,
  resolveVoiceConsultationId: vi.fn(() => 'visit-1'),
  useVoiceIntentRecognition: vi.fn(() => ({
    clearTranscripts: mocks.clearTranscripts,
    addTranscript: mocks.addTranscript,
    processTranscript: mocks.processTranscript,
    processingError: ref(null),
  })),
}));

import { useVoiceConsultation } from './useVoiceConsultation';

const result = {
  chiefComplaint: '咳嗽2天',
  historyOfPresentIllness: '受凉后咳嗽',
  pastMedicalHistory: '',
  allergyHistory: '',
  currentMedicationHistory: '',
  familyHistory: '',
  symptoms: [],
  negativeSymptoms: [],
  diagnoses: [],
  treatments: [],
  treatmentPlan: '',
  healthEducation: '',
  generation: { status: 'complete' as const, readySections: [] },
};

describe('useVoiceConsultation result navigation ordering', () => {
  it('opens the result view before enabling processing state', async () => {
    let currentView = 'voice-interaction';
    let api: ReturnType<typeof useVoiceConsultation>;
    const openVoiceConsultation = vi.fn(async () => {
      expect(api.isProcessingVoice.value).toBe(false);
      currentView = 'voice-consultation';
    });
    mocks.processTranscript.mockImplementation(async () => {
      expect(currentView).toBe('voice-consultation');
      expect(api.isProcessingVoice.value).toBe(true);
      return result;
    });

    api = useVoiceConsultation({
      currentPatient: ref({ idPi: 'patient-1' } as never),
      showToast: vi.fn(),
      openVoiceConsultation,
      workMode: { exitWork: vi.fn(async () => undefined) },
    });

    await api.handleVoiceStop(new Blob(['voice']), '真实语音文本');

    expect(openVoiceConsultation).toHaveBeenCalledTimes(1);
    expect(mocks.processTranscript).toHaveBeenCalledTimes(1);
    expect(api.isProcessingVoice.value).toBe(false);
    expect(api.intentResult.value?.chiefComplaint).toBe('咳嗽2天');
  });

  it('creates a user-log round for a non-voice generated clinical result', async () => {
    const api = useVoiceConsultation({
      currentPatient: ref({ idPi: 'patient-1' } as never),
      showToast: vi.fn(),
      openVoiceConsultation: vi.fn(async () => undefined),
      workMode: { exitWork: vi.fn(async () => undefined) },
    });

    await api.showGeneratedClinicalResult(result);

    expect(api.consultationRoundId.value).toMatch(/[0-9a-f-]{36}/u);
    expect(api.intentResult.value?.chiefComplaint).toBe('咳嗽2天');
  });
});
