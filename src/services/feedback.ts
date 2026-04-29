import { invoke } from '@tauri-apps/api/core';
import { enqueueAuditEvent, flushAuditEvents } from './auditUploader';
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
  const candidate = log.details?.module;
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : log.operationType;
}

function buildOperationAuditPayload(
  log: Omit<OperationLog, 'logId' | 'createdAt'>,
  sessionId: string | null
): Record<string, unknown> {
  const success = log.success !== false;

  const consultationId = log.details?.consultationId as string | undefined;

  return {
    sessionId,
    consultationId: consultationId || undefined,
    module: resolveOperationModule(log),
    action: log.operationName,
    result: success ? 'success' : 'failure',
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
    try {
      const sessionId = await invoke<string>('create_session', {
        sessionType,
        patientId: patientId || null,
        patientName: patientName || null
      });
      this.currentSessionId = sessionId;
      console.log(`[FeedbackService] Session started: ${sessionId} (${sessionType})`);

      // 区域化双写
      enqueueAuditEvent('session', {
        sessionId,
        sessionType,
        patientId,
        action: 'start',
      });

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
    try {
      const targetSessionId = sessionId || this.currentSessionId;
      if (!targetSessionId) {
        console.warn('[FeedbackService] No active session to end');
        return;
      }

      const endTime = Math.floor(Date.now() / 1000); // Convert to Unix timestamp in seconds
      await invoke('update_session_status', {
        sessionId: targetSessionId,
        status,
        endTime
      });

      if (targetSessionId === this.currentSessionId) {
        this.currentSessionId = null;
      }

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
    try {
      const sessionId = message.sessionId || this.currentSessionId;
      if (!sessionId) {
        throw new Error('No active session');
      }

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
    try {
      const sessionId = feedback.sessionId || this.currentSessionId;
      if (!sessionId) {
        throw new Error('No active session');
      }
      const normalizedTargetType = normalizeFeedbackTargetType(feedback.targetType);

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

      // 区域化双写
      enqueueAuditEvent('feedback', {
        feedbackId,
        sessionId,
        targetType: feedback.targetType,
        targetId: feedback.targetId,
        feedbackType: feedback.feedbackType,
        rating: feedback.rating,
        reason: feedback.reason,
      });

      return feedbackId;
    } catch (error) {
      console.error('[FeedbackService] Failed to save feedback:', error);
      throw error;
    }
  }

  // Recommendation Management

  async saveRecommendation(rec: Partial<RecommendationExtended>): Promise<string> {
    try {
      const sessionId = rec.sessionId || this.currentSessionId;
      if (!sessionId) {
        throw new Error('No active session');
      }
      const normalizedRecType = normalizeRecommendationType((rec.recType || 'diagnosis') as RecommendationExtended['recType']);

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

      // 区域化双写
      enqueueAuditEvent('feedback', {
        recommendationId: recId,
        sessionId,
        recType: rec.recType,
        matched: rec.matched,
        matchConfidence: rec.matchConfidence,
        latencyMs: rec.latencyMs,
      });

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
      void flushAuditEvents();
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
    try {
      const sessionId = metric.sessionId || this.currentSessionId;

      await invoke('record_performance_metric', {
        sessionId: sessionId || null,
        metricType: metric.metricType,
        metricValue: metric.metricValue,
        unit: metric.unit,
        context: metric.context ? JSON.stringify(metric.context) : null
      });

      console.log(`[FeedbackService] Metric recorded: ${metric.metricType} = ${metric.metricValue} ${metric.unit}`);

      // 区域化双写
      enqueueAuditEvent('metric', {
        sessionId,
        metricType: metric.metricType,
        metricValue: metric.metricValue,
        unit: metric.unit,
        context: metric.context,
      });
    } catch (error) {
      console.error('[FeedbackService] Failed to record metric:', error);
      // Don't throw - metric recording failures shouldn't break the app
    }
  }

  // Statistics Queries

  async getSessionStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<SessionStatistics> {
    try {
      const stats = await invoke<SessionStatistics>('get_session_statistics', {
        startDate: startDate || null,
        endDate: endDate || null
      });
      return stats;
    } catch (error) {
      console.error('[FeedbackService] Failed to get session statistics:', error);
      throw error;
    }
  }

  async getFeedbackStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<FeedbackStatistics> {
    try {
      const stats = await invoke<FeedbackStatistics>('get_feedback_statistics', {
        startDate: startDate || null,
        endDate: endDate || null
      });
      return stats;
    } catch (error) {
      console.error('[FeedbackService] Failed to get feedback statistics:', error);
      throw error;
    }
  }

  async getPerformanceStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<PerformanceStatistics> {
    try {
      const stats = await invoke<PerformanceStatistics>('get_performance_statistics', {
        startDate: startDate || null,
        endDate: endDate || null
      });
      return stats;
    } catch (error) {
      console.error('[FeedbackService] Failed to get performance statistics:', error);
      throw error;
    }
  }

  async getRecommendationStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<RecommendationStatistics> {
    try {
      const stats = await invoke<RecommendationStatistics>('get_recommendation_statistics', {
        startDate: startDate || null,
        endDate: endDate || null
      });
      return stats;
    } catch (error) {
      console.error('[FeedbackService] Failed to get recommendation statistics:', error);
      throw error;
    }
  }

  async getOperationStatistics(
    startDate?: number,
    endDate?: number
  ): Promise<OperationStatistics> {
    try {
      const stats = await invoke<OperationStatistics>('get_operation_statistics', {
        startDate: startDate || null,
        endDate: endDate || null
      });
      return stats;
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
    try {
      const data = await invoke<string>('export_data', {
        format,
        startDate: startDate || null,
        endDate: endDate || null
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
