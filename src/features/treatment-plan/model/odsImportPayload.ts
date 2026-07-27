import type {
  OdsImpApplyVO,
  OdsImpReqVO,
} from '@/services/his';
import type {
  Diagnosis,
  TreatmentRecommendation,
} from '@/types/consultation';
import {
  getMatchedItemRaw,
  getStandardDiagnosisId,
  readFirstString,
} from '@features/clinical-result/recordConfirmedPayload';

export interface BuildOdsImpRequestOptions {
  idVis: string;
  requestId: string;
  diagnosis: Diagnosis | null;
  treatments: TreatmentRecommendation[];
  orderList: Array<Record<string, string | number>>;
}

function numberValue(
  source: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function buildApplyItem(
  treatment: TreatmentRecommendation,
  order: Record<string, string | number>,
  diagnosis: Diagnosis | null,
  requestId: string,
  index: number,
): OdsImpApplyVO {
  if (treatment.type !== 'exam' && treatment.type !== 'lab_test') {
    throw new Error(`慢病医嘱调入暂不支持${treatment.name}的项目类型`);
  }
  const raw = getMatchedItemRaw(treatment);
  const matched = treatment.matchedItem as Record<string, unknown> | undefined;
  const idCli = String(order.idSrv || '').trim()
    || readFirstString(raw, ['idCli', 'idSrv'])
    || readFirstString(matched, ['idCli', 'idSrv', 'id', 'code']);
  if (!idCli) {
    throw new Error(`${treatment.name} 缺少诊疗项目 ID，无法保存医嘱`);
  }
  const idDeptExec = String(order.idDeptExec || '').trim();
  if (!idDeptExec) {
    throw new Error(`${treatment.name} 未设置执行科室，无法保存医嘱`);
  }

  const sdDisp = treatment.type === 'lab_test' ? '1' : '2';
  const priceSale = numberValue(raw, ['priceSale'])
    ?? numberValue(matched, ['priceSale', 'unitPrice']);
  const freeParts = numberValue(raw, ['freeParts']);
  const standardDiagnosisId = getStandardDiagnosisId(diagnosis);
  return {
    ...(standardDiagnosisId ? { idsDie: standardDiagnosisId } : {}),
    idCli,
    sdDisp,
    idSim: readFirstString(raw, ['idSim']) || `${requestId}-${index + 1}`,
    ...(priceSale !== undefined ? { priceSale } : {}),
    naApply: String(order.naSrv || '').trim() || treatment.matchedItem?.name || treatment.name,
    idDeptExec,
    ...(readFirstString(raw, ['idOrgExec']) ? { idOrgExec: readFirstString(raw, ['idOrgExec']) } : {}),
    fgCheck: readFirstString(raw, ['fgCheck']) || '0',
    amount: 1,
    ...(diagnosis?.code?.trim() ? { disease: diagnosis.code.trim() } : {}),
    ...(diagnosis?.name?.trim() ? { naDisease: diagnosis.name.trim() } : {}),
    sdOrd: String(order.sdSrv || '').trim() || (sdDisp === '1' ? '41' : '31'),
    ...(String(order.idPart || '').trim() ? { idPart: String(order.idPart).trim() } : {}),
    memo: String(order.memo || '').trim(),
    ...(treatment.bodySite?.trim() ? { partAndWay: treatment.bodySite.trim() } : {}),
    ...(readFirstString(raw, ['desHlthExa']) ? { desHlthExa: readFirstString(raw, ['desHlthExa']) } : {}),
    ...(readFirstString(raw, ['desCurDie']) ? { desCurDie: readFirstString(raw, ['desCurDie']) } : {}),
    ...(freeParts !== undefined ? { freeParts } : {}),
  };
}

export function buildOdsImpRequest(
  options: BuildOdsImpRequestOptions,
): OdsImpReqVO {
  const idVis = options.idVis.trim();
  if (!idVis) {
    throw new Error('缺少当前门诊就诊标识，无法保存医嘱');
  }
  if (options.treatments.length !== options.orderList.length) {
    throw new Error('医嘱调入项目与回写项目数量不一致');
  }

  return {
    forceSave: '0',
    idVis,
    presVOList: [],
    herbVOList: [],
    applyVOS: options.treatments.map((treatment, index) => (
      buildApplyItem(
        treatment,
        options.orderList[index],
        options.diagnosis,
        options.requestId,
        index,
      )
    )),
    orderDispCons: [],
  };
}
