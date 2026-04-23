/**
 * 应用级患者上下文（跨 composable 共享）
 */
export interface AppPatient {
  id?: string;
  idTet?: string;
  idPi?: string;
  idMpi?: string;
  patientId?: string;
  patientName?: string;
  piOi?: string;
  name?: string;
  naPi?: string;
  gender?: 'M' | 'F' | string;
  sdSexText?: string;
  age?: number | string;
  ageText?: string;
  [key: string]: unknown;
}

/**
 * Tauri Store 最小能力接口（结构化类型，避免名义类型不兼容）
 */
export interface AppStore {
  set: (key: string, value: unknown) => Promise<void>;
  get: <T>(key: string) => Promise<T | undefined>;
  save: () => Promise<void>;
}
