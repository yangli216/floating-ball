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

import { chatFast } from './llm';
import type { HisPatientHistory } from './his/types';

/**
 * 异步同步 HIS 就诊历史到本地记忆系统
 * 如果本地缓存未过期（如24小时内有更新），则跳过以提升性能。
 * 否则通过轻量级 LLM 将无结构的 HIS 数据提取为标准化记忆并落盘。
 */
export async function syncPatientMemoryFromHis(patientId: string, hisHistory: HisPatientHistory): Promise<void> {
  if (!patientId || !hisHistory) return;

  const memory = await getPatientMemory(patientId);
  const ONE_DAY = 24 * 3600 * 1000;
  if (memory && memory.updatedAt && (Date.now() - memory.updatedAt < ONE_DAY)) {
    console.log('[patientMemory] memory is fresh, skip sync from HIS');
    return;
  }

  // 即使 HIS 返回的数据是结构化的，也可能不够简洁，统一用轻量级模型清洗
  const promptText = `
请将以下患者历史就诊记录提取为标准化的 JSON 结构：
【过敏史】：${(hisHistory.allergyHistory || []).join('、') || '无'}
【既往史/慢病史】：${(hisHistory.pastMedicalHistory || []).join('、') || '无'}
【历次就诊记录】：
${(hisHistory.visits || []).map(v => 
  `时间: ${new Date(v.visitTime).toISOString().slice(0, 10)}
  主诉: ${v.chiefComplaint || '无'}
  现病史: ${v.presentIllness || '无'}
  诊断: ${(v.diagnoses || []).join('、') || '无'}
  用药: ${(v.medications || []).join('、') || '无'}`
).join('\n\n')}

要求输出 JSON 格式，严格包含以下三个字段：
- allergyHistory: 字符串数组，提取所有明确的过敏史（排除"无"等无意义描述）。
- chronicDiagnosisCandidates: 字符串数组，提取既往史中明确的慢性疾病名称。
- visits: 对象数组，每个对象包含 chiefComplaint, diagnoses, medications，以及 visitTime(时间戳数值)，按时间从老到新排序（最新的在最后），最多包含最近 5 次的就诊。
直接返回纯 JSON 数据，不要任何 markdown 标记（不要写 \`\`\`json ）。
`;

  try {
    const responseText = await chatFast([
      { role: 'system', content: '你是一个医疗数据结构化助手，仅输出合法的 JSON 文本，没有任何额外字符。' },
      { role: 'user', content: promptText }
    ]);
    
    let cleanJson = responseText.replace(/```json\n?|\n?```/g, '').trim();
    const jsonStart = cleanJson.indexOf('{');
    const jsonEnd = cleanJson.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleanJson = cleanJson.slice(jsonStart, jsonEnd + 1);
    }

    const parsed = JSON.parse(cleanJson);
    const allergyHistoryText = (parsed.allergyHistory || []).join('、');
    
    // 清空现有历史
    await clearPatientMemory(patientId);
    
    // 按时间顺序（从老到新）重新 append，以便重算慢病候选和保留最新记录
    const visits = Array.isArray(parsed.visits) ? parsed.visits : [];
    // 确保按时间顺序，避免乱序导致裁切错误的 5 条
    visits.sort((a: any, b: any) => (a.visitTime || 0) - (b.visitTime || 0));
    
    if (visits.length === 0 && allergyHistoryText) {
       // 如果只有过敏史没有就诊记录，插入一条空记录携带过敏史
       await appendPatientVisit({
         patientId,
         record: {
           chiefComplaint: '',
           historyOfPresentIllness: '',
           pastMedicalHistory: '',
           diagnosisList: [],
           medications: [],
           examinations: [],
           labTests: [],
           procedures: []
         },
         allergyHistoryText,
         completedAt: Date.now()
       });
    } else {
       for (const v of visits) {
         await appendPatientVisit({
           patientId,
           record: {
             chiefComplaint: v.chiefComplaint || '',
             historyOfPresentIllness: v.presentIllness || '',
             pastMedicalHistory: '',
             diagnosisList: Array.isArray(v.diagnoses) ? v.diagnoses.map((d: string) => ({ name: d })) : [],
             medications: Array.isArray(v.medications) ? v.medications.map((m: string) => ({ name: m })) : [],
             examinations: [],
             labTests: [],
             procedures: [],
           },
           allergyHistoryText,
           completedAt: v.visitTime || Date.now()
         });
       }
    }
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
