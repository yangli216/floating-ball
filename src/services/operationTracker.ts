import { feedbackService } from './feedback';
import type { TargetType, FeedbackType } from '../types/feedback';
import type { OperationLog, OperationType } from '../types/feedback';

/**
 * 操作追踪工具层
 *
 * 设计目标：
 * 1. 后台列表优先展示“业务模块 / 业务动作”，而不是泛化的 button_click / api_call。
 * 2. 只保留能帮助定位业务路径的埋点；纯 UI 噪声（collapse、enter_work_mode 等）默认不记。
 * 3. 保留 operationType / operationName 兼容旧查询与旧服务端逻辑，但把 module/action/title/sourceModule/scene 提升为一等字段。
 */

type OperationDraft = Omit<OperationLog, 'logId' | 'createdAt'>;

interface OperationDescriptor {
  module: string;
  action: string;
  title?: string;
  sourceModule?: string;
  scene?: string;
  operationType: OperationType;
  operationName?: string;
}

function compactDetails(details?: Record<string, any>): Record<string, any> | undefined {
  if (!details) return undefined;
  const normalized = Object.entries(details).reduce<Record<string, any>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function emitOperation(descriptor: OperationDescriptor | null, success = true, details?: Record<string, any>, durationMs?: number) {
  if (!descriptor) return;

  const payload: OperationDraft = {
    module: descriptor.module,
    action: descriptor.action,
    title: descriptor.title,
    sourceModule: descriptor.sourceModule,
    scene: descriptor.scene,
    operationType: descriptor.operationType,
    operationName: descriptor.operationName || descriptor.action,
    details: compactDetails(details),
    success,
    durationMs,
  };

  void feedbackService.logOperation(payload);
}

const VIEW_CHANGE_SPECS: Record<string, OperationDescriptor> = {
  consultation: {
    module: 'navigation',
    action: 'open_consultation',
    title: '进入智能问诊',
    sourceModule: 'navigation',
    scene: 'consultation',
    operationType: 'view_change',
  },
  'voice-interaction': {
    module: 'navigation',
    action: 'start_voice_capture',
    title: '进入语音采集',
    sourceModule: 'navigation',
    scene: 'voice-interaction',
    operationType: 'view_change',
  },
  'voice-consultation': {
    module: 'navigation',
    action: 'open_voice_consultation',
    title: '进入语音问诊结果',
    sourceModule: 'navigation',
    scene: 'voice-consultation',
    operationType: 'view_change',
  },
  'knowledge-base': {
    module: 'navigation',
    action: 'open_knowledge_base',
    title: '进入知识库',
    sourceModule: 'navigation',
    scene: 'knowledge-base',
    operationType: 'view_change',
  },
};

const CLICK_EVENT_SPECS: Record<string, OperationDescriptor> = {
  exit_app: {
    module: 'shell',
    action: 'exit_app',
    title: '退出应用',
    sourceModule: 'app_shell',
    scene: 'floating-ball',
    operationType: 'button_click',
  },
  open_global_feedback_dialog: {
    module: 'feedback',
    action: 'open_feedback_panel',
    title: '打开问题反馈',
    sourceModule: 'feedback_panel',
    scene: 'feedback',
    operationType: 'button_click',
  },
  chat_send: {
    module: 'chat',
    action: 'send_message',
    title: '发送对话消息',
    sourceModule: 'chat_panel',
    scene: 'chat',
    operationType: 'button_click',
  },
  voice_recording_start: {
    module: 'voice_capture',
    action: 'start_recording',
    title: '开始语音采集',
    sourceModule: 'voice_capsule',
    scene: 'voice-interaction',
    operationType: 'button_click',
  },
  voice_recording_stop: {
    module: 'voice_capture',
    action: 'stop_recording',
    title: '结束语音采集',
    sourceModule: 'voice_capsule',
    scene: 'voice-interaction',
    operationType: 'button_click',
  },
  voice_recording_close: {
    module: 'voice_capture',
    action: 'close_voice_capture',
    title: '关闭语音采集',
    sourceModule: 'voice_capsule',
    scene: 'voice-interaction',
    operationType: 'button_click',
  },
  voice_transcription_confirm: {
    module: 'voice_capture',
    action: 'confirm_transcription',
    title: '确认语音转写',
    sourceModule: 'voice_capsule',
    scene: 'voice-interaction',
    operationType: 'button_click',
  },
  voice_transcription_cancel: {
    module: 'voice_capture',
    action: 'retry_transcription',
    title: '放弃当前转写并重录',
    sourceModule: 'voice_capsule',
    scene: 'voice-interaction',
    operationType: 'button_click',
  },
  voice_result_cancel: {
    module: 'voice_consultation',
    action: 'discard_voice_result',
    title: '放弃语音问诊结果',
    sourceModule: 'voice_consultation_result',
    scene: 'voice-consultation',
    operationType: 'button_click',
  },
  risk_alert_acknowledged: {
    module: 'reception',
    action: 'acknowledge_risk_alert',
    title: '确认风险提醒',
    sourceModule: 'risk_alert_panel',
    scene: 'risk-alert',
    operationType: 'button_click',
  },
  reception_toggle_risk_detail: {
    module: 'reception',
    action: 'toggle_risk_detail',
    title: '展开或收起接待风险详情',
    sourceModule: 'reception_capsule',
    scene: 'reception-capsule',
    operationType: 'button_click',
  },
  reception_chronic_refill_confirm: {
    module: 'reception',
    action: 'confirm_chronic_refill',
    title: '确认生成复诊配药病历',
    sourceModule: 'reception_capsule',
    scene: 'reception-chronic-refill',
    operationType: 'button_click',
  },
  settings_save: {
    module: 'settings',
    action: 'save_settings',
    title: '保存设置',
    sourceModule: 'settings_panel',
    scene: 'settings',
    operationType: 'button_click',
  },
  print_report: {
    module: 'consultation',
    action: 'print_report',
    title: '打印问诊报告',
    sourceModule: 'consultation_page',
    scene: 'consultation',
    operationType: 'button_click',
  },
  end_consultation_session: {
    module: 'consultation',
    action: 'complete_consultation',
    title: '完成智能问诊',
    sourceModule: 'consultation_page',
    scene: 'consultation',
    operationType: 'button_click',
  },
};

const FORM_SUBMIT_SPECS: Record<string, OperationDescriptor> = {
  feedback_submit: {
    module: 'feedback',
    action: 'submit_feedback',
    title: '提交问题反馈',
    sourceModule: 'feedback_panel',
    scene: 'feedback',
    operationType: 'form_submit',
  },
  regional_connection_saved: {
    module: 'settings',
    action: 'save_regional_connection',
    title: '保存区域化连接',
    sourceModule: 'settings_panel',
    scene: 'settings',
    operationType: 'form_submit',
  },
  submit_to_his: {
    module: 'consultation',
    action: 'submit_to_his',
    title: '提交问诊结果到 HIS',
    sourceModule: 'consultation_page',
    scene: 'consultation',
    operationType: 'form_submit',
  },
  generate_medical_record: {
    module: 'consultation',
    action: 'generate_medical_record',
    title: '生成病历草稿',
    sourceModule: 'consultation_page',
    scene: 'consultation',
    operationType: 'form_submit',
  },
  generate_final_report: {
    module: 'consultation',
    action: 'generate_final_report',
    title: '生成最终报告',
    sourceModule: 'consultation_page',
    scene: 'consultation',
    operationType: 'form_submit',
  },
};

const API_CALL_SPECS: Record<string, OperationDescriptor> = {
  deep_link_received: {
    module: 'system_integration',
    action: 'receive_deep_link',
    title: '接收外部 Deep Link',
    sourceModule: 'deep_link_listener',
    scene: 'deep-link',
    operationType: 'api_call',
  },
  his_patient_risks: {
    module: 'his_bridge',
    action: 'receive_patient_risks',
    title: '接收 HIS 风险提示请求',
    sourceModule: 'his_bridge',
    scene: 'reception',
    operationType: 'api_call',
  },
  his_open_chronic_disease: {
    module: 'his_bridge',
    action: 'open_chronic_disease',
    title: '接收 HIS 两慢病唤起请求',
    sourceModule: 'his_bridge',
    scene: 'chronic-disease',
    operationType: 'api_call',
  },
  his_start_consultation: {
    module: 'his_bridge',
    action: 'start_consultation',
    title: '接收 HIS 问诊启动请求',
    sourceModule: 'his_bridge',
    scene: 'consultation',
    operationType: 'api_call',
  },
  his_receive_patient: {
    module: 'his_bridge',
    action: 'receive_patient',
    title: '接收 HIS 接诊请求',
    sourceModule: 'his_bridge',
    scene: 'reception',
    operationType: 'api_call',
  },
  his_start_consultation_session: {
    module: 'his_bridge',
    action: 'start_consultation_assist',
    title: '接收 HIS 灵活问诊请求',
    sourceModule: 'his_bridge',
    scene: 'consultation-assist',
    operationType: 'api_call',
  },
  his_start_voice: {
    module: 'his_bridge',
    action: 'start_voice_consultation',
    title: '接收 HIS 语音问诊请求',
    sourceModule: 'his_bridge',
    scene: 'voice-consultation',
    operationType: 'api_call',
  },
};

const ERROR_SPECS: Record<string, OperationDescriptor> = {
  risk_analysis_failed: {
    module: 'reception',
    action: 'analyze_patient_risk',
    title: '接待风险评估失败',
    sourceModule: 'reception_risk_analysis',
    scene: 'reception-risk-analysis',
    operationType: 'error',
  },
  receive_patient_failed: {
    module: 'his_bridge',
    action: 'receive_patient',
    title: '接诊处理失败',
    sourceModule: 'his_bridge',
    scene: 'reception',
    operationType: 'error',
  },
  ai_diagnosis_failed: {
    module: 'consultation',
    action: 'generate_diagnosis_recommendation',
    title: '诊断推荐失败',
    sourceModule: 'consultation_ai',
    scene: 'consultation-diagnosis',
    operationType: 'error',
  },
  request_reference_failed: {
    module: 'consultation',
    action: 'request_phis_reference',
    title: '发起 PHIS 引用失败',
    sourceModule: 'consultation_reference',
    scene: 'consultation-reference',
    operationType: 'error',
  },
  generate_medical_record_failed: {
    module: 'consultation',
    action: 'generate_medical_record',
    title: '生成病历草稿失败',
    sourceModule: 'consultation_record',
    scene: 'consultation-record',
    operationType: 'error',
  },
  generate_chronic_refill_record_failed: {
    module: 'reception',
    action: 'generate_chronic_refill_record',
    title: '生成复诊配药病历失败',
    sourceModule: 'reception_risk',
    scene: 'reception-chronic-refill',
    operationType: 'error',
  },
};

export function trackBusinessOperation(log: OperationDraft) {
  void feedbackService.logOperation({
    ...log,
    details: compactDetails(log.details),
  });
}

/** 视图切换 */
export function trackViewChange(from: string, to: string, details?: Record<string, any>) {
  const descriptor = VIEW_CHANGE_SPECS[to];
  emitOperation(descriptor || null, true, { from, to, ...details });
}

/** 按钮点击 */
export function trackClick(name: string, details?: Record<string, any>) {
  emitOperation(CLICK_EVENT_SPECS[name] || null, true, details);
}

/** 表单提交 */
export function trackFormSubmit(name: string, details?: Record<string, any>, durationMs?: number) {
  emitOperation(FORM_SUBMIT_SPECS[name] || null, true, details, durationMs);
}

/** API 调用 */
export function trackApiCall(name: string, success: boolean, durationMs?: number, details?: Record<string, any>) {
  emitOperation(API_CALL_SPECS[name] || null, success, details, durationMs);
}

/** 错误捕获 */
export function trackError(name: string, error: unknown, details?: Record<string, any>) {
  emitOperation(ERROR_SPECS[name] || {
    module: 'error',
    action: name,
    title: name,
    sourceModule: 'error_tracker',
    operationType: 'error',
  }, false, {
    ...details,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack?.substring(0, 500) : undefined,
  });
}

/** AI 推荐接受/拒绝/修改 */
export function trackRecommendationAction(
  targetType: TargetType,
  targetId: string,
  action: FeedbackType,
  options?: {
    originalValue?: string;
    modifiedValue?: string;
    reason?: string;
    rating?: number;
  }
) {
  const sessionId = feedbackService.getCurrentSessionId();
  if (!sessionId) return;

  feedbackService.saveFeedback({
    sessionId,
    targetType,
    targetId,
    feedbackType: action,
    originalValue: options?.originalValue,
    modifiedValue: options?.modifiedValue,
    reason: options?.reason,
    rating: options?.rating,
  });
}
