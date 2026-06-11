import type { TreatmentRecommendation } from '@/types/consultation';
import {
  getMatchedOrderServiceId,
  getOrderJsonField,
  getOrderPartId,
  getOrderServiceCode,
  getOrderServiceName,
  toPositiveNumber,
  type OrderItemResolvers,
} from './recordConfirmedPayload';

export interface TreatmentRequiredFieldResolverOptions {
  resolvers?: Partial<OrderItemResolvers>;
  normalize?: (rec: TreatmentRecommendation) => TreatmentRecommendation;
}

export interface TreatmentRequiredFieldIssue {
  field: string;
  message: string;
}

export interface TreatmentRequiredFieldValidationResult {
  ready: boolean;
  issues: TreatmentRequiredFieldIssue[];
}

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function getServiceId(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getServiceId?.(rec) || getMatchedOrderServiceId(rec));
}

function getServiceName(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getServiceName?.(rec) || getOrderServiceName(rec));
}

function getServiceCode(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getServiceCode?.(rec) || getOrderServiceCode(rec));
}

function getExecDeptId(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  if (options.resolvers?.getExecDeptId) {
    return trim(options.resolvers.getExecDeptId(rec));
  }

  if (rec.type === 'medicine') {
    return trim(rec.pharmacy);
  }

  return trim(rec.execDept);
}

function getPartId(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getPartId?.(rec) || getOrderPartId(rec));
}

function getJsonField(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getJsonField?.(rec) || getOrderJsonField(rec));
}

function getFrequencyKey(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getFrequencyKey?.(rec) || rec.frequencyKey);
}

function getRouteKey(rec: TreatmentRecommendation, options: TreatmentRequiredFieldResolverOptions): string {
  return trim(options.resolvers?.getRouteKey?.(rec) || rec.routeKey);
}

function getInsuranceType(rec: TreatmentRecommendation, normalized: TreatmentRecommendation): string {
  if (rec.insuranceCleared || normalized.insuranceCleared) {
    return '';
  }
  return trim(normalized.insuranceType || rec.insuranceType);
}

function isEmptyJsonObject(value: string): boolean {
  return !value || value === '{}';
}

function getTypeName(type: TreatmentRecommendation['type']): string {
  switch (type) {
    case 'medicine':
      return '药品';
    case 'exam':
      return '检查项目';
    case 'lab_test':
      return '检验项目';
    case 'procedure':
      return '处置项目';
    default:
      return '医嘱项目';
  }
}

function pushIssue(issues: TreatmentRequiredFieldIssue[], field: string, message: string): void {
  issues.push({ field, message });
}

export function validateTreatmentRequiredFields(
  rec: TreatmentRecommendation,
  options: TreatmentRequiredFieldResolverOptions = {},
): TreatmentRequiredFieldValidationResult {
  const normalized = options.normalize ? options.normalize(rec) : rec;
  const issues: TreatmentRequiredFieldIssue[] = [];
  const label = rec.name || getTypeName(rec.type);

  if (!rec.matchedItem) {
    pushIssue(issues, 'matchedItem', `${label} 未匹配标准库，请先完成匹配`);
  }

  if (!getServiceId(rec, options)) {
    pushIssue(issues, 'idSrv', `${label} 缺少标准服务 ID，请重新匹配标准库`);
  }

  if (!getServiceName(rec, options)) {
    pushIssue(issues, 'naSrv', `${label} 缺少标准服务名称，请重新匹配标准库`);
  }

  if (!getServiceCode(rec, options)) {
    pushIssue(issues, 'sdSrv', `${label} 缺少服务分类编码，请重新匹配标准库`);
  }

  if (!getExecDeptId(rec, options)) {
    pushIssue(issues, 'idDeptExec', `${label} 缺少执行位置，请先设置后再提交`);
  }

  if (!getInsuranceType(rec, normalized)) {
    pushIssue(issues, 'fgCheckOrd', `${label} 缺少医保限用，请先设置`);
  }

  if (rec.type === 'medicine') {
    if (!trim(normalized.dosage)) {
      pushIssue(issues, 'doseOnce', `${label} 缺少一次剂量，请先补齐`);
    }
    if (!trim(normalized.dosageUnit)) {
      pushIssue(issues, 'unitDose', `${label} 缺少剂量单位，请先补齐`);
    }
    if (!getFrequencyKey(normalized, options)) {
      pushIssue(issues, 'idFreq', `${label} 缺少用药频次，请先补齐`);
    }
    if (!getRouteKey(normalized, options)) {
      pushIssue(issues, 'idUsge', `${label} 缺少用法，请先补齐`);
    }
    if (toPositiveNumber(normalized.totalQty, 0) <= 0) {
      pushIssue(issues, 'amount', `${label} 缺少用药总量，请先补齐`);
    }
    if (toPositiveNumber(normalized.days, 0) <= 0) {
      pushIssue(issues, 'takeDays', `${label} 缺少用药天数，请先补齐`);
    }
    if (!trim(normalized.pharmacy)) {
      pushIssue(issues, 'pharmacy', `${label} 缺少发药药房，请先设置`);
    }
  }

  if (rec.type === 'exam' && !getPartId(rec, options)) {
    pushIssue(issues, 'idPart', `${label} 缺少检查部位，请先设置`);
  }

  if (rec.type === 'lab_test' && isEmptyJsonObject(getJsonField(rec, options))) {
    pushIssue(issues, 'jsonField', `${label} 缺少检验附加信息，请重新匹配标准库`);
  }

  if (rec.type === 'procedure' && toPositiveNumber(normalized.totalQty, 0) <= 0) {
    pushIssue(issues, 'amount', `${label} 缺少处置数量，请先补齐`);
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}

export function getFirstTreatmentRequiredFieldMessage(
  rec: TreatmentRecommendation,
  options: TreatmentRequiredFieldResolverOptions = {},
): string {
  return validateTreatmentRequiredFields(rec, options).issues[0]?.message || '';
}
