import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getHisAdapter } from '@/services/his';
import type { TcdVisitForm } from '../types';
import { saveTcdForm } from './chronicDiseaseApi';
import {
  CHRONIC_DISEASE_SAVE_REQUEST_EVENT,
  CHRONIC_DISEASE_SAVE_RESULT_EVENT,
  type ChronicDiseaseSaveResult,
} from './chronicDiseaseWindowContract';
import { handleTcdFormSaveRequest } from './chronicDiseaseSaveHandler';

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
  listen: vi.fn(),
}));
vi.mock('@/services/his', () => ({
  getHisAdapter: vi.fn(),
}));
function formFixture(): TcdVisitForm {
  return {
    idPhr: 'PHR001',
    idRecord: 'RECORD001',
    id: '',
    status: '3',
    sdVisitKind: '1,2',
    dtHyPlan: '',
    dtDbsPlan: '',
    sdDataWay: '',
    stature: '176',
    avoirdupois: '76',
    advAdp: '74',
    bmi: '24.54',
    advBmi: '23.89',
    waistline: '55',
    advWaistline: '55',
    pressureH: '120',
    pressureL: '90',
    heartRate: '43',
    glu: '5',
    fbgMeal: '',
    isGlu: '1',
    inputUser: 'USER001',
    idUser: 'USER001',
    sdHySymptom: '2,3',
    sdDbsSymptom: '2,3',
    desOther: '',
    sdArteriopalmus: '0',
    sdProAct: '1',
    sdPsychicAdj: '1',
    fgCardiovascular: '1',
    lowEffects: '0',
    otherDisease: '',
    note: '',
    sdWehtherSmoke: '1',
    daySmoke: '1',
    advDaySmoke: '1',
    sdWhetherDrink: '1',
    dayDrink: '1',
    advDayDrink: '1',
    sdMainDrinking: '3',
    sportWeek: '3',
    advSportWeek: '3',
    sportMinute: '30',
    advSportMinute: '30',
    sdSalt: '3',
    sdAdvSalt: '3',
    rice: '3',
    targRice: '3',
    fgDrugChange: '0',
    sdDrugPro: '1',
    sdSideEffects: '1',
    desSideEffects: '',
    drugList: [],
    fgRef: '1',
    sdRefStatus: '1',
    desRef: '',
    refDep: '',
    desNoRef: '',
    desAdr: '',
    sdComplications: '',
    desComplications: '',
    desComor: '',
    sdComorbidity: '',
    desComorbidity: '',
    sdMajorCc: '',
    targetOrganDamage: '',
    desPresAdvice: '',
  };
}

describe('saveTcdForm', () => {
  const unlisten = vi.fn();

  beforeEach(() => {
    vi.useRealTimers();
    unlisten.mockReset();
    vi.mocked(emitTo).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(getHisAdapter).mockReset();
  });

  it('sends the exact form object to the main window and resolves its matching result', async () => {
    const form = formFixture();
    const response = { id: 'FOLLOW-UP-001' };
    let resultHandler: ((event: { payload: ChronicDiseaseSaveResult }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (eventName, handler) => {
      expect(eventName).toBe(CHRONIC_DISEASE_SAVE_RESULT_EVENT);
      resultHandler = handler as typeof resultHandler;
      return unlisten;
    });
    vi.mocked(emitTo).mockImplementation(async (label, eventName, payload) => {
      expect(label).toBe('main');
      expect(eventName).toBe(CHRONIC_DISEASE_SAVE_REQUEST_EVENT);
      const request = payload as { requestId: string; form: TcdVisitForm };
      expect(request.form).toBe(form);
      resultHandler?.({
        payload: {
          requestId: request.requestId,
          ok: true,
          data: response,
        },
      });
    });

    await expect(saveTcdForm(form)).resolves.toBe(response);
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('ignores another request result and rejects with the matching main-window error', async () => {
    const form = formFixture();
    let resultHandler: ((event: { payload: ChronicDiseaseSaveResult }) => void) | null = null;
    vi.mocked(listen).mockImplementation(async (_eventName, handler) => {
      resultHandler = handler as typeof resultHandler;
      return unlisten;
    });
    vi.mocked(emitTo).mockImplementation(async (_label, _eventName, payload) => {
      const request = payload as { requestId: string };
      resultHandler?.({
        payload: {
          requestId: 'another-request',
          ok: true,
          data: { ignored: true },
        },
      });
      resultHandler?.({
        payload: {
          requestId: request.requestId,
          ok: false,
          error: 'HIS 保存失败',
        },
      });
    });

    await expect(saveTcdForm(form)).rejects.toThrow('HIS 保存失败');
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('times out and removes the result listener when the main window does not answer', async () => {
    vi.useFakeTimers();
    vi.mocked(listen).mockResolvedValue(unlisten);
    vi.mocked(emitTo).mockResolvedValue();

    const assertion = expect(saveTcdForm(formFixture()))
      .rejects.toThrow('两慢病随访保存超时，请重试');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;

    expect(unlisten).toHaveBeenCalledOnce();
  });
});

describe('handleTcdFormSaveRequest', () => {
  beforeEach(() => {
    vi.mocked(emitTo).mockReset();
    vi.mocked(getHisAdapter).mockReset();
  });

  it('uses the initialized main-window adapter without changing the form', async () => {
    const form = formFixture();
    const response = { id: 'FOLLOW-UP-001' };
    const adapter = {
      saveTcdForm: vi.fn().mockResolvedValue(response),
    };
    vi.mocked(getHisAdapter).mockReturnValue(
      adapter as unknown as NonNullable<ReturnType<typeof getHisAdapter>>,
    );

    await handleTcdFormSaveRequest({
      requestId: 'save-request-1',
      form,
    });

    expect(adapter.saveTcdForm).toHaveBeenCalledWith(form);
    expect(emitTo).toHaveBeenCalledWith(
      'chronic-disease-window',
      CHRONIC_DISEASE_SAVE_RESULT_EVENT,
      {
        requestId: 'save-request-1',
        ok: true,
        data: response,
      },
    );
  });

  it('returns a correlated error when the main-window HIS adapter is unavailable', async () => {
    vi.mocked(getHisAdapter).mockReturnValue(null);

    await handleTcdFormSaveRequest({
      requestId: 'save-request-2',
      form: formFixture(),
    });

    expect(emitTo).toHaveBeenCalledWith(
      'chronic-disease-window',
      CHRONIC_DISEASE_SAVE_RESULT_EVENT,
      {
        requestId: 'save-request-2',
        ok: false,
        error: 'HIS 尚未初始化，无法保存两慢病随访',
      },
    );
  });

  it('returns the original Adapter error without wrapping the form or inventing a response', async () => {
    const adapter = {
      saveTcdForm: vi.fn().mockRejectedValue(new Error('上游业务校验失败')),
    };
    vi.mocked(getHisAdapter).mockReturnValue(
      adapter as unknown as NonNullable<ReturnType<typeof getHisAdapter>>,
    );

    await handleTcdFormSaveRequest({
      requestId: 'save-request-3',
      form: formFixture(),
    });

    expect(emitTo).toHaveBeenCalledWith(
      'chronic-disease-window',
      CHRONIC_DISEASE_SAVE_RESULT_EVENT,
      {
        requestId: 'save-request-3',
        ok: false,
        error: '上游业务校验失败',
      },
    );
  });
});
