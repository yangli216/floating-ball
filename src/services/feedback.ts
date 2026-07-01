import { enqueueAuditEvent } from './auditUploader';
import type {
  SessionType,
  SessionStatus,
  MessageExtended,
  FeedbackInfo,
  RecommendationExtended,
  OperationLog,
  PerformanceMetric
} from '../types/feedback';

function normalizeFeedbackTargetType(targetType: FeedbackInfo['targetType']): FeedbackInfo['targetType'] {
  if (targetType === 'lab_test' || targetType === 'procedure') {
    return 'examination';
  }
  return targetType;
}

function normalizeRecommendationType(recType: RecommendationExtended['recType']): RecommendationExtended['recType'] {
  if (recType === 'lab_test' || recType === 'procedure') {
    return 'examination';
  }
  return recType;
}

function resolveOperationModule(log: Omit<OperationLog, 'logId' | 'createdAt'>): string {
  if (typeof log.module === 'string' && log.module.trim()) {
    return log.module.trim();
  }
  const candidate = log.details?.module;
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : log.operationType;
}

function resolveOperationAction(log: Omit<OperationLog, 'logId' | 'createdAt'>): string {
  if (typeof log.action === 'string' && log.action.trim()) {
    return log.action.trim();
  }
  return log.operationName;
}

function resolveOperationSourceModule(log: Omit<OperationLog, 'logId' | 'createdAt'>): string | undefined {
  if (typeof log.sourceModule === 'string' && log.sourceModule.trim()) {
    return log.sourceModule.trim();
  }
  const candidate = log.details?.sourceModule;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function resolveOperationScene(log: Omit<OperationLog, 'logId' | 'createdAt'>): string | undefined {
  if (typeof log.scene === 'string' && log.scene.trim()) {
    return log.scene.trim();
  }
  const candidate = log.details?.scene;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function buildOperationAuditPayload(
  log: Omit<OperationLog, 'logId' | 'createdAt'>,
  sessionId: string | null
): Record<string, unknown> {
  const success = log.success !== false;

  const consultationId = log.details?.consultationId as string | undefined;
  const module = resolveOperationModule(log);
  const action = resolveOperationAction(log);
  const sourceModule = resolveOperationSourceModule(log);
  const scene = resolveOperationScene(log);

  return {
    sessionId,
    consultationId: consultationId || undefined,
    module,
    action,
    result: success ? 'success' : 'failure',
    title: log.title,
    sourceModule,
    scene,
    operationType: log.operationType,
    operationName: log.operationName,
    success,
    durationMs: log.durationMs,
    details: log.details,
  };
}

class FeedbackService {
  private currentSessionId: string | null = null;

  // Session Management

  async startSession(
    sessionType: SessionType,
    patientId?: string,
    patientName?: string
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    this.currentSessionId = sessionId;
    enqueueAuditEvent('session', { sessionId, sessionType, patientId, patientName, action: 'start' });
    return sessionId;
  }

  async endSession(
    sessionId?: string,
    status: SessionStatus = 'completed'
  ): Promise<void> {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      console.warn('[FeedbackService] No active session to end');
      return;
    }

    if (targetSessionId === this.currentSessionId) {
      this.currentSessionId = null;
    }

    enqueueAuditEvent('session', { sessionId: targetSessionId, action: 'end', status });
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  // Message Management

  async saveMessage(message: Partial<MessageExtended>): Promise<string> {
    const sessionId = message.sessionId || this.currentSessionId;
    if (!sessionId) {
      throw new Error('No active session');
    }

    const messageId = crypto.randomUUID();
    enqueueAuditEvent('session', {
      sessionId,
      action: 'message',
      messageId,
      role: message.role || 'user',
      tokenCount: message.tokenCount || null,
      llmModel: message.llmModel || null,
      latencyMs: message.latencyMs || null,
    });
    return messageId;
  }

  // Feedback Management

  async saveFeedback(feedback: Omit<FeedbackInfo, 'feedbackId' | 'createdAt'>): Promise<string> {
    const sessionId = feedback.sessionId || this.currentSessionId;
    if (!sessionId) {
      throw new Error('No active session');
    }
    const normalizedTargetType = normalizeFeedbackTargetType(feedback.targetType);

    const feedbackId = crypto.randomUUID();
    enqueueAuditEvent('feedback', {
      feedbackId,
      sessionId,
      targetType: normalizedTargetType,
      targetId: feedback.targetId,
      feedbackType: feedback.feedbackType,
      rating: feedback.rating,
      reason: feedback.reason,
      originalValue: feedback.originalValue,
      modifiedValue: feedback.modifiedValue,
    });
    return feedbackId;
  }

  // Recommendation Management

  async saveRecommendation(rec: Partial<RecommendationExtended>): Promise<string> {
    const sessionId = rec.sessionId || this.currentSessionId;
    if (!sessionId) {
      throw new Error('No active session');
    }
    const normalizedRecType = normalizeRecommendationType((rec.recType || 'diagnosis') as RecommendationExtended['recType']);

    const recId = crypto.randomUUID();
    enqueueAuditEvent('feedback', {
      recommendationId: recId,
      sessionId,
      recType: normalizedRecType,
      matched: rec.matched,
      matchConfidence: rec.matchConfidence,
      latencyMs: rec.latencyMs,
    });
    return recId;
  }

  // Operation Logging

  async logOperation(log: Omit<OperationLog, 'logId' | 'createdAt'>): Promise<void> {
    const sessionId = log.sessionId || this.currentSessionId;
    const auditPayload = buildOperationAuditPayload(log, sessionId || null);

    enqueueAuditEvent('operation', auditPayload);
  }

  // Performance Metrics

  async recordMetric(metric: Omit<PerformanceMetric, 'metricId' | 'createdAt'>): Promise<void> {
    const sessionId = metric.sessionId || this.currentSessionId;

    enqueueAuditEvent('metric', {
      sessionId,
      metricType: metric.metricType,
      metricValue: metric.metricValue,
      unit: metric.unit,
      context: metric.context,
    });
  }

}

// Export singleton instance
export const feedbackService = new FeedbackService();
export default feedbackService;
