import type {
  TreatmentPlanInitialDraftStandardDiagnosis,
} from '@features/treatment-plan';
import type { DiagnosisCatalogEntry } from '@/services/his';
import type {
  ChronicDiseaseTag,
  ChronicDiseaseType,
} from '../types';

interface ChronicStandardDiagnosisRule {
  canonicalName: string;
  codeFamily: string;
  label: string;
  matchesName: (name: string) => boolean;
}

const CHRONIC_STANDARD_DIAGNOSIS_RULES: Record<
  ChronicDiseaseType,
  ChronicStandardDiagnosisRule
> = {
  hypertension: {
    canonicalName: '原发性高血压',
    codeFamily: 'I10',
    label: '高血压',
    matchesName: (name) => name.includes('高血压'),
  },
  type2_diabetes: {
    canonicalName: '2型糖尿病',
    codeFamily: 'E11',
    label: '2 型糖尿病',
    // E11 已限定 2 型；名称侧只要求明确属于糖尿病，兼容院内目录使用
    // “糖尿病”或“非胰岛素依赖型糖尿病”等命名。
    matchesName: (name) => name.includes('糖尿病'),
  },
};

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[Ⅱⅱ]/g, 'II');
}

function normalizeCode(value: string | undefined): string {
  return (value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function getStableDiseaseTypes(
  diseaseTags: readonly ChronicDiseaseTag[],
): ChronicDiseaseType[] {
  const seen = new Set<ChronicDiseaseType>();
  const result: ChronicDiseaseType[] = [];

  diseaseTags.forEach((tag) => {
    if (seen.has(tag.diseaseType)) return;
    seen.add(tag.diseaseType);
    result.push(tag.diseaseType);
  });

  return result;
}

function findStandardDiagnosis(
  diseaseType: ChronicDiseaseType,
  catalog: readonly DiagnosisCatalogEntry[],
): DiagnosisCatalogEntry | undefined {
  const rule = CHRONIC_STANDARD_DIAGNOSIS_RULES[diseaseType];
  const matches = catalog.filter((item) => {
    const name = normalizeName(item.name);
    const code = normalizeCode(item.code);
    return Boolean(
      item.id.trim()
      && rule.matchesName(name)
      && code.startsWith(rule.codeFamily),
    );
  });
  const canonicalName = normalizeName(rule.canonicalName);
  return matches.find((item) => normalizeName(item.name) === canonicalName)
    || matches
      .slice()
      .sort((left, right) => {
        const nameLength = normalizeName(left.name).length - normalizeName(right.name).length;
        if (nameLength !== 0) return nameLength;
        return normalizeCode(left.code).length - normalizeCode(right.code).length;
      })[0];
}

export function resolveChronicStandardDiagnoses(
  diseaseTags: readonly ChronicDiseaseTag[],
  catalog: readonly DiagnosisCatalogEntry[],
): TreatmentPlanInitialDraftStandardDiagnosis[] {
  const diseaseTypes = getStableDiseaseTypes(diseaseTags);
  if (diseaseTypes.length === 0) {
    throw new Error('本次慢病摘要缺少受支持的疾病标签，无法匹配 HIS 标准诊断');
  }

  return diseaseTypes.map((diseaseType) => {
    const rule = CHRONIC_STANDARD_DIAGNOSIS_RULES[diseaseType];
    const matched = findStandardDiagnosis(diseaseType, catalog);
    if (!matched) {
      throw new Error(
        `HIS 标准诊断目录缺少${rule.label}（名称语义 + ${rule.codeFamily} 编码族），无法进入诊疗方案`,
      );
    }
    return {
      id: matched.id.trim(),
      code: (matched.code || '').trim(),
      name: matched.name.trim(),
    };
  });
}
