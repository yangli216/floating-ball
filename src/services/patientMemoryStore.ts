/**
 * 患者长期记忆 Store（前端门面）
 *
 * 数据载体：通过 `patientMemoryBackend` 抽象层路由到具体后端
 * - 桌面端默认 → SQLite (`patient_memory.db`，命令在 `src-tauri/src/commands/patient_memory.rs`)
 * - 区域化模式 → HTTP（占位，未来接区域服务）
 * - 浏览器/初始化失败 → localStorage（兜底）
 *
 * 上层业务（useVoiceConsultation / useVoiceSafetyReview / useVoiceIntentRecognition）
 * 只依赖本文件暴露的 5 个 API：
 *   - getPatientMemory(patientId)            读取（async）
 *   - appendPatientVisit({...})              写入（async，提交后调用）
 *   - clearPatientMemory(patientId)          清空（async）
 *   - extractRecentMedications(memory, opts) 纯函数：从已加载的 memory 取近期用药
 *   - formatPatientMemoryForPrompt(memory)   纯函数：拼接到 LLM user prompt
 *
 * 设计取舍：
 * - 不直接访问存储介质；所有持久化通过 backend 抽象，便于平滑切换到区域模式
 * - 写入由调用方在 `complete_consultation` 成功后触发，不在中间态自动累积
 * - 不存原始转录文本，只存结构化字段名，避免 PII 与体积膨胀
 */

import type { GeneratedRecord } from '../types/voiceResult';
import { getMemoryBackend } from './patientMemoryBackend';
import type { HisPatientInfo, HisPatientHistory } from './his/types';
import type { PatientMemory, PatientProfile, PatientVisitSummary } from './patientMemoryTypes';

export type { PatientMemory, PatientVisitSummary } from './patientMemoryTypes';

export interface SyncPatientMemoryFromHisOptions {
  force?: boolean;
  patientProfile?: PatientProfile | null;
}

function sanitizePatientMemory(memory: PatientMemory | null): PatientMemory | null {
  if (!memory) return null;
  return {
    ...memory,
    chronicDiagnosisCandidates: (memory.chronicDiagnosisCandidates || []).filter(isLikelyChronicDiagnosis),
    recentVisits: [...(memory.recentVisits || [])].sort((left, right) => right.completedAt - left.completedAt),
  };
}

export async function getPatientMemory(patientId: string | null | undefined): Promise<PatientMemory | null> {
  if (!patientId || patientId === 'unknown') return null;
  try {
    return sanitizePatientMemory(await getMemoryBackend().get(patientId));
  } catch (err) {
    console.warn('[patientMemory] getPatientMemory failed:', patientId, err);
    return null;
  }
}

const ACUTE_DIAGNOSIS_KEYWORDS = [
  '急性',
  '上呼吸道感染',
  '呼吸道感染',
  '感染',
  '感冒',
  '肺炎',
  '支气管炎',
  '咽炎',
  '扁桃体炎',
  '发热',
  '腹泻',
  '胃肠炎',
  '外伤',
  '挫伤',
  '术后',
  '复查',
];

function normalizeTimestamp(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return Date.now();
  }
  if (value > 10_000_000_000) {
    return value;
  }
  return value * 1000;
}

function splitHistoryTerms(values: string[] | undefined): string[] {
  const result: string[] = [];
  for (const value of values || []) {
    const parts = String(value || '')
      .split(/[、,，;；\n]/)
      .map(item => item.trim())
      .filter(Boolean);
    result.push(...parts);
  }
  return unique(result);
}

function isLikelyChronicDiagnosis(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  return !ACUTE_DIAGNOSIS_KEYWORDS.some(keyword => normalized.includes(keyword));
}

function deriveChronicCandidatesFromHis(history: HisPatientHistory): string[] {
  const fromPastHistory = splitHistoryTerms(history.pastMedicalHistory).filter(isLikelyChronicDiagnosis);
  if (fromPastHistory.length > 0) {
    return fromPastHistory.slice(0, 8);
  }

  const counts = new Map<string, number>();
  for (const visit of history.visits || []) {
    for (const diagnosis of new Set(visit.diagnoses || [])) {
      const normalized = diagnosis.trim();
      if (!normalized || !isLikelyChronicDiagnosis(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([name]) => name);
}

function normalizeAllergyHistory(values: string[] | undefined): string[] {
  return splitHistoryTerms(values).filter(item => !/^(无|否认|未发现|none|nkda)$/i.test(item));
}

function normalizeHisVisits(history: HisPatientHistory): PatientVisitSummary[] {
  return [...(history.visits || [])]
    .map((visit) => ({
      completedAt: normalizeTimestamp(visit.visitTime),
      chiefComplaint: (visit.chiefComplaint || '').trim(),
      primaryDiagnosis: visit.diagnoses?.[0]?.trim() || null,
      diagnoses: (visit.diagnoses || []).map(item => item.trim()).filter(Boolean),
      medications: (visit.medications || []).map(item => item.trim()).filter(Boolean),
      labTests: [],
    }))
    .sort((left, right) => right.completedAt - left.completedAt)
    .slice(0, 5);
}

export function mapHisPatientInfoToPatientProfile(info: HisPatientInfo | null | undefined): PatientProfile | null {
  if (!info?.patientId) return null;
  return {
    patientId: info.patientId,
    name: info.name || undefined,
    gender: info.gender,
    age: info.age,
    ageText: info.ageText || undefined,
    idNo: info.idNo || undefined,
    mobilePhone: info.mobilePhone || undefined,
    insuranceType: info.insuranceType || undefined,
  };
}

/**
 * 异步同步 HIS 就诊历史到本地记忆系统。
 * 如果本地缓存未过期（如24小时内有更新），则跳过以提升性能。
 * HIS 已返回结构化历史时，直接整包覆盖本地快照，避免 LLM 回填时间导致历史时间失真。
 */
export async function syncPatientMemoryFromHis(
  patientId: string,
  hisHistory: HisPatientHistory,
  options?: SyncPatientMemoryFromHisOptions,
): Promise<void> {
  if (!patientId || !hisHistory) return;

  const memory = await getPatientMemory(patientId);
  const ONE_DAY = 24 * 3600 * 1000;
  if (!options?.force && memory && memory.updatedAt && (Date.now() - memory.updatedAt < ONE_DAY)) {
    console.log('[patientMemory] memory is fresh, skip sync from HIS');
    return;
  }

  try {
    await getMemoryBackend().replaceSnapshot({
      patientId,
      patientProfile: options?.patientProfile ?? memory?.patientProfile ?? null,
      allergyHistory: normalizeAllergyHistory(hisHistory.allergyHistory),
      chronicDiagnosisCandidates: deriveChronicCandidatesFromHis(hisHistory),
      recentVisits: normalizeHisVisits(hisHistory),
      updatedAt: Date.now(),
    });
    console.log('[patientMemory] synced from HIS successfully');
  } catch (err) {
    console.warn('[patientMemory] sync from HIS failed, error:', err);
  }
}

export interface AppendVisitInput {
  patientId: string;
  record: GeneratedRecord;
  /** 当前 patientInfo.allergyHistory 原值，可选 */
  allergyHistoryText?: string | null;
  patientProfile?: PatientProfile | null;
  completedAt?: number;
}

/**
 * 在医生确认提交后，把本次就诊摘要落入患者长期记忆。
 */
export async function appendPatientVisit(input: AppendVisitInput): Promise<PatientMemory | null> {
  const { patientId, record, allergyHistoryText, patientProfile, completedAt } = input;
  if (!patientId || patientId === 'unknown') return null;

  const visit: PatientVisitSummary = {
    completedAt: completedAt ?? Date.now(),
    chiefComplaint: (record.chiefComplaint || '').trim(),
    primaryDiagnosis: record.diagnosisList?.[0]?.name?.trim() || null,
    diagnoses: (record.diagnosisList || []).map(d => d.name?.trim() || '').filter(Boolean),
    medications: (record.medications || []).map(m => m.name?.trim() || '').filter(Boolean),
    labTests: (record.labTests || []).map(l => l.name?.trim() || '').filter(Boolean),
  };

  try {
    return sanitizePatientMemory(await getMemoryBackend().appendVisit({
      patientId,
      visit,
      allergyHistoryText: allergyHistoryText ?? null,
      patientProfile: patientProfile ?? null,
    }));
  } catch (err) {
    console.warn('[patientMemory] appendPatientVisit failed:', patientId, err);
    return null;
  }
}

export async function clearPatientMemory(patientId: string | null | undefined): Promise<void> {
  if (!patientId) return;
  try {
    await getMemoryBackend().clear(patientId);
  } catch (err) {
    console.warn('[patientMemory] clearPatientMemory failed:', patientId, err);
  }
}

export async function clearAllPatientMemory(): Promise<void> {
  try {
    await getMemoryBackend().clearAll();
  } catch (err) {
    console.warn('[patientMemory] clearAllPatientMemory failed:', err);
  }
}

function unique(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const t = v.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * 从 memory 中提取最近一次开具的药品名集合，供 L2 安全复核 `recentMedications` 使用。
 */
export function extractRecentMedications(
  memory: PatientMemory | null | undefined,
  opts?: { sinceDays?: number; maxItems?: number },
): string[] {
  if (!memory?.recentVisits?.length) return [];
  const sinceDays = opts?.sinceDays ?? 90;
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const meds: string[] = [];
  for (const v of memory.recentVisits) {
    if (v.completedAt < cutoff) continue;
    meds.push(...v.medications);
  }
  return unique(meds).slice(0, opts?.maxItems ?? 30);
}

/**
 * 把患者长期记忆格式化为可拼接到 LLM user prompt 的文本块。
 * 没有任何信息时返回空字符串，调用方可直接 `text + memoryBlock`。
 */
export function formatPatientMemoryForPrompt(memory: PatientMemory | null | undefined): string {
  if (!memory) return '';
  const visits = memory.recentVisits || [];
  if (visits.length === 0 && memory.allergyHistory.length === 0 && memory.chronicDiagnosisCandidates.length === 0) {
    return '';
  }

  const lines: string[] = ['', '【患者既往档案（来自本工作站历史就诊缓存）】'];

  if (memory.allergyHistory.length) {
    lines.push(`- 累积过敏史：${memory.allergyHistory.join('、')}`);
  }
  if (memory.chronicDiagnosisCandidates.length) {
    lines.push(`- 反复出现的诊断（候选慢病）：${memory.chronicDiagnosisCandidates.join('、')}`);
  }
  if (visits.length) {
    lines.push(`- 最近 ${Math.min(visits.length, 3)} 次就诊摘要（每条记录的日期、诊断、用药必须整体引用，不得拆分重组）：`);
    visits.slice(0, 3).forEach(v => {
      const date = new Date(v.completedAt).toISOString().slice(0, 10);
      const diag = v.primaryDiagnosis || (v.diagnoses[0] ?? '未明确');
      const meds = v.medications.length ? v.medications.slice(0, 4).join('、') : '无处方';
      lines.push(`  · ${date}：主诉「${v.chiefComplaint || '未记录'}」、主诊断「${diag}」、用药「${meds}」`);
    });
  }
  lines.push('请仅在与本次新对话内容一致时引用上述既往信息，不一致时以新对话为准，不得伪造未提及的内容。上述门诊记录仅供理解患者就诊背景，不要将门诊就诊流水写入 recordDraft.pastMedicalHistory。既往史只记录慢性病、手术史、外伤史等长期健康信息，门诊就诊记录应提炼为疾病名称+病程（如"高血压3年"），而非按就诊日期逐条罗列。');
  return lines.join('\n');
}
