import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import { getWindowSizeForView } from '@/constants/windowSizes';
import { useReceptionSessionController } from '@features/reception/model/useReceptionSessionController';
import { useReceptionController } from './useReceptionController';

const analyzePatientRisksMock = vi.hoisted(() => vi.fn());
const trackApiCallMock = vi.hoisted(() => vi.fn());
const trackErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/llm', () => ({
  analyzePatientRisks: analyzePatientRisksMock,
}));

vi.mock('@/services/his', () => ({
  getHisAdapter: () => null,
}));

vi.mock('@/services/operationTracker', () => ({
  trackApiCall: trackApiCallMock,
  trackError: trackErrorMock,
}));

describe('useReceptionController openChronicDisease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the controlled two-chronic-disease detail without invoking risk analysis', async () => {
    const currentPatient = ref<AppPatient | null>(null);
    const receptionSession = useReceptionSessionController(currentPatient);
    const openReceptionCapsule = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const controller = useReceptionController({
      currentPatient,
      receptionSession,
      showToast,
      workMode: { openReceptionCapsule },
      resetVoiceSessionState: vi.fn(),
      clearVoiceConsultationCache: vi.fn(),
      clearMinimizedConsultationSessions: vi.fn(),
    });

    await controller.openChronicDisease({
      idPi: 'patient-1',
      idVis: 'visit-1',
      naPi: '林女士',
      sdSexText: '女性',
      ageText: '62岁',
      rqflStatus: '3,6',
      contractStatus: '已签约',
      currentVitalSigns: {
        systolicBloodPressure: 136,
        diastolicBloodPressure: 82,
      },
      hisHistory: {
        patientId: 'patient-1',
        visits: [],
      },
    });

    expect(analyzePatientRisksMock).not.toHaveBeenCalled();
    expect(receptionSession.risks.value).toEqual([]);
    expect(receptionSession.detailExpanded.value).toBe(true);
    expect(receptionSession.status.value).toBe('ready');
    expect(currentPatient.value?.raw?.rqflStatus).toBe('3,6');
    expect(openReceptionCapsule).toHaveBeenCalledWith(
      getWindowSizeForView('reception-capsule', {
        expanded: true,
        riskCount: 0,
      }),
    );
    expect(trackApiCallMock).toHaveBeenCalledWith(
      'his_open_chronic_disease',
      true,
      undefined,
      expect.objectContaining({ patientId: 'patient-1' }),
    );
    expect(showToast).not.toHaveBeenCalled();
    expect(trackErrorMock).not.toHaveBeenCalled();
  });
});
