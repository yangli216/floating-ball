/**
 * record-confirmed 病历回写 payload 构造器
 *
 * 用途：症状问诊 / 语音问诊在医生确认后向 PHIS 回写完整病历的统一构造点。
 * 详细字段约定见 api.md 的「问诊一键确认回写（record-confirmed）」章节。
 *
 * 设计原则：
 * 1. 纯函数 + 显式注入依赖，不直接读取任何组件状态；
 * 2. 当上游 UI 还未采集某些字段时，使用与语音侧一致的合理默认值（takeDays=1、fgSkintest=0、
 *    fgCheckOrd=1、sdSrv 按 type 兜底等），保证 PHIS 接口能解析；
 * 3. 中性 DTO，不携带 PHIS 私有字段；PHIS 私有字段通过 `rec.matchedItem.raw` 透传。
 */

import type { Diagnosis, TreatmentRecommendation } from '../types/consultation';

// ===== 通用小工具（与语音侧 readFirstString / toPositiveNumber 同源） =====

export function readFirstString(
  source: Record<string, unknown> | undefined,
  keys: string[],
): string {
  if (!source) return '';
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

export function toPositiveNumber(value: unknown, fallback = 1): number {
  const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getMatchedItemRaw(
  rec: TreatmentRecommendation,
): Record<string, unknown> | undefined {
  const raw = (rec.matchedItem as { raw?: unknown } | undefined)?.raw;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

// ===== diagList =====

export interface BuildDiagListInput {
  /** 已勾选的诊断列表（包含主诊断） */
  selectedDiagnoses: Diagnosis[];
  /** 主诊断（fgMain=1 的那一个，必须包含在 selectedDiagnoses 中） */
  primaryDiagnosis: Diagnosis | null;
  /** 患者 idTet（来自 PHIS 患者上下文） */
  patientTetId: string;
}

export function getDiagnosisKey(diag: Diagnosis | null | undefined): string {
  if (!diag) return '';
  return `${diag.id || ''}|${diag.code || ''}|${diag.name || ''}`;
}

function getDiagnosisCategoryCode(diag: Diagnosis): string {
  return diag.isTCM ? '2' : '1';
}

function getDiagnosisCategoryText(diag: Diagnosis): string {
  return diag.isTCM ? '中医诊断' : '西医诊断';
}

export function buildDiagList(input: BuildDiagListInput): Array<Record<string, string>> {
  const primaryKey = getDiagnosisKey(input.primaryDiagnosis);
  const ordered = [...input.selectedDiagnoses].sort((left, right) => {
    if (getDiagnosisKey(left) === primaryKey) return -1;
    if (getDiagnosisKey(right) === primaryKey) return 1;
    return 0;
  });

  return ordered.map((diag) => ({
    idTet: input.patientTetId || '',
    idDiag: diag.id || '',
    naDiag: diag.name,
    sdDiag: getDiagnosisCategoryCode(diag),
    cdIcd10: diag.code || '',
    naIcd10: diag.name,
    fgMain: getDiagnosisKey(diag) === primaryKey ? '1' : '0',
    sdDiagText: getDiagnosisCategoryText(diag),
  }));
}

// ===== orderList =====

/**
 * 构造单个 orderList 元素时所需的解析器。
 * 调用方按各自数据源（语音侧/症状侧）实现这些解析器后注入。
 *
 * 所有解析器返回值都允许为空字符串：当字段缺失时由 `buildOrderListItem` 用默认值兜底。
 */
export interface OrderItemResolvers {
  /** PHIS 服务分类 sdSrv：药=11 检=31 验=41 处=21 */
  getServiceCode: (rec: TreatmentRecommendation) => string;
  /** PHIS 标准服务 ID */
  getServiceId: (rec: TreatmentRecommendation) => string;
  /** PHIS 标准服务名 */
  getServiceName: (rec: TreatmentRecommendation) => string;
  /** 执行科室 ID（药品取药房 idSto，其他取 idDeptExec，回退到握手默认） */
  getExecDeptId: (rec: TreatmentRecommendation) => string;
  /** 检查部位 ID */
  getPartId: (rec: TreatmentRecommendation) => string;
  /** 检验组合 jsonField（idLisCategory + fgCombination） */
  getJsonField: (rec: TreatmentRecommendation) => string;
  /** 是否检查医嘱标志，缺省 1 */
  getFgCheckOrd?: (rec: TreatmentRecommendation) => string;
  /** 是否皮试，仅药品需要，缺省 0 */
  getFgSkintest?: (rec: TreatmentRecommendation) => string;
  /** 频次 key（idFreq） */
  getFrequencyKey?: (rec: TreatmentRecommendation) => string;
  /** 用法 key（idUsge） */
  getRouteKey?: (rec: TreatmentRecommendation) => string;
  /** 标准化药品字段（剂量、单位、天数等）。可选，未提供则直接读 rec 字段。 */
  normalize?: (rec: TreatmentRecommendation) => TreatmentRecommendation;
}

const DEFAULT_FG_CHECK_ORD = '1';
const DEFAULT_FG_SKINTEST = '0';

function defaultServiceCodeByType(type: TreatmentRecommendation['type']): string {
  switch (type) {
    case 'medicine':
      return '11';
    case 'exam':
      return '31';
    case 'lab_test':
      return '41';
    default:
      return '21';
  }
}

export function buildOrderListItem(
  rec: TreatmentRecommendation,
  resolvers: OrderItemResolvers,
): Record<string, string | number> {
  const normalized = resolvers.normalize ? resolvers.normalize(rec) : rec;
  const orderServiceId = resolvers.getServiceId(rec);
  const execDeptId = resolvers.getExecDeptId(rec);
  const serviceCode =
    resolvers.getServiceCode(rec).trim() || defaultServiceCodeByType(rec.type);
  const serviceName =
    resolvers.getServiceName(rec).trim() || rec.matchedItem?.name || rec.name || '';

  const base: Record<string, string | number> = {
    amount: toPositiveNumber(normalized.totalQty, 1),
    fgCheckOrd:
      (resolvers.getFgCheckOrd?.(rec).trim() || '') || DEFAULT_FG_CHECK_ORD,
    sdSrv: serviceCode,
    naSrv: serviceName,
    idDeptExec: execDeptId,
    ...(orderServiceId ? { idSrv: orderServiceId } : {}),
  };

  if (rec.type === 'medicine') {
    return {
      ...base,
      doseOnce: normalized.dosage || '',
      unitDose: normalized.dosageUnit || '',
      idFreq: resolvers.getFrequencyKey?.(rec) || '',
      idUsge: resolvers.getRouteKey?.(rec) || '',
      takeDays: toPositiveNumber(normalized.days, 1),
      fgSkintest:
        (resolvers.getFgSkintest?.(rec).trim() || '') || DEFAULT_FG_SKINTEST,
    };
  }

  const partId = resolvers.getPartId(rec);
  const jsonField = resolvers.getJsonField(rec);

  return {
    ...base,
    ...(partId ? { idPart: partId } : {}),
    ...(jsonField ? { jsonField } : { jsonField: '{}' }),
  };
}

// ===== 顶层 payload =====

export type RecordConfirmedResultType = 'record-confirmed' | 'draft';

export interface BuildRecordConfirmedPayloadInput {
  consultationId: string;
  requestId?: string;
  /** 默认 record-confirmed；draft 用于早期阶段（仅主诉/现病史）的写回。 */
  resultType?: RecordConfirmedResultType;
  timestamp?: number;
  chiefComplaint: string;
  historyOfPresentIllness: string;
  pastMedicalHistory: string;
  /** 已构造好的 diagList（调用 buildDiagList 得到） */
  diagList: Array<Record<string, string>>;
  /** 已构造好的 orderList（调用 buildOrderListItem 得到） */
  orderList: Array<Record<string, string | number>>;
  /** 自然语言摘要的治疗方案，用于 PHIS 文本字段 */
  treatmentPlan?: string;
  /** 额外字段（如 referenceStatus 等），会浅合并进 payload */
  extra?: Record<string, unknown>;
}

export function buildRecordConfirmedPayload(
  input: BuildRecordConfirmedPayloadInput,
): Record<string, unknown> {
  const {
    consultationId,
    requestId,
    resultType = 'record-confirmed',
    timestamp = Date.now(),
    chiefComplaint,
    historyOfPresentIllness,
    pastMedicalHistory,
    diagList,
    orderList,
    treatmentPlan,
    extra,
  } = input;

  return {
    consultationId,
    timestamp,
    resultType,
    ...(requestId ? { requestId } : {}),
    chiefComplaint,
    historyOfPresentIllness,
    pastMedicalHistory,
    diagList,
    orderList,
    ...(treatmentPlan ? { treatmentPlan } : {}),
    ...(extra || {}),
  };
}
