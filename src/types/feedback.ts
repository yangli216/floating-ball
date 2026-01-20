// Type definitions for feedback and tracking system

// Enums
export type SessionType = 'chat' | 'consultation' | 'voice' | 'reception';
export type SessionStatus = 'active' | 'completed' | 'cancelled' | 'error';
export type FeedbackType = 'positive' | 'negative' | 'adopted' | 'rejected' | 'modified';
export type TargetType = 'message' | 'diagnosis' | 'medication' | 'examination' | 'record';
export type OperationType = 'view_change' | 'button_click' | 'form_submit' | 'api_call' | 'error';
export type MetricType = 'llm_latency' | 'api_latency' | 'ui_render' | 'memory_usage';
export type RecommendationType = 'diagnosis' | 'medication' | 'examination';

// Core Data Models
export interface SessionInfo {
  sessionId: string;
  patientId?: string;
  patientName?: string;
  sessionType: SessionType;
  startTime: number;
  endTime?: number;
  status: SessionStatus;
  metadata?: Record<string, any>;
  createdAt?: number;
}

export interface MessageExtended {
  messageId: string;
  sessionId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
  tokenCount?: number;
  llmModel?: string;
  latencyMs?: number;
  createdAt?: number;
}

export interface FeedbackInfo {
  feedbackId?: string;
  sessionId: string;
  targetType: TargetType;
  targetId: string;
  feedbackType: FeedbackType;
  rating?: number;
  reason?: string;
  originalValue?: string;
  modifiedValue?: string;
  createdAt?: number;
}

export interface RecommendationExtended {
  recommendationId: string;
  sessionId: string;
  recType: RecommendationType;
  content: string | Record<string, any>;
  matched: boolean;
  matchConfidence?: number;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  createdAt?: number;
  // UI state
  feedback?: FeedbackInfo;
  adopted?: boolean;
}

export interface OperationLog {
  logId?: string;
  sessionId?: string;
  operationType: OperationType;
  operationName: string;
  details?: Record<string, any>;
  success?: boolean;
  durationMs?: number;
  createdAt?: number;
}

export interface PerformanceMetric {
  metricId?: string;
  sessionId?: string;
  metricType: MetricType;
  metricValue: number;
  unit: string;
  context?: Record<string, any>;
  createdAt?: number;
}

// Statistics Models
export interface SessionStatistics {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  cancelledSessions: number;
  errorSessions: number;
  avgDurationMs?: number;
  totalMessages: number;
  sessionsByType: Record<SessionType, number>;
  sessionsByDate: Array<{
    date: string;
    count: number;
  }>;
}

export interface FeedbackStatistics {
  totalFeedbacks: number;
  positiveCount: number;
  negativeCount: number;
  adoptedCount: number;
  rejectedCount: number;
  modifiedCount: number;
  avgRating?: number;
  feedbacksByTargetType: Record<TargetType, number>;
  positiveRate: number;
  adoptionRate: number;
}

export interface PerformanceStatistics {
  avgLlmLatencyMs?: number;
  avgApiLatencyMs?: number;
  avgUiRenderMs?: number;
  avgMemoryUsageMb?: number;
  p95LlmLatencyMs?: number;
  p95ApiLatencyMs?: number;
  totalTokenCount: number;
  metricsByType: Record<MetricType, {
    avg: number;
    min: number;
    max: number;
    count: number;
  }>;
}

// Export Format
export type ExportFormat = 'csv' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  startDate?: number;
  endDate?: number;
  includeMessages?: boolean;
  includeFeedbacks?: boolean;
  includeRecommendations?: boolean;
  includeLogs?: boolean;
  includeMetrics?: boolean;
}
