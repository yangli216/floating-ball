import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import type { AppPatient } from '@/types/appState';
import type { Diagnosis, TreatmentRecommendation } from '@/types/consultation';
import type { TreatmentPlanRecordContext } from './useTreatmentPlanRecommendations';
import {
  useTreatmentPlanWriteback,
  type TreatmentPlanSourceModule,
} from './useTreatmentPlanWriteback';

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
});

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getHisAdapter: vi.fn(),
  trackFinalRecommendationPreferences: vi.fn(),
  eventHandler: undefined as undefined | ((event: { payload: Record<string, unknown> }) => void),
}));

vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/core')>()),
  invoke: mocks.invoke,
}));

vi.mock('@/services/his', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/his')>()),
  getHisAdapter: mocks.getHisAdapter,
}));

vi.mock('@/services/recommendationPreferenceTracker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/recommendationPreferenceTracker')>()),
  trackFinalRecommendationPreferences: mocks.trackFinalRecommendationPreferences,
}));

vi.mock('@shared/composables/useTauriEventListener', () => ({
  useTauriEventListener: (options: {
    handler: (event: { payload: Record<string, unknown> }) => void;
  }) => {
    mocks.eventHandler = options.handler;
    return {
      clearListener: vi.fn(),
      startListener: vi.fn(async () => {}),
    };
  },
}));

vi.mock('@features/consultation-result', async () => {
  const [
    payloadModule,
    preflightModule,
    listenerModule,
    feedbackControllerModule,
    statusModule,
  ] = await Promise.all([
    vi.importActual<typeof import('@features/consultation-result/model/useClinicalResultWritebackPayload')>(
      '@features/consultation-result/model/useClinicalResultWritebackPayload',
    ),
    vi.importActual<typeof import('@features/consultation-result/model/useClinicalResultWritebackPreflight')>(
      '@features/consultation-result/model/useClinicalResultWritebackPreflight',
    ),
    vi.importActual<typeof import('@features/consultation-result/model/useConsultationReferenceFeedbackListener')>(
      '@features/consultation-result/model/useConsultationReferenceFeedbackListener',
    ),
    vi.importActual<typeof import('@features/consultation-result/model/useWritebackFeedbackController')>(
      '@features/consultation-result/model/useWritebackFeedbackController',
    ),
    vi.importActual<typeof import('@features/consultation-result/model/useWritebackStatus')>(
      '@features/consultation-result/model/useWritebackStatus',
    ),
  ]);
  return {
    useClinicalResultWritebackPayload: payloadModule.useClinicalResultWritebackPayload,
    useClinicalResultWritebackPreflight: preflightModule.useClinicalResultWritebackPreflight,
    useConsultationReferenceFeedbackListener: listenerModule.useConsultationReferenceFeedbackListener,
    useWritebackFeedbackController: feedbackControllerModule.useWritebackFeedbackController,
    useWritebackStatus: statusModule.useWritebackStatus,
  };
});

const patient: AppPatient = {
  identity: {
    patientId: 'patient-1',
    visitId: 'visit-1',
    tetId: 'tet-1',
  },
  demographics: {
    patientName: '测试患者',
  },
  clinical: {},
  patientId: 'patient-1',
  visitId: 'visit-1',
  patientName: '测试患者',
  idPi: 'patient-1',
  idVis: 'visit-1',
  idTet: 'tet-1',
};

const hypertension: Diagnosis = {
  id: 'HIS-DIAG-HTN',
  code: 'I10',
  name: '高血压',
  rate: 'HIS诊断',
  rationale: '来自当前 HIS 诊断',
};

const diabetes: Diagnosis = {
  id: 'HIS-DIAG-DM2',
  code: 'E11.9',
  name: '2型糖尿病',
  rate: 'HIS诊断',
  rationale: '来自当前 HIS 诊断',
};

function createExamRecommendation(): TreatmentRecommendation {
  return {
    type: 'exam',
    name: '眼底照相',
    reason: '筛查视网膜病变',
    selected: true,
    execDept: 'dept-ophthalmology',
    bodySite: '眼底',
    bodySiteId: 'part-eye',
    insuranceType: '医保使用',
    matchedItem: {
      id: 'exam-fundus',
      idCli: 'exam-fundus',
      code: 'EXAM-FUNDUS',
      name: '眼底照相',
      idPart: 'part-eye',
      raw: {
        idCli: 'exam-fundus',
        naCli: '眼底照相',
        idPart: 'part-eye',
      },
    },
  };
}

function createHarness(options: {
  diagnoses?: Diagnosis[];
  sourceModule?: TreatmentPlanSourceModule;
} = {}) {
  const diagnoses = ref<Diagnosis[]>(options.diagnoses ?? [hypertension]);
  const diagnosis = ref<Diagnosis | null>(diagnoses.value[0] ?? null);
  const treatments = ref<TreatmentRecommendation[]>([createExamRecommendation()]);
  const notify = vi.fn();
  const onWritebackSuccess = vi.fn();
  const hydrateMedicalItemDetail = vi.fn(async () => undefined);
  const recordContext = ref<TreatmentPlanRecordContext>({
    chiefComplaint: '慢病复诊',
    historyOfPresentIllness: '患者规律随访，本次拟完善检查。',
    pastMedicalHistory: '高血压病史。',
    allergyHistory: '',
    diagnosisText: diagnoses.value.map((item) => item.name).join('、'),
    followUpEvidence: '',
    isFollowUp: false,
  });

  const controller = useTreatmentPlanWriteback({
    patient: ref(patient),
    diagnoses,
    diagnosis,
    treatments,
    recordContext,
    sourceModule: ref<TreatmentPlanSourceModule>(options.sourceModule ?? 'treatment_plan'),
    execDeptOptions: ref([{ key: 'dept-ophthalmology', text: '眼科' }]),
    normalizeTreatment: (rec) => rec as TreatmentRecommendation,
    findFrequencyOptionByValue: () => undefined,
    findRouteOptionByValue: () => undefined,
    getDefaultPharmacyOption: () => undefined,
    findMatchedPharmacyOption: () => undefined,
    ensureMedicineSelectable: async () => true,
    checkMedicineInventoryEnough: async () => true,
    hydrateMedicalItemDetail,
    hasRequiredPharmacy: () => true,
    hasRequiredExecDept: () => true,
    hasRequiredBodySite: () => true,
    onWritebackSuccess,
    notify,
  });

  return {
    controller,
    diagnoses,
    diagnosis,
    treatments,
    hydrateMedicalItemDetail,
    notify,
    onWritebackSuccess,
  };
}

describe('useTreatmentPlanWriteback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventHandler = undefined;
    mocks.invoke.mockResolvedValue(undefined);
    mocks.getHisAdapter.mockReturnValue({
      getDefaultExecDeptId: () => 'dept-default',
    });
  });

  it('uses record-confirmed as the only writeback transport and preserves all diagnoses', async () => {
    const harness = createHarness({
      diagnoses: [hypertension, diabetes],
      sourceModule: 'chronic_disease',
    });

    await expect(harness.controller.submit()).resolves.toBe(true);

    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith('complete_consultation', {
      result: expect.objectContaining({
        consultationId: 'visit-1',
        resultType: 'record-confirmed',
        requestId: expect.stringMatching(/^record-confirmed-\d+$/u),
        sourceModule: 'chronic_disease',
        referenceStatus: 'pending',
        diagList: [
          expect.objectContaining({
            idDiag: 'HIS-DIAG-HTN',
            cdIcd10: 'I10',
            fgMain: '1',
          }),
          expect.objectContaining({
            idDiag: 'HIS-DIAG-DM2',
            cdIcd10: 'E11.9',
            fgMain: '0',
          }),
        ],
        orderList: [
          expect.objectContaining({
            idSrv: 'exam-fundus',
            sdSrv: '31',
            idDeptExec: 'dept-ophthalmology',
            idPart: 'part-eye',
          }),
        ],
      }),
    });
    expect(mocks.trackFinalRecommendationPreferences).toHaveBeenCalledWith(expect.objectContaining({
      diagnoses: [hypertension, diabetes],
      primaryDiagnosis: hypertension,
      context: {
        consultationId: 'visit-1',
        sourceModule: 'chronic_disease',
        scene: 'chronic-disease-writeback',
      },
    }));
  });

  it('accepts a success feedback emitted before invoke resolves without showing a stale waiting notice', async () => {
    const harness = createHarness({ sourceModule: 'chronic_disease' });
    mocks.invoke.mockImplementationOnce(async (_command, args) => {
      const result = (args as { result: Record<string, unknown> }).result;
      mocks.eventHandler?.({
        payload: {
          consultationId: result.consultationId,
          requestId: result.requestId,
          referenceType: 'batch',
          status: 'success',
          message: 'HIS 已保存检查医嘱。',
        },
      });
    });

    await expect(harness.controller.submit()).resolves.toBe(true);

    expect(harness.controller.writebackStatus.waitingWritebackFeedback.value).toBe(false);
    expect(harness.controller.writebackStatus.pendingWritebackRequestId.value).toBe('');
    expect(harness.controller.writebackStatus.lastWritebackFeedback.value).toEqual(expect.objectContaining({
      status: 'success',
      message: 'HIS 已保存检查医嘱。',
    }));
    expect(harness.onWritebackSuccess).toHaveBeenCalledOnce();
    expect(harness.notify).toHaveBeenCalledWith('HIS 已保存检查医嘱。', 'success');
    expect(harness.notify.mock.calls.some(([message]) => (
      message === '诊疗方案已发送至 HIS，等待处理结果回执。'
    ))).toBe(false);
  });

  it('resets pending state when complete_consultation fails', async () => {
    const harness = createHarness();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.invoke.mockRejectedValueOnce(new Error('invoke failed'));

    await expect(harness.controller.submit()).resolves.toBe(false);

    expect(harness.controller.writebackStatus.waitingWritebackFeedback.value).toBe(false);
    expect(harness.controller.writebackStatus.pendingWritebackRequestId.value).toBe('');
    expect(harness.controller.writebackStatus.pendingWritebackMessage.value).toBe('');
    expect(harness.controller.writebackStatus.lastWritebackFeedback.value).toBeNull();
    expect(harness.notify).toHaveBeenCalledWith('诊疗方案提交失败，请稍后重试。', 'error');
    consoleError.mockRestore();
  });

  it('keeps the editing flow open when HIS returns a matched failure feedback', async () => {
    const harness = createHarness({ sourceModule: 'chronic_disease' });

    await expect(harness.controller.submit()).resolves.toBe(true);
    const result = (mocks.invoke.mock.calls[0]?.[1] as {
      result: Record<string, unknown>;
    }).result;
    mocks.eventHandler?.({
      payload: {
        consultationId: result.consultationId,
        requestId: result.requestId,
        referenceType: 'batch',
        status: 'failed',
        message: 'HIS 保存检查医嘱失败。',
      },
    });

    expect(harness.controller.writebackStatus.waitingWritebackFeedback.value).toBe(false);
    expect(harness.controller.writebackStatus.lastWritebackFeedback.value).toEqual(expect.objectContaining({
      status: 'failed',
      message: 'HIS 保存检查医嘱失败。',
    }));
    expect(harness.onWritebackSuccess).not.toHaveBeenCalled();
    expect(harness.notify).toHaveBeenCalledWith('HIS 保存检查医嘱失败。', 'error');
  });

  it('ignores an unmatched feedback and keeps waiting for the current request', async () => {
    const harness = createHarness({ sourceModule: 'chronic_disease' });
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(harness.controller.submit()).resolves.toBe(true);
    mocks.eventHandler?.({
      payload: {
        consultationId: 'visit-1',
        requestId: 'record-confirmed-another-request',
        referenceType: 'batch',
        status: 'success',
      },
    });

    expect(harness.controller.writebackStatus.waitingWritebackFeedback.value).toBe(true);
    expect(harness.controller.writebackStatus.lastWritebackFeedback.value).toBeNull();
    expect(harness.onWritebackSuccess).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('blocks submission before hydration when there is no diagnosis', async () => {
    const harness = createHarness({ diagnoses: [] });

    await expect(harness.controller.submit()).resolves.toBe(false);

    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(harness.hydrateMedicalItemDetail).not.toHaveBeenCalled();
    expect(harness.notify).toHaveBeenCalledWith(
      '缺少当前诊断，请先在 HIS 中补齐标准诊断后再回写',
      'info',
    );
  });
});
