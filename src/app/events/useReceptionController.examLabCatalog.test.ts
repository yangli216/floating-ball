import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReceptionSessionController } from '@features/reception/model/useReceptionSessionController';
import type { AppPatient } from '@/types/appState';

const mocks = vi.hoisted(() => ({
  analyzePatientRisks: vi.fn(),
  beginAvailableExamLabReception: vi.fn(),
  clearAvailableExamLabItems: vi.fn(),
  getHisAdapter: vi.fn(),
  trackApiCall: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock('@/services/llm', () => ({
  analyzePatientRisks: mocks.analyzePatientRisks,
}));

vi.mock('@/services/medicalData', () => ({
  medicalDataService: {
    beginAvailableExamLabReception: mocks.beginAvailableExamLabReception,
    clearAvailableExamLabItems: mocks.clearAvailableExamLabItems,
  },
}));

vi.mock('@/services/his', () => ({
  getHisAdapter: mocks.getHisAdapter,
}));

vi.mock('@/services/operationTracker', () => ({
  trackApiCall: mocks.trackApiCall,
  trackError: mocks.trackError,
}));

vi.mock('@features/reception-risk', () => ({
  assessChronicRefillCandidate: vi.fn(() => null),
  buildChronicRefillHistoryQuery: vi.fn(() => ({})),
  normalizeRiskPresentationItems: vi.fn((items) => items),
}));

vi.mock('@features/reception', () => ({
  applyReceptionClinicalHistorySummaries: vi.fn((patient) => patient),
  buildReceptionPatientDraft: vi.fn((payload) => ({
    ...payload,
    idPi: payload?.idPi || payload?.patientId,
    patientId: payload?.patientId || payload?.idPi,
    idVis: payload?.idVis || payload?.visitId,
    visitId: payload?.visitId || payload?.idVis,
  })),
  getRecentReportedVisits: vi.fn(() => []),
  hasPatientReportedLabOrExamResults: vi.fn(() => false),
  hasReportedApplyResult: vi.fn(() => false),
  resolveIncomingPatientTracking: vi.fn(() => ({})),
}));

import { useReceptionController } from './useReceptionController';

function createController() {
  const currentPatient = ref<AppPatient | null>(null);
  const receptionSession = useReceptionSessionController(currentPatient);
  const showToast = vi.fn();
  const controller = useReceptionController({
    currentPatient,
    receptionSession,
    showToast,
    workMode: {
      openReceptionCapsule: vi.fn().mockResolvedValue(undefined),
      resizeReceptionCapsule: vi.fn().mockResolvedValue(undefined),
    },
    resetVoiceSessionState: vi.fn(),
    clearVoiceConsultationCache: vi.fn(),
    clearMinimizedConsultationSessions: vi.fn(),
  });
  return { controller, currentPatient, showToast };
}

describe('useReceptionController exam/lab catalog lifecycle', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.analyzePatientRisks.mockResolvedValue([]);
    mocks.beginAvailableExamLabReception.mockResolvedValue([]);
    mocks.getHisAdapter.mockReturnValue(null);
  });

  it('prefetches once for a newly received visit and clears the catalog when reception ends', async () => {
    const { controller } = createController();

    await expect(controller.executeReceptionFlow({ idPi: 'PATIENT-1', idVis: 'VISIT-1' })).resolves.toBe(true);
    await expect(controller.ensureReceptionContext({ idPi: 'PATIENT-1', idVis: 'VISIT-1' })).resolves.toBe(true);

    expect(mocks.beginAvailableExamLabReception).toHaveBeenCalledTimes(1);
    expect(mocks.beginAvailableExamLabReception).toHaveBeenCalledWith('VISIT-1');

    controller.invalidateReceptionFlow();
    expect(mocks.clearAvailableExamLabItems).toHaveBeenCalledTimes(1);
  });

  it('keeps reception available but explains when the live catalog cannot be loaded', async () => {
    mocks.beginAvailableExamLabReception.mockRejectedValue(new Error('catalog unavailable'));
    const { controller, showToast } = createController();

    await expect(controller.executeReceptionFlow({ idPi: 'PATIENT-1', idVis: 'VISIT-1' })).resolves.toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      '当前检验检查目录获取失败，相关项目暂不可匹配或回写',
      'error',
      5000,
    );
  });
});
