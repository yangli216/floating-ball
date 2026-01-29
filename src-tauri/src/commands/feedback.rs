use rusqlite::{params, Connection, Result as SqlResult};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Manager};
use uuid::Uuid;

use crate::db::models::*;

// Database connection manager
#[allow(dead_code)]
pub struct DbConnection(Mutex<Connection>);

#[allow(dead_code)]
impl DbConnection {
    pub fn new(db_path: PathBuf) -> SqlResult<Self> {
        let conn = Connection::open(db_path)?;
        Ok(DbConnection(Mutex::new(conn)))
    }
}

// Helper to get database path
fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    println!("[Feedback] App data dir: {:?}", app_data_dir);
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    let db_path = app_data_dir.join("feedback.db");
    println!("[Feedback] Database path: {:?}", db_path);
    db_path
}

// Helper to initialize database
pub fn init_database(app: &AppHandle) -> SqlResult<()> {
    println!("[Feedback] Starting database initialization...");
    let db_path = get_db_path(app);

    println!("[Feedback] Opening database connection...");
    let conn = Connection::open(&db_path)?;
    println!("[Feedback] Database connection opened successfully");

    // Run migrations
    let migration_sql = include_str!("../../migrations/001_initial_schema.sql");
    println!(
        "[Feedback] Running migrations (SQL length: {} bytes)...",
        migration_sql.len()
    );
    conn.execute_batch(migration_sql)?;
    println!("[Feedback] Migrations completed successfully");

    // Store connection in app state
    app.manage(DbConnection(Mutex::new(conn)));
    println!("[Feedback] Database connection stored in app state");

    Ok(())
}

// Helper function to get current Unix timestamp
fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

// Session Management Commands

#[command]
pub async fn create_session(
    app: AppHandle,
    session_type: String,
    patient_id: Option<String>,
    patient_name: Option<String>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    let start_time = current_timestamp();

    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO sessions (session_id, patient_id, patient_name, session_type, start_time, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6)",
        params![
            &session_id,
            &patient_id,
            &patient_name,
            &session_type,
            start_time,
            start_time
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(session_id)
}

#[command]
pub async fn update_session_status(
    app: AppHandle,
    session_id: String,
    status: String,
    end_time: Option<i64>,
) -> Result<(), String> {
    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let actual_end_time = end_time.unwrap_or_else(current_timestamp);

    conn.execute(
        "UPDATE sessions SET status = ?1, end_time = ?2 WHERE session_id = ?3",
        params![&status, actual_end_time, &session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Message Management Commands

#[command]
#[allow(clippy::too_many_arguments)]
pub async fn save_message(
    app: AppHandle,
    session_id: String,
    role: String,
    content: String,
    images: Option<String>,
    token_count: Option<i32>,
    llm_model: Option<String>,
    latency_ms: Option<i32>,
) -> Result<String, String> {
    let message_id = Uuid::new_v4().to_string();
    let created_at = current_timestamp();

    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO messages (message_id, session_id, role, content, images, token_count, llm_model, latency_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            &message_id,
            &session_id,
            &role,
            &content,
            &images,
            &token_count,
            &llm_model,
            &latency_ms,
            created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(message_id)
}

// Feedback Management Commands

#[command]
#[allow(clippy::too_many_arguments)]
pub async fn save_feedback(
    app: AppHandle,
    session_id: String,
    target_type: String,
    target_id: String,
    feedback_type: String,
    rating: Option<i32>,
    reason: Option<String>,
    original_value: Option<String>,
    modified_value: Option<String>,
) -> Result<String, String> {
    let feedback_id = Uuid::new_v4().to_string();
    let created_at = current_timestamp();

    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO feedbacks (feedback_id, session_id, target_type, target_id, feedback_type, rating, reason, original_value, modified_value, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            &feedback_id,
            &session_id,
            &target_type,
            &target_id,
            &feedback_type,
            &rating,
            &reason,
            &original_value,
            &modified_value,
            created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(feedback_id)
}

// Recommendation Management Commands

#[command]
#[allow(clippy::too_many_arguments)]
pub async fn save_recommendation(
    app: AppHandle,
    session_id: String,
    rec_type: String,
    content: String,
    matched: bool,
    match_confidence: Option<f64>,
    prompt_tokens: Option<i32>,
    completion_tokens: Option<i32>,
    latency_ms: Option<i32>,
) -> Result<String, String> {
    let recommendation_id = Uuid::new_v4().to_string();
    let created_at = current_timestamp();

    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO recommendations (recommendation_id, session_id, rec_type, content, matched, match_confidence, prompt_tokens, completion_tokens, latency_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            &recommendation_id,
            &session_id,
            &rec_type,
            &content,
            matched,
            &match_confidence,
            &prompt_tokens,
            &completion_tokens,
            &latency_ms,
            created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(recommendation_id)
}

// Operation Log Commands

#[command]
pub async fn log_operation(
    app: AppHandle,
    session_id: Option<String>,
    operation_type: String,
    operation_name: String,
    details: Option<String>,
    success: bool,
    duration_ms: Option<i32>,
) -> Result<(), String> {
    let log_id = Uuid::new_v4().to_string();
    let created_at = current_timestamp();

    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO operation_logs (log_id, session_id, operation_type, operation_name, details, success, duration_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            &log_id,
            &session_id,
            &operation_type,
            &operation_name,
            &details,
            success,
            &duration_ms,
            created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Performance Metric Commands

#[command]
pub async fn record_performance_metric(
    app: AppHandle,
    session_id: Option<String>,
    metric_type: String,
    metric_value: f64,
    unit: String,
    context: Option<String>,
) -> Result<(), String> {
    let metric_id = Uuid::new_v4().to_string();
    let created_at = current_timestamp();

    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO performance_metrics (metric_id, session_id, metric_type, metric_value, unit, context, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            &metric_id,
            &session_id,
            &metric_type,
            metric_value,
            &unit,
            &context,
            created_at
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// Statistics Query Commands

#[command]
pub async fn get_session_statistics(
    app: AppHandle,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<SessionStatistics, String> {
    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let (date_filter, params_vec) = match (start_date, end_date) {
        (Some(start), Some(end)) => (
            "WHERE start_time BETWEEN ?1 AND ?2".to_string(),
            vec![start, end],
        ),
        (Some(start), None) => ("WHERE start_time >= ?1".to_string(), vec![start]),
        (None, Some(end)) => ("WHERE start_time <= ?1".to_string(), vec![end]),
        (None, None) => (String::new(), vec![]),
    };

    // Get basic statistics
    let query = format!(
        "SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
            SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
            SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as error,
            AVG(CASE WHEN end_time IS NOT NULL THEN (end_time - start_time) * 1000 ELSE NULL END) as avg_duration
         FROM sessions {}",
        date_filter
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    let stats = stmt
        .query_row(&params_refs[..], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, Option<f64>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    // Get message count
    let msg_query = format!(
        "SELECT COUNT(*) FROM messages WHERE session_id IN (SELECT session_id FROM sessions {})",
        date_filter
    );
    let mut msg_stmt = conn.prepare(&msg_query).map_err(|e| e.to_string())?;
    let total_messages: i32 = msg_stmt
        .query_row(&params_refs[..], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // Get sessions by type
    let type_query = format!(
        "SELECT session_type, COUNT(*) as count FROM sessions {} GROUP BY session_type",
        date_filter
    );
    let mut type_stmt = conn.prepare(&type_query).map_err(|e| e.to_string())?;
    let mut rows = type_stmt
        .query(&params_refs[..])
        .map_err(|e| e.to_string())?;

    let mut sessions_by_type = serde_json::Map::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let session_type: String = row.get(0).map_err(|e| e.to_string())?;
        let count: i32 = row.get(1).map_err(|e| e.to_string())?;
        sessions_by_type.insert(session_type, json!(count));
    }

    Ok(SessionStatistics {
        total_sessions: stats.0,
        active_sessions: stats.1,
        completed_sessions: stats.2,
        cancelled_sessions: stats.3,
        error_sessions: stats.4,
        avg_duration_ms: stats.5,
        total_messages,
        sessions_by_type: json!(sessions_by_type),
        sessions_by_date: json!([]),
    })
}

#[command]
pub async fn get_feedback_statistics(
    app: AppHandle,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<FeedbackStatistics, String> {
    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let (date_filter, params_vec) = match (start_date, end_date) {
        (Some(start), Some(end)) => (
            "WHERE created_at BETWEEN ?1 AND ?2".to_string(),
            vec![start, end],
        ),
        (Some(start), None) => ("WHERE created_at >= ?1".to_string(), vec![start]),
        (None, Some(end)) => ("WHERE created_at <= ?1".to_string(), vec![end]),
        (None, None) => (String::new(), vec![]),
    };

    let query = format!(
        "SELECT
            COUNT(*) as total,
            SUM(CASE WHEN feedback_type='positive' THEN 1 ELSE 0 END) as positive,
            SUM(CASE WHEN feedback_type='negative' THEN 1 ELSE 0 END) as negative,
            SUM(CASE WHEN feedback_type='adopted' THEN 1 ELSE 0 END) as adopted,
            SUM(CASE WHEN feedback_type='rejected' THEN 1 ELSE 0 END) as rejected,
            SUM(CASE WHEN feedback_type='modified' THEN 1 ELSE 0 END) as modified,
            AVG(rating) as avg_rating
         FROM feedbacks {}",
        date_filter
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    let stats = stmt
        .query_row(&params_refs[..], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, i32>(2)?,
                row.get::<_, i32>(3)?,
                row.get::<_, i32>(4)?,
                row.get::<_, i32>(5)?,
                row.get::<_, Option<f64>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let total = stats.0;
    let positive = stats.1;
    let adopted = stats.3;

    let positive_rate = if total > 0 {
        positive as f64 / total as f64
    } else {
        0.0
    };
    let adoption_rate = if total > 0 {
        adopted as f64 / total as f64
    } else {
        0.0
    };

    // Get feedbacks by target type
    let type_query = format!(
        "SELECT target_type, COUNT(*) as count FROM feedbacks {} GROUP BY target_type",
        date_filter
    );
    let mut type_stmt = conn.prepare(&type_query).map_err(|e| e.to_string())?;
    let mut rows = type_stmt
        .query(&params_refs[..])
        .map_err(|e| e.to_string())?;

    let mut feedbacks_by_target_type = serde_json::Map::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let target_type: String = row.get(0).map_err(|e| e.to_string())?;
        let count: i32 = row.get(1).map_err(|e| e.to_string())?;
        feedbacks_by_target_type.insert(target_type, json!(count));
    }

    Ok(FeedbackStatistics {
        total_feedbacks: total,
        positive_count: positive,
        negative_count: stats.2,
        adopted_count: adopted,
        rejected_count: stats.4,
        modified_count: stats.5,
        avg_rating: stats.6,
        feedbacks_by_target_type: json!(feedbacks_by_target_type),
        positive_rate,
        adoption_rate,
    })
}

#[command]
pub async fn get_performance_statistics(
    app: AppHandle,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<PerformanceStatistics, String> {
    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let (date_filter, params_vec) = match (start_date, end_date) {
        (Some(start), Some(end)) => (
            "WHERE created_at BETWEEN ?1 AND ?2".to_string(),
            vec![start, end],
        ),
        (Some(start), None) => ("WHERE created_at >= ?1".to_string(), vec![start]),
        (None, Some(end)) => ("WHERE created_at <= ?1".to_string(), vec![end]),
        (None, None) => (String::new(), vec![]),
    };

    let query = format!(
        "SELECT
            AVG(CASE WHEN metric_type='llm_latency' THEN metric_value ELSE NULL END) as avg_llm,
            AVG(CASE WHEN metric_type='api_latency' THEN metric_value ELSE NULL END) as avg_api,
            AVG(CASE WHEN metric_type='ui_render' THEN metric_value ELSE NULL END) as avg_ui,
            AVG(CASE WHEN metric_type='memory_usage' THEN metric_value ELSE NULL END) as avg_memory
         FROM performance_metrics {}",
        date_filter
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    let stats = stmt
        .query_row(&params_refs[..], |row| {
            Ok((
                row.get::<_, Option<f64>>(0)?,
                row.get::<_, Option<f64>>(1)?,
                row.get::<_, Option<f64>>(2)?,
                row.get::<_, Option<f64>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    // Get token count from messages
    let date_filter_sessions = date_filter.replace("created_at", "start_time");
    let token_query = format!(
        "SELECT SUM(token_count) FROM messages WHERE session_id IN (SELECT session_id FROM sessions {})",
        date_filter_sessions
    );
    let mut token_stmt = conn.prepare(&token_query).map_err(|e| e.to_string())?;
    let total_tokens: Option<i32> = token_stmt
        .query_row(&params_refs[..], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(PerformanceStatistics {
        avg_llm_latency_ms: stats.0,
        avg_api_latency_ms: stats.1,
        avg_ui_render_ms: stats.2,
        avg_memory_usage_mb: stats.3,
        p95_llm_latency_ms: None,
        p95_api_latency_ms: None,
        total_token_count: total_tokens.unwrap_or(0),
        metrics_by_type: json!({}),
    })
}

// Export Data Command

#[command]
pub async fn export_data(
    app: AppHandle,
    format: String,
    start_date: Option<i64>,
    end_date: Option<i64>,
) -> Result<String, String> {
    let db = app.state::<DbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let (date_filter, params_vec) = match (start_date, end_date) {
        (Some(start), Some(end)) => (
            "WHERE start_time BETWEEN ?1 AND ?2".to_string(),
            vec![start, end],
        ),
        (Some(start), None) => ("WHERE start_time >= ?1".to_string(), vec![start]),
        (None, Some(end)) => ("WHERE start_time <= ?1".to_string(), vec![end]),
        (None, None) => (String::new(), vec![]),
    };

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec
        .iter()
        .map(|p| p as &dyn rusqlite::ToSql)
        .collect();

    // Get sessions
    let sessions_query = format!("SELECT * FROM sessions {}", date_filter);
    let mut sessions_stmt = conn.prepare(&sessions_query).map_err(|e| e.to_string())?;
    let mut sessions_rows = sessions_stmt
        .query(&params_refs[..])
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    while let Some(row) = sessions_rows.next().map_err(|e| e.to_string())? {
        sessions.push(json!({
            "session_id": row.get::<_, String>(0).map_err(|e| e.to_string())?,
            "patient_id": row.get::<_, Option<String>>(1).map_err(|e| e.to_string())?,
            "patient_name": row.get::<_, Option<String>>(2).map_err(|e| e.to_string())?,
            "session_type": row.get::<_, String>(3).map_err(|e| e.to_string())?,
            "start_time": row.get::<_, i64>(4).map_err(|e| e.to_string())?,
            "end_time": row.get::<_, Option<i64>>(5).map_err(|e| e.to_string())?,
            "status": row.get::<_, String>(6).map_err(|e| e.to_string())?,
        }));
    }

    // Get messages
    let messages_query = format!(
        "SELECT * FROM messages WHERE session_id IN (SELECT session_id FROM sessions {})",
        date_filter
    );
    let mut messages_stmt = conn.prepare(&messages_query).map_err(|e| e.to_string())?;
    let mut messages_rows = messages_stmt
        .query(&params_refs[..])
        .map_err(|e| e.to_string())?;

    let mut messages = Vec::new();
    while let Some(row) = messages_rows.next().map_err(|e| e.to_string())? {
        messages.push(json!({
            "message_id": row.get::<_, String>(0).map_err(|e| e.to_string())?,
            "session_id": row.get::<_, String>(1).map_err(|e| e.to_string())?,
            "role": row.get::<_, String>(2).map_err(|e| e.to_string())?,
            "content": row.get::<_, String>(3).map_err(|e| e.to_string())?,
        }));
    }

    // Get feedbacks
    let feedbacks_query = format!(
        "SELECT * FROM feedbacks WHERE session_id IN (SELECT session_id FROM sessions {})",
        date_filter
    );
    let mut feedbacks_stmt = conn.prepare(&feedbacks_query).map_err(|e| e.to_string())?;
    let mut feedbacks_rows = feedbacks_stmt
        .query(&params_refs[..])
        .map_err(|e| e.to_string())?;

    let mut feedbacks = Vec::new();
    while let Some(row) = feedbacks_rows.next().map_err(|e| e.to_string())? {
        feedbacks.push(json!({
            "feedback_id": row.get::<_, String>(0).map_err(|e| e.to_string())?,
            "session_id": row.get::<_, String>(1).map_err(|e| e.to_string())?,
            "target_type": row.get::<_, String>(2).map_err(|e| e.to_string())?,
            "target_id": row.get::<_, String>(3).map_err(|e| e.to_string())?,
            "feedback_type": row.get::<_, String>(4).map_err(|e| e.to_string())?,
        }));
    }

    let export_data = json!({
        "exportDate": current_timestamp(),
        "format": format,
        "dateRange": {
            "start": start_date,
            "end": end_date
        },
        "sessions": sessions,
        "messages": messages,
        "feedbacks": feedbacks
    });

    Ok(export_data.to_string())
}
