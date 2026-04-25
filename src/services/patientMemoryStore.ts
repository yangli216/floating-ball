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
import type { PatientMemory, PatientVisitSummary } from './patientMemoryTypes';

export type { PatientMemory, PatientVisitSummary } from './patientMemoryTypes';

export async function getPatientMemory(patientId: string | null | undefined): Promise<PatientMemory | null> {
  if (!patientId || patientId === 'unknown') return null;
  try {
    return await getMemoryBackend().get(patientId);
  } catch (err) {
    console.warn('[patientMemory] getPatientMemory failed:', patientId, err);
    return null;
  }
}

export interface AppendVisitInput {
  patientId: string;
  record: GeneratedRecord;
  /** 当前 patientInfo.allergyHistory 原值，可选 */
  allergyHistoryText?: string | null;
  completedAt?: number;
}

/**
 * 在医生确认提交后，把本次就诊摘要落入患者长期记忆。
 */
export async function appendPatientVisit(input: AppendVisitInput): Promise<PatientMemory | null> {
  const { patientId, record, allergyHistoryText, completedAt } = input;
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
    return await getMemoryBackend().appendVisit({
      patientId,
      visit,
      allergyHistoryText: allergyHistoryText ?? null,
    });
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
    lines.push(`- 最近 ${Math.min(visits.length, 3)} 次就诊摘要：`);
    visits.slice(0, 3).forEach(v => {
      const date = new Date(v.completedAt).toISOString().slice(0, 10);
      const diag = v.primaryDiagnosis || (v.diagnoses[0] ?? '未明确');
      const meds = v.medications.length ? v.medications.slice(0, 4).join('、') : '无处方';
      lines.push(`  · ${date}｜主诉：${v.chiefComplaint || '未记录'}｜主诊断：${diag}｜用药：${meds}`);
    });
  }
  lines.push('请仅在与本次新对话内容一致时引用上述既往信息，不一致时以新对话为准，不得伪造未提及的内容。');
  return lines.join('\n');
}
