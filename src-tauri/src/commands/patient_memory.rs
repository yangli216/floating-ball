// Patient long-term memory: SQLite-backed implementation.
//
// 该模块为 next.md "智能记忆系统" 的桌面端持久化层。前端 (patientMemoryStore)
// 在医生确认提交后调用 `patient_memory_append_visit` 落库；下一次同患者接诊时
// 通过 `patient_memory_get` 取出最近 N 次摘要拼接到 LLM prompt + 安全复核。
//
// 设计要点：
// - 单独 db 文件 (`patient_memory.db`)，与现有 feedback.db / medical_catalog.db 解耦
// - 仅存结构化字段名（患者资料 / 诊断 / 药品 / 化验），不存原始转录，避免 PII 与体积膨胀
// - MAX_VISITS=5：插入后立即裁剪超出部分；HIS 重同步可整包覆盖
// - 慢病候选：在每次写入时基于剩余 visits 重算，并过滤明显急性诊断
// - 区域化平滑迁移：返回结构与前端 `PatientMemory` 完全对齐，未来切到区域服务端
//   (HTTP) 时只需替换前端 `patientMemoryBackend` 实现，无需变更调用方

use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Manager};
use uuid::Uuid;

const MAX_VISITS: usize = 5;
const MAX_ALLERGY_ITEMS: usize = 20;
const MAX_CHRONIC_CANDIDATES: usize = 8;
const CHRONIC_THRESHOLD: usize = 2;
const ACUTE_DIAGNOSIS_KEYWORDS: [&str; 16] = [
    "急性",
    "上呼吸道感染",
    "呼吸道感染",
    "感染",
    "感冒",
    "肺炎",
    "支气管炎",
    "咽炎",
    "扁桃体炎",
    "发热",
    "腹泻",
    "胃肠炎",
    "外伤",
    "挫伤",
    "术后",
    "复查",
];

pub struct PatientMemoryDbConnection(Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientProfileDto {
    pub patient_id: String,
    pub name: Option<String>,
    pub gender: Option<String>,
    pub age: Option<i64>,
    pub age_text: Option<String>,
    pub id_no: Option<String>,
    pub mobile_phone: Option<String>,
    pub insurance_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientVisitSummaryDto {
    pub completed_at: i64,
    pub chief_complaint: String,
    pub primary_diagnosis: Option<String>,
    pub diagnoses: Vec<String>,
    pub medications: Vec<String>,
    pub lab_tests: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientMemoryDto {
    pub patient_id: String,
    pub patient_profile: Option<PatientProfileDto>,
    pub allergy_history: Vec<String>,
    pub chronic_diagnosis_candidates: Vec<String>,
    pub recent_visits: Vec<PatientVisitSummaryDto>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatientMemoryDebugStateDto {
    pub db_path: String,
    pub patient_count: i64,
    pub visit_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendVisitInput {
    pub patient_id: String,
    pub visit: PatientVisitSummaryDto,
    pub allergy_history_text: Option<String>,
    pub patient_profile: Option<PatientProfileDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceSnapshotInput {
    pub patient_id: String,
    pub patient_profile: Option<PatientProfileDto>,
    pub allergy_history: Vec<String>,
    pub chronic_diagnosis_candidates: Vec<String>,
    pub recent_visits: Vec<PatientVisitSummaryDto>,
    pub updated_at: Option<i64>,
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    app_data_dir.join("patient_memory.db")
}

fn current_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn table_has_column(conn: &Connection, table_name: &str, column_name: &str) -> SqlResult<bool> {
    let sql = format!("PRAGMA table_info({table_name})");
    let mut stmt = conn.prepare(sql.as_str())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for row in rows {
        if row? == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_patient_profile_column(conn: &Connection) -> SqlResult<()> {
    if !table_has_column(conn, "patient_memory", "patient_profile_json")? {
        conn.execute("ALTER TABLE patient_memory ADD COLUMN patient_profile_json TEXT", [])?;
    }
    Ok(())
}

pub fn init_database(app: &AppHandle) -> SqlResult<()> {
    let db_path = get_db_path(app);
    println!("[PatientMemory] Database path: {:?}", db_path);
    let conn = Connection::open(&db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let migration_sql = include_str!("../../migrations/002_patient_memory_schema.sql");
    conn.execute_batch(migration_sql)?;
    ensure_patient_profile_column(&conn)?;

    app.manage(PatientMemoryDbConnection(Mutex::new(conn)));
    println!("[PatientMemory] Database initialized");
    Ok(())
}

fn parse_str_array(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

fn serialize_str_array(items: &[String]) -> String {
    serde_json::to_string(items).unwrap_or_else(|_| "[]".to_string())
}

fn parse_patient_profile(raw: Option<String>) -> Option<PatientProfileDto> {
    raw.and_then(|value| serde_json::from_str::<PatientProfileDto>(&value).ok())
}

fn serialize_patient_profile(profile: Option<&PatientProfileDto>) -> Option<String> {
    profile.and_then(|value| serde_json::to_string(value).ok())
}

fn normalize_id(patient_id: &str) -> Option<String> {
    let trimmed = patient_id.trim();
    if trimmed.is_empty() || trimmed == "unknown" {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn load_visits(conn: &Connection, patient_id: &str) -> rusqlite::Result<Vec<PatientVisitSummaryDto>> {
    let mut stmt = conn.prepare(
        "SELECT completed_at, chief_complaint, primary_diagnosis, diagnoses, medications, lab_tests
         FROM patient_visits
         WHERE patient_id = ?1
         ORDER BY completed_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![patient_id, MAX_VISITS as i64], |row| {
        Ok(PatientVisitSummaryDto {
            completed_at: row.get(0)?,
            chief_complaint: row.get::<_, String>(1)?,
            primary_diagnosis: row.get::<_, Option<String>>(2)?,
            diagnoses: parse_str_array(&row.get::<_, String>(3)?),
            medications: parse_str_array(&row.get::<_, String>(4)?),
            lab_tests: parse_str_array(&row.get::<_, String>(5)?),
        })
    })?;
    rows.collect()
}

fn load_memory_inner(conn: &Connection, patient_id: &str) -> Result<Option<PatientMemoryDto>, String> {
    let head: Option<(Option<String>, String, String, i64)> = conn
        .query_row(
            "SELECT patient_profile_json, allergy_history, chronic_diagnoses, updated_at FROM patient_memory WHERE patient_id = ?1",
            params![patient_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .map_err(|e| e.to_string())?;

    let Some((profile_raw, allergy_raw, chronic_raw, updated_at)) = head else {
        return Ok(None);
    };

    let visits = load_visits(conn, patient_id).map_err(|e| e.to_string())?;
    Ok(Some(PatientMemoryDto {
        patient_id: patient_id.to_string(),
        patient_profile: parse_patient_profile(profile_raw),
        allergy_history: parse_str_array(&allergy_raw),
        chronic_diagnosis_candidates: parse_str_array(&chronic_raw),
        recent_visits: visits,
        updated_at,
    }))
}

fn is_probable_chronic_diagnosis(value: &str) -> bool {
    let normalized = value.trim();
    !normalized.is_empty() && !ACUTE_DIAGNOSIS_KEYWORDS.iter().any(|keyword| normalized.contains(keyword))
}

fn derive_chronic_candidates(visits: &[PatientVisitSummaryDto]) -> Vec<String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for visit in visits {
        let mut seen_in_visit: HashSet<&str> = HashSet::new();
        for diag in &visit.diagnoses {
            let trimmed = diag.trim();
            if trimmed.is_empty() || !is_probable_chronic_diagnosis(trimmed) {
                continue;
            }
            if seen_in_visit.insert(trimmed) {
                *counts.entry(trimmed.to_string()).or_insert(0) += 1;
            }
        }
    }
    let mut sorted: Vec<(String, usize)> = counts
        .into_iter()
        .filter(|(_, c)| *c >= CHRONIC_THRESHOLD)
        .collect();
    sorted.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    sorted
        .into_iter()
        .take(MAX_CHRONIC_CANDIDATES)
        .map(|(name, _)| name)
        .collect()
}

fn merge_allergy(prev: &[String], new_text: Option<&str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let push = |s: &str, sink: &mut Vec<String>, seen: &mut HashSet<String>| {
        let t = s.trim();
        if t.is_empty() {
            return;
        }
        let key = t.to_lowercase();
        if seen.contains(&key) {
            return;
        }
        if matches!(key.as_str(), "无" | "否认" | "未发现" | "none" | "nkda") {
            return;
        }
        seen.insert(key);
        sink.push(t.to_string());
    };

    for item in prev {
        push(item, &mut out, &mut seen);
    }
    if let Some(text) = new_text {
        for raw in text.split(|c: char| matches!(c, '、' | ',' | '，' | ';' | '；' | '\n')) {
            push(raw, &mut out, &mut seen);
        }
    }
    if out.len() > MAX_ALLERGY_ITEMS {
        out.truncate(MAX_ALLERGY_ITEMS);
    }
    out
}

fn normalize_string_list(values: &[String], max_len: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for value in values {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.to_lowercase();
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        out.push(trimmed.to_string());
        if out.len() >= max_len {
            break;
        }
    }
    out
}

fn upsert_memory_head(
    tx: &rusqlite::Transaction<'_>,
    patient_id: &str,
    allergy_history: &[String],
    chronic_diagnoses: &[String],
    patient_profile: Option<&PatientProfileDto>,
    updated_at: i64,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO patient_memory (patient_id, patient_profile_json, allergy_history, chronic_diagnoses, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(patient_id) DO UPDATE SET
             patient_profile_json = COALESCE(excluded.patient_profile_json, patient_memory.patient_profile_json),
             allergy_history = excluded.allergy_history,
             chronic_diagnoses = excluded.chronic_diagnoses,
             updated_at = excluded.updated_at",
        params![
            patient_id,
            serialize_patient_profile(patient_profile),
            serialize_str_array(allergy_history),
            serialize_str_array(chronic_diagnoses),
            updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn replace_visits(
    tx: &rusqlite::Transaction<'_>,
    patient_id: &str,
    visits: &[PatientVisitSummaryDto],
) -> Result<(), String> {
    tx.execute("DELETE FROM patient_visits WHERE patient_id = ?1", params![patient_id])
        .map_err(|e| e.to_string())?;

    for visit in visits.iter().take(MAX_VISITS) {
        let visit_id = Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO patient_visits
                (visit_id, patient_id, completed_at, chief_complaint, primary_diagnosis,
                 diagnoses, medications, lab_tests)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                visit_id,
                patient_id,
                visit.completed_at,
                visit.chief_complaint,
                visit.primary_diagnosis,
                serialize_str_array(&visit.diagnoses),
                serialize_str_array(&visit.medications),
                serialize_str_array(&visit.lab_tests),
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[command]
pub async fn patient_memory_get(app: AppHandle, patient_id: String) -> Result<Option<PatientMemoryDto>, String> {
    let Some(pid) = normalize_id(&patient_id) else {
        return Ok(None);
    };
    let db = app.state::<PatientMemoryDbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    load_memory_inner(&conn, &pid)
}

#[command]
pub async fn patient_memory_get_debug_state(app: AppHandle) -> Result<PatientMemoryDebugStateDto, String> {
    let db_path = get_db_path(&app);
    let db = app.state::<PatientMemoryDbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let patient_count = conn
        .query_row("SELECT COUNT(*) FROM patient_memory", [], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let visit_count = conn
        .query_row("SELECT COUNT(*) FROM patient_visits", [], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;

    Ok(PatientMemoryDebugStateDto {
        db_path: db_path.to_string_lossy().to_string(),
        patient_count,
        visit_count,
    })
}

#[command]
pub async fn patient_memory_append_visit(
    app: AppHandle,
    input: AppendVisitInput,
) -> Result<Option<PatientMemoryDto>, String> {
    let Some(pid) = normalize_id(&input.patient_id) else {
        return Ok(None);
    };
    let db = app.state::<PatientMemoryDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = current_timestamp_ms();

    let prev = load_memory_inner(&conn, &pid)?;
    let prev_allergy: Vec<String> = prev.as_ref().map(|m| m.allergy_history.clone()).unwrap_or_default();
    let merged_allergy = merge_allergy(&prev_allergy, input.allergy_history_text.as_deref());

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    upsert_memory_head(
        &tx,
        &pid,
        &merged_allergy,
        &[],
        input.patient_profile.as_ref(),
        now,
    )?;

    let visit_id = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO patient_visits
            (visit_id, patient_id, completed_at, chief_complaint, primary_diagnosis,
             diagnoses, medications, lab_tests)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            visit_id,
            &pid,
            input.visit.completed_at,
            input.visit.chief_complaint,
            input.visit.primary_diagnosis,
            serialize_str_array(&input.visit.diagnoses),
            serialize_str_array(&input.visit.medications),
            serialize_str_array(&input.visit.lab_tests),
        ],
    )
    .map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM patient_visits
         WHERE patient_id = ?1
           AND visit_id NOT IN (
               SELECT visit_id FROM patient_visits
               WHERE patient_id = ?1
               ORDER BY completed_at DESC
               LIMIT ?2
           )",
        params![&pid, MAX_VISITS as i64],
    )
    .map_err(|e| e.to_string())?;

    let visits_after = load_visits(&tx, &pid).map_err(|e| e.to_string())?;
    let chronic = derive_chronic_candidates(&visits_after);
    tx.execute(
        "UPDATE patient_memory SET chronic_diagnoses = ?1, updated_at = ?2 WHERE patient_id = ?3",
        params![serialize_str_array(&chronic), now, &pid],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    load_memory_inner(&conn, &pid)
}

#[command]
pub async fn patient_memory_replace_snapshot(
    app: AppHandle,
    input: ReplaceSnapshotInput,
) -> Result<Option<PatientMemoryDto>, String> {
    let Some(pid) = normalize_id(&input.patient_id) else {
        return Ok(None);
    };
    let db = app.state::<PatientMemoryDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let updated_at = input.updated_at.unwrap_or_else(current_timestamp_ms);

    let allergy_history = normalize_string_list(&input.allergy_history, MAX_ALLERGY_ITEMS)
        .into_iter()
        .filter(|item| !matches!(item.to_lowercase().as_str(), "无" | "否认" | "未发现" | "none" | "nkda"))
        .collect::<Vec<_>>();
    let chronic_diagnoses = normalize_string_list(&input.chronic_diagnosis_candidates, MAX_CHRONIC_CANDIDATES)
        .into_iter()
        .filter(|item| is_probable_chronic_diagnosis(item))
        .collect::<Vec<_>>();
    let mut recent_visits = input.recent_visits;
    recent_visits.sort_by(|left, right| right.completed_at.cmp(&left.completed_at));
    recent_visits.truncate(MAX_VISITS);

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    upsert_memory_head(
        &tx,
        &pid,
        &allergy_history,
        &chronic_diagnoses,
        input.patient_profile.as_ref(),
        updated_at,
    )?;
    replace_visits(&tx, &pid, &recent_visits)?;
    tx.commit().map_err(|e| e.to_string())?;

    load_memory_inner(&conn, &pid)
}

#[command]
pub async fn patient_memory_clear(app: AppHandle, patient_id: String) -> Result<(), String> {
    let Some(pid) = normalize_id(&patient_id) else {
        return Ok(());
    };
    let db = app.state::<PatientMemoryDbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM patient_memory WHERE patient_id = ?1", params![&pid])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn patient_memory_clear_all(app: AppHandle) -> Result<(), String> {
    let db = app.state::<PatientMemoryDbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM patient_memory", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}
