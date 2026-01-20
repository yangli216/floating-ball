use serde::{Deserialize, Serialize};

// Session Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub session_id: String,
    pub patient_id: Option<String>,
    pub patient_name: Option<String>,
    pub session_type: String,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub status: String,
    pub metadata: Option<String>,
    pub created_at: i64,
}

// Message Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub message_id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub images: Option<String>,
    pub token_count: Option<i32>,
    pub llm_model: Option<String>,
    pub latency_ms: Option<i32>,
    pub created_at: i64,
}

// Feedback Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Feedback {
    pub feedback_id: String,
    pub session_id: String,
    pub target_type: String,
    pub target_id: String,
    pub feedback_type: String,
    pub rating: Option<i32>,
    pub reason: Option<String>,
    pub original_value: Option<String>,
    pub modified_value: Option<String>,
    pub created_at: i64,
}

// Recommendation Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Recommendation {
    pub recommendation_id: String,
    pub session_id: String,
    pub rec_type: String,
    pub content: String,
    pub matched: bool,
    pub match_confidence: Option<f64>,
    pub prompt_tokens: Option<i32>,
    pub completion_tokens: Option<i32>,
    pub latency_ms: Option<i32>,
    pub created_at: i64,
}

// Operation Log Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OperationLog {
    pub log_id: String,
    pub session_id: Option<String>,
    pub operation_type: String,
    pub operation_name: String,
    pub details: Option<String>,
    pub success: bool,
    pub duration_ms: Option<i32>,
    pub created_at: i64,
}

// Performance Metric Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PerformanceMetric {
    pub metric_id: String,
    pub session_id: Option<String>,
    pub metric_type: String,
    pub metric_value: f64,
    pub unit: String,
    pub context: Option<String>,
    pub created_at: i64,
}

// Statistics Types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionStatistics {
    pub total_sessions: i32,
    pub active_sessions: i32,
    pub completed_sessions: i32,
    pub cancelled_sessions: i32,
    pub error_sessions: i32,
    pub avg_duration_ms: Option<f64>,
    pub total_messages: i32,
    pub sessions_by_type: serde_json::Value,
    pub sessions_by_date: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FeedbackStatistics {
    pub total_feedbacks: i32,
    pub positive_count: i32,
    pub negative_count: i32,
    pub adopted_count: i32,
    pub rejected_count: i32,
    pub modified_count: i32,
    pub avg_rating: Option<f64>,
    pub feedbacks_by_target_type: serde_json::Value,
    pub positive_rate: f64,
    pub adoption_rate: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PerformanceStatistics {
    pub avg_llm_latency_ms: Option<f64>,
    pub avg_api_latency_ms: Option<f64>,
    pub avg_ui_render_ms: Option<f64>,
    pub avg_memory_usage_mb: Option<f64>,
    pub p95_llm_latency_ms: Option<f64>,
    pub p95_api_latency_ms: Option<f64>,
    pub total_token_count: i32,
    pub metrics_by_type: serde_json::Value,
}
