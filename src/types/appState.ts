/**
 * 应用级患者上下文（跨 composable 共享）
 */
export interface AppPatient {
  id?: string;
  idTet?: string;
  idPi?: string;
  idMpi?: string;
  /** 就诊 ID（visit id），用于区分同一患者的多次就诊；缓存恢复以此为主键 */
  idVis?: string;
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
