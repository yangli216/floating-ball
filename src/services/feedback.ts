import { invoke } from '@tauri-apps/api/core';
import { enqueueAuditEvent } from './auditUploader';
import { isRegionalMode } from './regionalClient';
import type {
  SessionType,
  SessionStatus,
  MessageExtended,
  FeedbackInfo,
  RecommendationExtended,
  OperationLog,
  PerformanceMetric,
  SessionStatistics,
  FeedbackStatistics,
  PerformanceStatistics,
  RecommendationStatistics,
  OperationStatistics,
  ExportFormat
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
    if (isRegionalMode()) {
      const sessionId = crypto.randomUUID();
      this.currentSessionId = sessionId;
      enqueueAuditEvent('session', {
        sessionId,
        sessionType,
        patientId,
        action: 'start',
      });
      console.log(`[FeedbackService] Session started (regional): ${sessionId} (${sessionType})`);
      return sessionId;
    }

    try {
      const sessionId = await invoke<string>('create_session', {
        sessionType,
        patientId: patientId || null,
        patientName: patientName || null
      });
      this.currentSessionId = sessionId;
      console.log(`[FeedbackService] Session started: ${sessionId} (${sessionType})`);
      return sessionId;
    } catch (error) {
      console.error('[FeedbackService] Failed to start session:', error);
      throw error;
    }
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

    if (isRegionalMode()) {
      enqueueAuditEvent('session', {
        sessionId: targetSessionId,
        action: 'end',
        status,
      });
      console.log(`[FeedbackService] Session ended (regional): ${targetSessionId} (${status})`);
      return;
    }

    try {
      const endTime = Math.floor(Date.now() / 1000);
      await invoke('update_session_status', {
        sessionId: targetSessionId,
        status,
        endTime
      });

      console.log(`[FeedbackService] Session ended: ${targetSessionId} (${status})`);
    } catch (error) {
      console.error('[FeedbackService] Failed to end session:', error);
      throw error;
    }
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

    if (isRegionalMode()) {
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
      console.log(`[FeedbackService] Message saved (regional): ${messageId}`);
      return messageId;
    }

    try {
      const messageId = await invoke<string>('save_message', {
        sessionId,
        role: message.role || 'user',
        content: message.content || '',
        images: message.images ? JSON.stringify(message.images) : null,
        tokenCount: message.tokenCount || null,
        llmModel: message.llmModel || null,
        latencyMs: message.latencyMs || null
      });

      console.log(`[FeedbackService] Message saved: ${messageId}`);
      return messageId;
    } catch (error) {
      console.error('[FeedbackService] Failed to save message:', error);
      throw error;
    }
  }

  // Feedback Management

  async saveFeedback(feedback: Omit<FeedbackInfo, 'feedbackId' | 'createdAt'>): Promise<string> {
    const sessionId = feedback.sessionId || this.currentSessionId;
    if (!sessionId) {
      throw new Error('No active session');
    }
    const normalizedTargetType = normalizeFeedbackTargetType(feedback.targetType);

    if (isRegionalMode()) {
      const feedbackId = crypto.randomUUID();
      enqueueAuditEvent('feedback', {
        feedbackId,
        sessionId,
        targetType: feedback.targetType,
        targetId: feedback.targetId,
        feedbackType: feedback.feedbackType,
        rating: feedback.rating,
        reason: feedback.reason,
        originalValue: feedback.originalValue,
        modifiedValue: feedback.modifiedValue,
      });
      console.log(`[FeedbackService] Feedback saved (regional): ${feedbackId} (${feedback.feedbackType} on ${normalizedTargetType})`);
      return feedbackId;
    }

    try {
      const feedbackId = await invoke<string>('save_feedback', {
        sessionId,
        targetType: normalizedTargetType,
        targetId: feedback.targetId,
        feedbackType: feedback.feedbackType,
        rating: feedback.rating || null,
        reason: feedback.reason || null,
        originalValue: feedback.originalValue || null,
        modifiedValue: feedback.modifiedValue || null
      });

      console.log(`[FeedbackService] Feedback saved: ${feedbackId} (${feedback.feedbackType} on ${normalizedTargetType})`);
      return feedbackId;
    } catch (error) {
      console.error('[FeedbackService] Failed to save feedback:', error);
      throw error;
    }
  }

  // Recommendation Management

  async saveRecommendation(rec: Partial<RecommendationExtended>): Promise<string> {
    const sessionId = rec.sessionId || this.currentSessionId;
    if (!sessionId) {
      throw new Error('No active session');
    }
    const normalizedRecType = normalizeRecommendationType((rec.recType || 'diagnosis') as RecommendationExtended['recType']);

    if (isRegionalMode()) {
      const recId = crypto.randomUUID();
      enqueueAuditEvent('feedback', {
        recommendationId: recId,
        sessionId,
        recType: rec.recType,
        matched: rec.matched,
        matchConfidence: rec.matchConfidence,
        latencyMs: rec.latencyMs,
      });
      console.log(`[FeedbackService] Recommendation saved (regional): ${recId} (${normalizedRecType})`);
      return recId;
    }

    try {
      const content = typeof rec.content === 'string'
        ? rec.content
        : JSON.stringify(rec.content);

      const recId = await invoke<string>('save_recommendation', {
        sessionId,
        recType: normalizedRecType,
        content,
        matched: rec.matched || false,
        matchConfidence: rec.matchConfidence || null,
        promptTokens: rec.promptTokens || null,
        completionTokens: rec.completionTokens || null,
        latencyMs: rec.latencyMs || null
      });

      console.log(`[FeedbackService] Recommendation saved: ${recId} (${normalizedRecType})`);
      return recId;
    } catch (error) {
      console.error('[FeedbackService] Failed to save recommendation:', error);
      throw error;
    }
  }

  // Operation Logging

  async logOperation(log: Omit<OperationLog, 'logId' | 'createdAt'>): Promise<void> {
    const sessionId = log.sessionId || this.currentSessionId;
    const auditPayload = buildOperationAuditPayload(log, sessionId || null);

    if (isRegionalMode()) {
      enqueueAuditEvent('operation', auditPayload);
      console.log(`[FeedbackService] Operation forwarded to regional audit: ${log.operationType} - ${log.operationName}`);
      return;
    }

    try {
      await invoke('log_operation', {
        sessionId: sessionId || null,
        operationType: log.operationType,
        operationName: log.operationName,
        details: log.details ? JSON.stringify(log.details) : null,
        success: log.success !== false,
        durationMs: log.durationMs || null
      });

      console.log(`[FeedbackService] Operation logged: ${log.operationType} - ${log.operationName}`);
    } catch (error) {
      console.error('[FeedbackService] Failed to log operation:', error);
      // Don't throw - logging failures shouldn't break the app
    }
  }

  // Performance Metrics

  async recordMetric(metric: Omit<PerformanceMetric, 'metricId' | 'createdAt'>): Promise<void> {
    const sessionId = metric.sessionId || this.currentSessionId;

    if (isRegionalMode()) {
      enqueueAuditEvent('metric', {
        sessionId,
        metricType: metric.metricType,
        metricValue: metric.metricValue,
        unit: metric.unit,
        context: metric.context,
      });
      console.log(`[FeedbackService] Metric recorded (regional): ${metric.metricType} = ${metric.metricValue} ${metric.unit}`);
      return;
    }

    try {
      await invoke('record_performance_metric', {
        sessionId: sessionId || null,
        metricType: metric.metricType,
        metricValue: metric.metricValue,
        unit: metric.unit,
        context: metric.context ? JSON.stringify(metric.context) : null
      });

      console.log(`[FeedbackService] Metric recorded: ${metric.metricType} = ${metric.metricValue} ${metric.unit}`);
    } catch (error) {
      console.error('[FeedbackService] Failed to record metric:', error);
    }
  }

  // Statistics Queries

  async getSessionStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<SessionStatistics> {
    if (isRegionalMode()) {
      return {
        totalSessions: 0, activeSessions: 0, completedSessions: 0,
        cancelledSessions: 0, errorSessions: 0, totalMessages: 0,
        sessionsByType: {} as Record<SessionType, number>, sessionsByDate: [],
      };
    }
    try {
      return await invoke<SessionStatistics>('get_session_statistics', {
        startDate: startDate || null, endDate: endDate || null
      });
    } catch (error) {
      console.error('[FeedbackService] Failed to get session statistics:', error);
      throw error;
    }
  }

  async getFeedbackStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<FeedbackStatistics> {
    if (isRegionalMode()) {
      return {
        totalFeedbacks: 0, positiveCount: 0, negativeCount: 0,
        adoptedCount: 0, rejectedCount: 0, modifiedCount: 0,
        feedbacksByTargetType: {} as Record<string, number>,
        positiveRate: 0, adoptionRate: 0,
      };
    }
    try {
      return await invoke<FeedbackStatistics>('get_feedback_statistics', {
        startDate: startDate || null, endDate: endDate || null
      });
    } catch (error) {
      console.error('[FeedbackService] Failed to get feedback statistics:', error);
      throw error;
    }
  }

  async getPerformanceStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<PerformanceStatistics> {
    if (isRegionalMode()) {
      return {
        totalTokenCount: 0, metricsByType: {} as Record<string, { avg: number; min: number; max: number; count: number }>,
      };
    }
    try {
      return await invoke<PerformanceStatistics>('get_performance_statistics', {
        startDate: startDate || null, endDate: endDate || null
      });
    } catch (error) {
      console.error('[FeedbackService] Failed to get performance statistics:', error);
      throw error;
    }
  }

  async getRecommendationStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<RecommendationStatistics> {
    if (isRegionalMode()) {
      return {
        totalRecommendations: 0, matchedCount: 0, unmatchedCount: 0,
        matchRate: 0, totalPromptTokens: 0, totalCompletionTokens: 0,
        recommendationsByType: {} as Record<string, { total: number; matched: number }>,
      };
    }
    try {
      return await invoke<RecommendationStatistics>('get_recommendation_statistics', {
        startDate: startDate || null, endDate: endDate || null
      });
    } catch (error) {
      console.error('[FeedbackService] Failed to get recommendation statistics:', error);
      throw error;
    }
  }

  async getOperationStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<OperationStatistics> {
    if (isRegionalMode()) {
      return {
        totalOperations: 0, successCount: 0, failureCount: 0,
        successRate: 0, operationsByType: {}, topOperations: [], errorOperations: [],
      };
    }
    try {
      return await invoke<OperationStatistics>('get_operation_statistics', {
        startDate: startDate || null, endDate: endDate || null
      });
    } catch (error) {
      console.error('[FeedbackService] Failed to get operation statistics:', error);
      throw error;
    }
  }

  // Data Export

  async exportData(
    format: ExportFormat = 'json',
    startDate?: number,
    endDate?: number
  ): Promise<string> {
    if (isRegionalMode()) {
      return '{}';
    }
    try {
      const data = await invoke<string>('export_data', {
        format, startDate: startDate || null, endDate: endDate || null
      });
      console.log(`[FeedbackService] Data exported as ${format}`);
      return data;
    } catch (error) {
      console.error('[FeedbackService] Failed to export data:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const feedbackService = new FeedbackService();
export default feedbackService;
