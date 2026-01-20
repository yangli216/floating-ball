-- Initial schema for feedback and tracking system
-- Created: 2026-01-20

-- Table: sessions
-- Stores consultation session metadata
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    patient_id TEXT,
    patient_name TEXT,
    session_type TEXT NOT NULL CHECK(session_type IN ('chat','consultation','voice','reception')),
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled','error')),
    metadata TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_type ON sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_sessions_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Table: messages
-- Stores chat messages with LLM performance metrics
CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
    content TEXT NOT NULL,
    images TEXT,
    token_count INTEGER,
    llm_model TEXT,
    latency_ms INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- Table: feedbacks
-- Stores user feedback on various targets (messages, diagnoses, medications, etc.)
CREATE TABLE IF NOT EXISTS feedbacks (
    feedback_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('message','diagnosis','medication','examination','record')),
    target_id TEXT NOT NULL,
    feedback_type TEXT NOT NULL CHECK(feedback_type IN ('positive','negative','adopted','rejected','modified')),
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    reason TEXT,
    original_value TEXT,
    modified_value TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_target ON feedbacks(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_session ON feedbacks(session_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created ON feedbacks(created_at);

-- Table: recommendations
-- Stores AI-generated recommendations with matching status
CREATE TABLE IF NOT EXISTS recommendations (
    recommendation_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    rec_type TEXT NOT NULL CHECK(rec_type IN ('diagnosis','medication','examination')),
    content TEXT NOT NULL,
    matched BOOLEAN NOT NULL DEFAULT 0,
    match_confidence REAL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    latency_ms INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendations_session ON recommendations(session_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(rec_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_matched ON recommendations(matched);
CREATE INDEX IF NOT EXISTS idx_recommendations_created ON recommendations(created_at);

-- Table: operation_logs
-- Stores user operation tracking for UX analysis
CREATE TABLE IF NOT EXISTS operation_logs (
    log_id TEXT PRIMARY KEY,
    session_id TEXT,
    operation_type TEXT NOT NULL CHECK(operation_type IN ('view_change','button_click','form_submit','api_call','error')),
    operation_name TEXT NOT NULL,
    details TEXT,
    success BOOLEAN NOT NULL DEFAULT 1,
    duration_ms INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operations_session ON operation_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_operations_type ON operation_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_operations_created ON operation_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_operations_success ON operation_logs(success);

-- Table: performance_metrics
-- Stores system performance metrics for monitoring
CREATE TABLE IF NOT EXISTS performance_metrics (
    metric_id TEXT PRIMARY KEY,
    session_id TEXT,
    metric_type TEXT NOT NULL CHECK(metric_type IN ('llm_latency','api_latency','ui_render','memory_usage')),
    metric_value REAL NOT NULL,
    unit TEXT NOT NULL,
    context TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_metrics_session ON performance_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON performance_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_metrics_created ON performance_metrics(created_at);
