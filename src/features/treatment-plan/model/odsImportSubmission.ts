import type {
  OdsImpReqVO,
  OdsImpResVO,
} from '@/services/his';

export interface SubmitOdsImpWithConfirmationOptions {
  request: OdsImpReqVO;
  save: (request: OdsImpReqVO) => Promise<OdsImpResVO>;
  confirmForceSave: (message: string) => Promise<boolean>;
}

export interface OdsImpSubmissionOutcome {
  cancelled: boolean;
  forced: boolean;
  result: OdsImpResVO;
}

/**
 * 执行 `saveOdsImp` 的 401 二次确认协议。
 *
 * 第二次请求只替换 `forceSave`，其余业务字段和明细数组保持同一份值。
 */
export async function submitOdsImpWithConfirmation(
  options: SubmitOdsImpWithConfirmationOptions,
): Promise<OdsImpSubmissionOutcome> {
  const firstResult = await options.save(options.request);
  if (firstResult.code !== '401') {
    return {
      cancelled: false,
      forced: false,
      result: firstResult,
    };
  }

  const confirmed = await options.confirmForceSave(firstResult.msg);
  if (!confirmed) {
    return {
      cancelled: true,
      forced: false,
      result: firstResult,
    };
  }

  return {
    cancelled: false,
    forced: true,
    result: await options.save({
      ...options.request,
      forceSave: '1',
    }),
  };
}
