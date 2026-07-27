import { describe, expect, it, vi } from 'vitest';
import type { OdsImpReqVO } from '@/services/his';
import { submitOdsImpWithConfirmation } from './odsImportSubmission';

function request(): OdsImpReqVO {
  return {
    forceSave: '0',
    idVis: 'VIS001',
    presVOList: [],
    herbVOList: [],
    applyVOS: [{
      idCli: 'CLI001',
      sdDisp: '1',
      naApply: '血常规',
    }],
    orderDispCons: [],
  };
}

describe('submitOdsImpWithConfirmation', () => {
  it('retries the same request with only forceSave changed after doctor confirmation', async () => {
    const initial = request();
    const save = vi.fn()
      .mockResolvedValueOnce({ code: '401', msg: '项目重复，是否继续？' })
      .mockResolvedValueOnce({ code: '200', msg: '' });
    const confirmForceSave = vi.fn().mockResolvedValue(true);

    const outcome = await submitOdsImpWithConfirmation({
      request: initial,
      save,
      confirmForceSave,
    });

    expect(confirmForceSave).toHaveBeenCalledWith('项目重复，是否继续？');
    expect(save).toHaveBeenNthCalledWith(1, initial);
    expect(save).toHaveBeenNthCalledWith(2, {
      ...initial,
      forceSave: '1',
    });
    const forcedRequest = save.mock.calls[1][0] as OdsImpReqVO;
    expect(forcedRequest.applyVOS).toBe(initial.applyVOS);
    expect(outcome).toEqual({
      cancelled: false,
      forced: true,
      result: { code: '200', msg: '' },
    });
  });

  it('does not retry when the doctor cancels the 401 confirmation', async () => {
    const save = vi.fn().mockResolvedValue({
      code: '401',
      msg: '项目重复，是否继续？',
    });

    const outcome = await submitOdsImpWithConfirmation({
      request: request(),
      save,
      confirmForceSave: vi.fn().mockResolvedValue(false),
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(outcome.cancelled).toBe(true);
    expect(outcome.forced).toBe(false);
  });
});
