/**
 * MedHermes JS SDK TypeScript 类型声明
 */

/** 患者信息 */
export interface PatientInfo {
  /** 患者唯一标识 */
  idPi: string;
  /** 患者姓名 */
  naPi: string;
  /** 性别文本，如 "男性" / "女性" */
  sdSexText: string;
  /** 年龄文本，如 "30岁" */
  ageText: string;
  /** 科室 */
  department?: string;
  /** 身份证号 */
  idCard?: string;
  /** 联系电话 */
  mobilePhone?: string;
  /** 过敏史 */
  allergyHistory?: string;
  /** 主诉 */
  chiefComplaint?: string;
  /** 现病史 */
  historyOfPresentIllness?: string;
  /** 既往史 */
  pastMedicalHistory?: string;
  /** 当前诊断 */
  diagnosis?: string;
  /** 体征摘要 */
  vitals?: string;
}

/** 风险项 */
export interface RiskItem {
  /** 1=红色(高危), 2=橙色(中危), 3=黄色(低危) */
  level: 1 | 2 | 3;
  /** allergy/chronic/medication/population/vital/other */
  category: string;
  /** 风险描述文本 */
  content: string;
}

/** 灵活模式动作类型 */
export type AssistAction =
  | 'record'
  | 'diagnosis'
  | 'differential'
  | 'medication'
  | 'examination'
  | 'lab_test'
  | 'procedure'
  | 'reminder';

/** 引用回执状态 */
export type FeedbackStatus = 'success' | 'failed';

/** 结果类型 */
export type ResultType =
  | 'draft'
  | 'final-report'
  | 'batch'
  | 'reference-request'
  | 'reference-feedback'
  | 'cancelled';

/** 诊断项 */
export interface DiagnosisItem {
  name: string;
  code?: string;
  isTCM?: boolean;
}

/** 药品项 */
export interface MedicationItem {
  name: string;
  spec?: string;
  usage?: string;
  idMedPro?: string;
  dosage?: string;
  dosageUnit?: string;
  totalQty?: string;
  totalUnit?: string;
  frequency?: string;
  route?: string;
  days?: string;
  pharmacy?: string;
  remark?: string;
  regulatedDisease?: string;
  insuranceType?: string;
}

/** 检查/检验/处置项 */
export interface ExamItem {
  name: string;
  idCli?: string;
  regulatedDisease?: string;
  bodySite?: string;
  totalQty?: string;
  execDept?: string;
  remark?: string;
  insuranceType?: string;
}

/** 引用项 */
export interface ReferenceItem {
  name: string;
  code?: string | null;
  type: 'diagnosis' | 'medication' | 'examination' | 'lab_test' | 'procedure';
  idCli?: string;
  isTCM?: boolean;
}

/** 问诊结果 */
export interface ConsultationResult {
  status?: string;
  consultationId: string;
  timestamp: number;
  resultType: ResultType;
  requestId?: string;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  pastMedicalHistory?: string;
  diagnosisList?: DiagnosisItem[];
  medications?: MedicationItem[];
  examinations?: ExamItem[];
  labTests?: ExamItem[];
  procedures?: ExamItem[];
  treatmentPlan?: string;
  medicalSummary?: string;
  /** 引用闭环字段 */
  referenceType?: string;
  referenceStatus?: string;
  referenceMessage?: string;
  referenceItems?: ReferenceItem[];
}

/** 浏览器上下文 */
export interface BrowserContext {
  origin: string;
  href: string;
  cookie: string;
  userAgent: string;
  timestamp: number;
  sdkVersion: string;
  extra?: Record<string, any>;
}

/** SDK 构造参数 */
export interface MedHermesOptions {
  /** 本地桥接地址，默认 http://127.0.0.1:8081/api */
  baseUrl?: string;
  /** 轮询间隔（毫秒），默认 2000 */
  pollInterval?: number;
  /** 业务调用后是否自动轮询，默认 true */
  autoPoll?: boolean;
  /** 深度链接协议名，默认 med-hermes */
  scheme?: string;
  /** 协议拉起后等待重连时间（毫秒），默认 3000 */
  launchRetryMs?: number;
  /** HTTP 请求超时（毫秒），默认 5000 */
  timeout?: number;
  /** 自定义浏览器上下文扩展字段 */
  extra?: Record<string, any>;
}

/** 事件类型映射 */
export interface MedHermesEvents {
  'draft': (result: ConsultationResult) => void;
  'final-report': (result: ConsultationResult) => void;
  'batch': (result: ConsultationResult) => void;
  'reference-request': (result: ConsultationResult) => void;
  'reference-feedback': (result: ConsultationResult) => void;
  'cancelled': (result: ConsultationResult) => void;
  'connected': (info: any) => void;
  'disconnected': () => void;
  'launching': () => void;
  'launch-failed': () => void;
  'error': (err: Error) => void;
  'polling-start': () => void;
  'polling-stop': () => void;
}

/** 握手响应 */
export interface HandshakeResponse {
  status: string;
  version: string;
  timestamp: number;
}

/** API 响应 */
export interface ApiResponse {
  status: string;
  consultationId?: string;
  action?: string;
  message?: string;
  requestId?: string;
  referenceType?: string;
  timestamp?: number;
}

export declare class MedHermes {
  static readonly VERSION: string;

  constructor(options?: MedHermesOptions);

  /** 初始化 SDK：采集浏览器上下文 + 与桌面端握手 */
  init(extra?: Record<string, any>): Promise<HandshakeResponse>;

  /** 检测桌面端是否在线 */
  ping(): Promise<HandshakeResponse>;

  /** 启动完整问诊 */
  startConsultation(patient: PatientInfo): Promise<ApiResponse>;

  /** 灵活模式 */
  assist(patient: PatientInfo, action: AssistAction): Promise<ApiResponse>;

  /** 启动语音问诊 */
  startVoice(patient?: PatientInfo): Promise<ApiResponse>;

  /** 结束当前接诊 */
  stop(): Promise<ApiResponse>;

  /** 推送患者风险信息 */
  sendRisks(patient: PatientInfo, risks?: RiskItem[]): Promise<ApiResponse>;

  /** 发送 PHIS 引用回执 */
  sendFeedback(
    requestId: string,
    status: FeedbackStatus,
    message?: string,
    items?: ReferenceItem[]
  ): Promise<ApiResponse>;

  /** 手动拉取一次结果 */
  fetchResult(): Promise<ConsultationResult | null>;

  /** 启动自动轮询 */
  startPolling(): void;

  /** 停止自动轮询 */
  stopPolling(): void;

  /** 销毁实例 */
  destroy(): void;

  /** 注册事件监听 */
  on<E extends keyof MedHermesEvents>(event: E, handler: MedHermesEvents[E]): this;

  /** 取消事件监听 */
  off<E extends keyof MedHermesEvents>(event: E, handler?: MedHermesEvents[E]): this;
}

export default MedHermes;
