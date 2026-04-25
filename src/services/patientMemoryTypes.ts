/**
 * 患者长期记忆类型定义
 * 与 Rust 端 `commands/patient_memory.rs` 的 PatientMemoryDto / PatientVisitSummaryDto 结构对齐。
 */

export interface PatientVisitSummary {
  /** 完成时间戳（ms） */
  completedAt: number;
  /** 主诉 */
  chiefComplaint: string;
  /** 主诊断（取列表第一项） */
  primaryDiagnosis?: string | null;
  /** 本次涉及的全部诊断名 */
  diagnoses: string[];
  /** 本次开具/审核保留下的药品名（不含规格剂量） */
  medications: string[];
  /** 本次开具的化验名 */
  labTests: string[];
}

export interface PatientMemory {
  patientId: string;
  /** 历次累积过敏史（去重，已剔除"无/否认/未发现"等无意义值） */
  allergyHistory: string[];
  /** 反复出现 ≥2 次的诊断升级为慢病候选 */
  chronicDiagnosisCandidates: string[];
  /** 最近 N=5 次就诊摘要，按 completedAt desc */
  recentVisits: PatientVisitSummary[];
  updatedAt: number;
}
