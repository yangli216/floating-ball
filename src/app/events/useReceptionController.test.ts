import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import { getWindowSizeForView } from '@/constants/windowSizes';
import { useReceptionSessionController } from '@features/reception/model/useReceptionSessionController';
import { useReceptionController } from './useReceptionController';

const analyzePatientRisksMock = vi.hoisted(() => vi.fn());
const trackApiCallMock = vi.hoisted(() => vi.fn());
const trackErrorMock = vi.hoisted(() => vi.fn());
const getHisAdapterMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/llm', () => ({
  analyzePatientRisks: analyzePatientRisksMock,
}));

vi.mock('@/services/his', () => ({
  getHisAdapter: getHisAdapterMock,
}));

vi.mock('@/services/operationTracker', () => ({
  trackApiCall: trackApiCallMock,
  trackError: trackErrorMock,
}));

describe('useReceptionController openChronicDisease', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHisAdapterMock.mockReturnValue(null);
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
      idCard: '150206199306039948',
      rqflStatus: '3,6',
      contractStatus: '已签约',
      pressureList: [],
      pressureHList: [],
      gluList: [],
      visitInfos: [],
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

  it('queries the real chronic-disease service with idCard and keeps response field names', async () => {
    const fetchChronicDiseasePatientVisitHistory = vi.fn().mockResolvedValue({
      idPhr: 'phr-1',
      idRecord: 'record-1',
      naPi: '林女士',
      sdSexText: '女性',
      ageText: '62岁',
      rqflStatus: '3,6',
      diagnosis: '原发性高血压;2型糖尿病',
      pressureList: [{
        fieldName: 'pressureL',
        fieldValue: '82',
        bisDate: '2026-07-24 00:00:00',
      }],
      pressureHList: [{
        fieldName: 'pressureH',
        fieldValue: '136',
        bisDate: '2026-07-24 00:00:00',
      }],
      gluList: [{
        fieldName: 'glu',
        fieldValue: '7.8',
        bisDate: '2026-07-24 00:00:00',
      }],
      visitInfos: [],
    });
    getHisAdapterMock.mockReturnValue({
      fetchPatientInfo: vi.fn().mockResolvedValue({
        patientId: 'patient-1',
        name: '林女士',
        gender: 'F',
        ageText: '62岁',
        idCard: '150206199306039948',
      }),
      fetchPatientHistory: vi.fn().mockResolvedValue({
        patientId: 'patient-1',
        visits: [],
      }),
      fetchOutpatientMedicalRecord: vi.fn().mockResolvedValue(null),
      fetchChronicDiseasePatientVisitHistory,
    });
    const currentPatient = ref<AppPatient | null>(null);
    const receptionSession = useReceptionSessionController(currentPatient);
    const controller = useReceptionController({
      currentPatient,
      receptionSession,
      showToast: vi.fn(),
      workMode: { openReceptionCapsule: vi.fn().mockResolvedValue(undefined) },
      resetVoiceSessionState: vi.fn(),
      clearVoiceConsultationCache: vi.fn(),
      clearMinimizedConsultationSessions: vi.fn(),
    });

    await controller.openChronicDisease({
      idPi: 'patient-1',
      idVis: 'visit-1',
    });

    expect(fetchChronicDiseasePatientVisitHistory)
      .toHaveBeenCalledWith('150206199306039948');
    expect(currentPatient.value?.idCard).toBe('150206199306039948');
    expect(currentPatient.value?.raw).toEqual(expect.objectContaining({
      idPhr: 'phr-1',
      idRecord: 'record-1',
      naPi: '林女士',
      rqflStatus: '3,6',
      pressureList: [expect.objectContaining({ fieldName: 'pressureL' })],
      pressureHList: [expect.objectContaining({ fieldName: 'pressureH' })],
      gluList: [expect.objectContaining({ fieldName: 'glu' })],
      visitInfos: [],
    }));
  });

  it('does not substitute idPi when patient information has no idCard', async () => {
    const fetchChronicDiseasePatientVisitHistory = vi.fn();
    getHisAdapterMock.mockReturnValue({
      fetchPatientInfo: vi.fn().mockResolvedValue({
        patientId: 'patient-1',
        name: '林女士',
        gender: 'F',
        ageText: '62岁',
      }),
      fetchPatientHistory: vi.fn().mockResolvedValue({
        patientId: 'patient-1',
        visits: [],
      }),
      fetchChronicDiseasePatientVisitHistory,
    });
    const currentPatient = ref<AppPatient | null>(null);
    const receptionSession = useReceptionSessionController(currentPatient);
    const showToast = vi.fn();
    const controller = useReceptionController({
      currentPatient,
      receptionSession,
      showToast,
      workMode: { openReceptionCapsule: vi.fn().mockResolvedValue(undefined) },
      resetVoiceSessionState: vi.fn(),
      clearVoiceConsultationCache: vi.fn(),
      clearMinimizedConsultationSessions: vi.fn(),
    });

    await controller.openChronicDisease({ idPi: 'patient-1' });

    expect(fetchChronicDiseasePatientVisitHistory).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('两慢病信息加载失败', 'error');
    expect(receptionSession.status.value).toBe('error');
  });
});
