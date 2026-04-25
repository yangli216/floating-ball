import { computed } from 'vue';
import type { GeneratedRecord, MedicationEntry, VoiceSafetyIssue } from '../types/voiceResult';

export type SafetyIssueActionKind =
  | 'remove_medications'
  | 'add_lab_tests'
  | 'none';

export interface RemoveMedicationsPlan {
  kind: 'remove_medications';
  actionLabel: string;
  /** 命中的 medication 在 record.medications 中的下标 */
  targetIndices: number[];
  /** 命中的药品名（用于追踪） */
  targetNames: string[];
}

export interface AddLabTestsPlan {
  kind: 'add_lab_tests';
  actionLabel: string;
  /** 已经在现有 lab/exam 列表中去重过的待添加项 */
  itemsToAdd: string[];
}

export interface NoActionPlan {
  kind: 'none';
}

export type SafetyIssueActionPlan = RemoveMedicationsPlan | AddLabTestsPlan | NoActionPlan;

const REMOVE_CATEGORIES = new Set([
  'allergy',
  'drug_interaction',
  'contraindication',
]);

const ADD_CHECK_CATEGORIES = new Set([
  'missing_check',
]);

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * 用于药品名匹配的"双向 includes"：
 * - LLM 给出的 relatedItems 可能是简称（"阿莫西林"），处方名可能是完整名（"阿莫西林胶囊"）
 * - 也可能反过来。任一方向命中即视为同一药品。
 */
function medicationMatches(med: MedicationEntry, target: string): boolean {
  const a = normalize(med.name || '');
  const b = normalize(target);
  if (!a || !b) return false;
  if (a === b) return true;
  // 仅允许一定长度的子串匹配，避免"片"、"剂"等过短词造成误删
  if (b.length >= 3 && a.includes(b)) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  return false;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    const key = normalize(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function deriveLabTestCandidates(issue: VoiceSafetyIssue): string[] {
  const fromRelated = issue.relatedItems || [];
  const fromSuggestion = (issue.suggestion || '')
    // "建议补充：电解质、肝肾功能" 这类描述里挑出顿号/逗号分隔片段
    .split(/[、,，;；]/)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && s.length <= 20);
  return uniqueStrings([...fromRelated, ...fromSuggestion]);
}

export function deriveSafetyIssueActionPlan(
  issue: VoiceSafetyIssue,
  record: GeneratedRecord | null | undefined,
): SafetyIssueActionPlan {
  if (!record) return { kind: 'none' };

  if (REMOVE_CATEGORIES.has(issue.category) && issue.relatedItems?.length) {
    const indices: number[] = [];
    const names: string[] = [];
    (record.medications || []).forEach((med, idx) => {
      const hit = issue.relatedItems!.some(target => medicationMatches(med, target));
      if (hit) {
        indices.push(idx);
        names.push(med.name);
      }
    });
    if (indices.length === 0) return { kind: 'none' };
    return {
      kind: 'remove_medications',
      actionLabel: indices.length === 1 ? `移除"${names[0]}"` : `移除 ${indices.length} 项冲突用药`,
      targetIndices: indices,
      targetNames: names,
    };
  }

  if (ADD_CHECK_CATEGORIES.has(issue.category)) {
    const candidates = deriveLabTestCandidates(issue);
    if (candidates.length === 0) return { kind: 'none' };
    const existing = new Set<string>([
      ...(record.labTests || []).map(item => normalize(item.name || '')),
      ...(record.examinations || []).map(item => normalize(item.name || '')),
    ]);
    const itemsToAdd = candidates.filter(c => !existing.has(normalize(c)));
    if (itemsToAdd.length === 0) return { kind: 'none' };
    return {
      kind: 'add_lab_tests',
      actionLabel: itemsToAdd.length === 1 ? `补充"${itemsToAdd[0]}"` : `补充 ${itemsToAdd.length} 项化验`,
      itemsToAdd,
    };
  }

  return { kind: 'none' };
}

/**
 * 编排层 composable：把 issue → 动作计划 → 实际 mutate record 串起来。
 *
 * 设计原则：
 * - 不持有 issues 状态，状态仍由 useVoiceSafetyReview 管
 * - 不直接持有 record；通过 getter/setter 注入，避免循环依赖
 * - 每个动作仅修改 record 的本地 ref，不发起任何网络写回
 */
export function useSafetyIssueResolver(options: {
  getRecord: () => GeneratedRecord | null;
  onRecordUpdated?: (record: GeneratedRecord) => void;
}) {
  function getPlan(issue: VoiceSafetyIssue): SafetyIssueActionPlan {
    return deriveSafetyIssueActionPlan(issue, options.getRecord());
  }

  function applyPlan(issue: VoiceSafetyIssue): SafetyIssueActionPlan {
    const record = options.getRecord();
    if (!record) return { kind: 'none' };
    const plan = deriveSafetyIssueActionPlan(issue, record);
    if (plan.kind === 'remove_medications') {
      const next = (record.medications || []).filter((_, idx) => !plan.targetIndices.includes(idx));
      record.medications = next;
    } else if (plan.kind === 'add_lab_tests') {
      const next = [...(record.labTests || [])];
      plan.itemsToAdd.forEach(name => next.push({ name }));
      record.labTests = next;
    } else {
      return plan;
    }
    options.onRecordUpdated?.(record);
    return plan;
  }

  return {
    getPlan,
    applyPlan,
    // 方便 panel 通过 prop 函数判断是否显示按钮
    isActionable: (issue: VoiceSafetyIssue) => getPlan(issue).kind !== 'none',
  };
}

export type UseSafetyIssueResolverReturn = ReturnType<typeof useSafetyIssueResolver>;

// 备用：可在外部直接做 computed 派生
export function useIssueActionLabel(issue: () => VoiceSafetyIssue, record: () => GeneratedRecord | null) {
  return computed(() => {
    const plan = deriveSafetyIssueActionPlan(issue(), record());
    return plan.kind === 'none' ? '' : plan.actionLabel;
  });
}
