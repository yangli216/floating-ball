import type { PatientContext } from './patientContext';

/**
 * 应用级患者上下文（跨 composable 共享）
 */
export type AppPatient = PatientContext;
export type { PatientContext } from './patientContext';

/**
 * Tauri Store 最小能力接口（结构化类型，避免名义类型不兼容）
 */
export interface AppStore {
  set: (key: string, value: unknown) => Promise<void>;
  get: <T>(key: string) => Promise<T | undefined>;
  save: () => Promise<void>;
}
