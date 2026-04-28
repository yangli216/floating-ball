use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{command, AppHandle, Manager};

pub struct MedicalCatalogDbConnection(Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalCatalogSyncStateEntry {
    pub catalog_type: String,
    pub org_code: String,
    pub last_sync_at: i64,
    pub sync_date: Option<String>,
    pub row_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalCatalogDebugState {
    pub db_path: String,
    pub diagnosis_count: i64,
    pub item_count: i64,
    pub medicine_count: i64,
    pub sync_states: Vec<MedicalCatalogSyncStateEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalCatalogClearResult {
    pub diagnosis_rows: usize,
    pub item_rows: usize,
    pub medicine_rows: usize,
    pub sync_state_rows: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosisCatalogEntry {
    pub id: String,
    pub code: String,
    pub name: String,
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalItemCatalogEntry {
    pub id: String,
    pub code: String,
    pub name: String,
    pub category: String,
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicineCatalogEntry {
    pub id: String,
    pub code: Option<String>,
    pub name: String,
    pub spec: String,
    /// 该药品在哪些发药药房目录中出现（org_code/idSto 列表）。
    /// 为空时不参与药品匹配，也不写入任一药房 scope。
    #[serde(default)]
    pub store_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MedicalCatalogSnapshot {
    pub diagnoses: Vec<DiagnosisCatalogEntry>,
    pub diagnosis_synced_at: Option<i64>,
    pub items: Vec<MedicalItemCatalogEntry>,
    pub item_sync_date: Option<String>,
    pub medicines: Vec<MedicineCatalogEntry>,
    pub medicine_sync_date: Option<String>,
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_data_dir).expect("Failed to create app data directory");
    app_data_dir.join("medical_catalog.db")
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn ensure_medical_catalog_access(app: &AppHandle) -> Result<(), String> {
    crate::ensure_desktop_service_access(app).map(|_| ())
}

pub fn init_database(app: &AppHandle) -> SqlResult<()> {
    let db_path = get_db_path(app);
    let mut conn = Connection::open(&db_path)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS diagnosis_catalog (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            keywords_json TEXT,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS medical_item_catalog (
            org_code TEXT NOT NULL,
            id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            keywords_json TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (org_code, id)
        );

        CREATE TABLE IF NOT EXISTS medicine_catalog (
            org_code TEXT NOT NULL,
            id TEXT NOT NULL,
            code TEXT,
            name TEXT NOT NULL,
            spec TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (org_code, id)
        );

        CREATE TABLE IF NOT EXISTS catalog_sync_state (
            catalog_type TEXT NOT NULL,
            org_code TEXT NOT NULL DEFAULT '',
            last_sync_at INTEGER NOT NULL,
            sync_date TEXT,
            row_count INTEGER NOT NULL,
            PRIMARY KEY (catalog_type, org_code)
        );

        CREATE INDEX IF NOT EXISTS idx_diagnosis_code ON diagnosis_catalog(code);
        CREATE INDEX IF NOT EXISTS idx_diagnosis_name ON diagnosis_catalog(name);
        CREATE INDEX IF NOT EXISTS idx_medical_item_org_category ON medical_item_catalog(org_code, category);
        CREATE INDEX IF NOT EXISTS idx_medical_item_name ON medical_item_catalog(name);
        CREATE INDEX IF NOT EXISTS idx_medicine_org_name ON medicine_catalog(org_code, name);
        "
    )?;

    migrate_legacy_combined_medicine_scopes(&mut conn)
        .map_err(rusqlite::Error::InvalidParameterName)?;

    app.manage(MedicalCatalogDbConnection(Mutex::new(conn)));
    Ok(())
}

fn serialize_keywords(keywords: &Option<Vec<String>>) -> Result<Option<String>, String> {
    keywords
        .as_ref()
        .map(|items| serde_json::to_string(items).map_err(|e| e.to_string()))
        .transpose()
}

fn deserialize_keywords(raw: Option<String>) -> Option<Vec<String>> {
    raw.and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
}

fn parse_scope_codes(raw: &str) -> Vec<String> {
    let normalized = raw.trim();
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut scopes = Vec::new();
    for code in normalized.split(',').map(str::trim) {
        if code.is_empty() {
            continue;
        }
        if !scopes.iter().any(|existing| existing == code) {
            scopes.push(code.to_string());
        }
    }
    scopes
}

fn migrate_legacy_combined_medicine_scopes(conn: &mut Connection) -> Result<(), String> {
    let legacy_scope_keys = {
        let mut stmt = conn
            .prepare(
                "SELECT org_code FROM medicine_catalog WHERE instr(org_code, ',') > 0
                 UNION
                 SELECT org_code FROM catalog_sync_state
                 WHERE catalog_type = 'medicines' AND instr(org_code, ',') > 0
                 ORDER BY org_code",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    if legacy_scope_keys.is_empty() {
        return Ok(());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for legacy_scope_key in legacy_scope_keys {
        let scope_codes = parse_scope_codes(legacy_scope_key.as_str());
        if scope_codes.len() <= 1 {
            continue;
        }

        let legacy_items = {
            let mut stmt = tx
                .prepare(
                    "SELECT id, code, name, spec
                     FROM medicine_catalog
                     WHERE org_code = ?1
                     ORDER BY name, spec",
                )
                .map_err(|e| e.to_string())?;

            let rows = stmt
                .query_map(params![legacy_scope_key.as_str()], |row| {
                    Ok(MedicineCatalogEntry {
                        id: row.get(0)?,
                        code: row.get(1)?,
                        name: row.get(2)?,
                        spec: row.get(3)?,
                        store_ids: Vec::new(),
                    })
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };

        let (_, legacy_sync_date) = get_sync_state(&tx, "medicines", legacy_scope_key.as_str())?;

        for scope_code in &scope_codes {
            {
                let mut insert_stmt = tx
                    .prepare(
                        "INSERT OR IGNORE INTO medicine_catalog (org_code, id, code, name, spec, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    )
                    .map_err(|e| e.to_string())?;

                for item in &legacy_items {
                    insert_stmt
                        .execute(params![
                            scope_code.as_str(),
                            item.id,
                            item.code,
                            item.name,
                            item.spec,
                            current_timestamp()
                        ])
                        .map_err(|e| e.to_string())?;
                }
            }

            let scope_state_exists = tx
                .query_row(
                    "SELECT 1 FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1 LIMIT 1",
                    params![scope_code.as_str()],
                    |_| Ok(()),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .is_some();

            if !scope_state_exists {
                upsert_sync_state(
                    &tx,
                    "medicines",
                    scope_code.as_str(),
                    legacy_items.len(),
                    legacy_sync_date.as_deref(),
                )?;
            }
        }

        tx.execute(
            "DELETE FROM medicine_catalog WHERE org_code = ?1",
            params![legacy_scope_key.as_str()],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1",
            params![legacy_scope_key.as_str()],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

fn get_sync_state(
    conn: &Connection,
    catalog_type: &str,
    org_code: &str,
) -> Result<(Option<i64>, Option<String>), String> {
    conn.query_row(
        "SELECT last_sync_at, sync_date FROM catalog_sync_state WHERE catalog_type = ?1 AND org_code = ?2",
        params![catalog_type, org_code],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?)),
    )
    .optional()
    .map(|value| {
        value
            .map(|(last_sync_at, sync_date)| (Some(last_sync_at), sync_date))
            .unwrap_or((None, None))
    })
    .map_err(|e| e.to_string())
}

fn upsert_sync_state(
    tx: &rusqlite::Transaction<'_>,
    catalog_type: &str,
    org_code: &str,
    row_count: usize,
    sync_date: Option<&str>,
) -> Result<(), String> {
    tx.execute(
        "
        INSERT INTO catalog_sync_state (catalog_type, org_code, last_sync_at, sync_date, row_count)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(catalog_type, org_code)
        DO UPDATE SET
            last_sync_at = excluded.last_sync_at,
            sync_date = excluded.sync_date,
            row_count = excluded.row_count
        ",
        params![
            catalog_type,
            org_code,
            current_timestamp(),
            sync_date,
            row_count as i64
        ],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[command]
pub async fn load_medical_catalog_snapshot(
    app: AppHandle,
    org_code: Option<String>,
) -> Result<MedicalCatalogSnapshot, String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    migrate_legacy_combined_medicine_scopes(&mut conn)?;
    let normalized_org_code = org_code.unwrap_or_default().trim().to_string();

    let mut diagnosis_stmt = conn
        .prepare("SELECT id, code, name, keywords_json FROM diagnosis_catalog ORDER BY code, name")
        .map_err(|e| e.to_string())?;
    let diagnoses = diagnosis_stmt
        .query_map([], |row| {
            Ok(DiagnosisCatalogEntry {
                id: row.get(0)?,
                code: row.get(1)?,
                name: row.get(2)?,
                keywords: deserialize_keywords(row.get::<_, Option<String>>(3)?),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let (diagnosis_synced_at, _) = get_sync_state(&conn, "diagnoses", "")?;

    let mut items = Vec::new();
    let mut medicines = Vec::new();
    let mut item_sync_date = None;
    let mut medicine_sync_date = None;

    if !normalized_org_code.is_empty() {
        let mut item_stmt = conn
            .prepare(
                "SELECT id, code, name, category, keywords_json
                 FROM medical_item_catalog
                 WHERE org_code = ?1
                 ORDER BY category, name",
            )
            .map_err(|e| e.to_string())?;
        items = item_stmt
            .query_map(params![normalized_org_code.as_str()], |row| {
                Ok(MedicalItemCatalogEntry {
                    id: row.get(0)?,
                    code: row.get(1)?,
                    name: row.get(2)?,
                    category: row.get(3)?,
                    keywords: deserialize_keywords(row.get::<_, Option<String>>(4)?),
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let (_, sync_date) = get_sync_state(&conn, "items", normalized_org_code.as_str())?;
        item_sync_date = sync_date;

        let scope_codes = parse_scope_codes(normalized_org_code.as_str());
        let scope_codes = if scope_codes.is_empty() {
            vec![normalized_org_code.clone()]
        } else {
            scope_codes
        };

        let mut medicine_stmt = conn
            .prepare(
                "SELECT id, code, name, spec
                 FROM medicine_catalog
                 WHERE org_code = ?1
                 ORDER BY name, spec",
            )
            .map_err(|e| e.to_string())?;
        let mut unique_medicines = HashMap::<String, MedicineCatalogEntry>::new();
        for scope_code in &scope_codes {
            let scoped_items = medicine_stmt
                .query_map(params![scope_code.as_str()], |row| {
                    Ok(MedicineCatalogEntry {
                        id: row.get(0)?,
                        code: row.get(1)?,
                        name: row.get(2)?,
                        spec: row.get(3)?,
                        store_ids: Vec::new(),
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for item in scoped_items {
                let entry = unique_medicines
                    .entry(item.id.clone())
                    .or_insert_with(|| MedicineCatalogEntry {
                        id: item.id.clone(),
                        code: item.code.clone(),
                        name: item.name.clone(),
                        spec: item.spec.clone(),
                        store_ids: Vec::new(),
                    });
                if !entry.store_ids.iter().any(|existing| existing == scope_code) {
                    entry.store_ids.push(scope_code.clone());
                }
            }
        }

        medicines = unique_medicines.into_values().collect::<Vec<_>>();
        medicines.sort_by(|left, right| {
            left.name
                .cmp(&right.name)
                .then(left.spec.cmp(&right.spec))
                .then(left.id.cmp(&right.id))
        });

        let mut consistent_sync_date: Option<String> = None;
        let mut is_sync_date_consistent = true;
        for scope_code in &scope_codes {
            let (_, sync_date) = get_sync_state(&conn, "medicines", scope_code.as_str())?;
            match sync_date {
                Some(current_date) => {
                    if let Some(existing_date) = consistent_sync_date.as_ref() {
                        if existing_date != &current_date {
                            is_sync_date_consistent = false;
                            break;
                        }
                    } else {
                        consistent_sync_date = Some(current_date);
                    }
                }
                None => {
                    is_sync_date_consistent = false;
                    break;
                }
            }
        }
        medicine_sync_date = if is_sync_date_consistent {
            consistent_sync_date
        } else {
            None
        };
    }

    Ok(MedicalCatalogSnapshot {
        diagnoses,
        diagnosis_synced_at,
        items,
        item_sync_date,
        medicines,
        medicine_sync_date,
    })
}

#[command]
pub async fn replace_diagnosis_catalog(
    app: AppHandle,
    items: Vec<DiagnosisCatalogEntry>,
) -> Result<(), String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM diagnosis_catalog", [])
        .map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO diagnosis_catalog (id, code, name, keywords_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| e.to_string())?;

        for item in &items {
            stmt.execute(params![
                item.id,
                item.code,
                item.name,
                serialize_keywords(&item.keywords)?,
                current_timestamp()
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    upsert_sync_state(&tx, "diagnoses", "", items.len(), None)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn replace_org_medical_item_catalog(
    app: AppHandle,
    org_code: String,
    items: Vec<MedicalItemCatalogEntry>,
    sync_date: String,
) -> Result<(), String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM medical_item_catalog WHERE org_code = ?1",
        params![org_code.as_str()],
    )
    .map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO medical_item_catalog (org_code, id, code, name, category, keywords_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;

        for item in &items {
            stmt.execute(params![
                org_code.as_str(),
                item.id,
                item.code,
                item.name,
                item.category,
                serialize_keywords(&item.keywords)?,
                current_timestamp()
            ])
            .map_err(|e| e.to_string())?;
        }
    }

    upsert_sync_state(&tx, "items", org_code.as_str(), items.len(), Some(sync_date.as_str()))?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn replace_org_medicine_catalog(
    app: AppHandle,
    org_code: String,
    items: Vec<MedicineCatalogEntry>,
    sync_date: String,
) -> Result<(), String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    migrate_legacy_combined_medicine_scopes(&mut conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let normalized_org_code = org_code.trim().to_string();
    let scope_codes = parse_scope_codes(normalized_org_code.as_str());
    let scope_codes = if scope_codes.is_empty() {
        vec![normalized_org_code.clone()]
    } else {
        scope_codes
    };

    if scope_codes.len() > 1 {
        tx.execute(
            "DELETE FROM medicine_catalog WHERE org_code = ?1",
            params![normalized_org_code.as_str()],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1",
            params![normalized_org_code.as_str()],
        )
        .map_err(|e| e.to_string())?;
    }

    for scope_code in &scope_codes {
        tx.execute(
            "DELETE FROM medicine_catalog WHERE org_code = ?1",
            params![scope_code.as_str()],
        )
        .map_err(|e| e.to_string())?;

        let scoped_items: Vec<&MedicineCatalogEntry> = items
            .iter()
            .filter(|item| item.store_ids.iter().any(|existing| existing == scope_code))
            .collect();

        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO medicine_catalog (org_code, id, code, name, spec, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .map_err(|e| e.to_string())?;

            for item in &scoped_items {
                stmt.execute(params![
                    scope_code.as_str(),
                    item.id,
                    item.code,
                    item.name,
                    item.spec,
                    current_timestamp()
                ])
                .map_err(|e| e.to_string())?;
            }
        }

        upsert_sync_state(
            &tx,
            "medicines",
            scope_code.as_str(),
            scoped_items.len(),
            Some(sync_date.as_str()),
        )?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_medical_catalog_debug_state(app: AppHandle) -> Result<MedicalCatalogDebugState, String> {
    ensure_medical_catalog_access(&app)?;

    let db_path = get_db_path(&app);
    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    migrate_legacy_combined_medicine_scopes(&mut conn)?;

    let diagnosis_count = conn
        .query_row("SELECT COUNT(*) FROM diagnosis_catalog", [], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let item_count = conn
        .query_row("SELECT COUNT(*) FROM medical_item_catalog", [], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    let medicine_count = conn
        .query_row("SELECT COUNT(*) FROM medicine_catalog", [], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT catalog_type, org_code, last_sync_at, sync_date, row_count
             FROM catalog_sync_state
             ORDER BY catalog_type, org_code",
        )
        .map_err(|e| e.to_string())?;
    let sync_states = stmt
        .query_map([], |row| {
            Ok(MedicalCatalogSyncStateEntry {
                catalog_type: row.get(0)?,
                org_code: row.get(1)?,
                last_sync_at: row.get(2)?,
                sync_date: row.get(3)?,
                row_count: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(MedicalCatalogDebugState {
        db_path: db_path.to_string_lossy().to_string(),
        diagnosis_count,
        item_count,
        medicine_count,
        sync_states,
    })
}

#[command]
pub async fn clear_medical_catalog_cache(
    app: AppHandle,
    catalog_type: Option<String>,
    org_code: Option<String>,
) -> Result<MedicalCatalogClearResult, String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    migrate_legacy_combined_medicine_scopes(&mut conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let normalized_type = catalog_type
        .unwrap_or_else(|| "all".to_string())
        .trim()
        .to_lowercase();
    let normalized_org = org_code.unwrap_or_default().trim().to_string();

    let mut result = MedicalCatalogClearResult {
        diagnosis_rows: 0,
        item_rows: 0,
        medicine_rows: 0,
        sync_state_rows: 0,
    };

    if normalized_type == "all" || normalized_type == "diagnoses" {
        result.diagnosis_rows = tx
            .execute("DELETE FROM diagnosis_catalog", [])
            .map_err(|e| e.to_string())?;
        result.sync_state_rows += tx
            .execute(
                "DELETE FROM catalog_sync_state WHERE catalog_type = 'diagnoses'",
                [],
            )
            .map_err(|e| e.to_string())?;
    }

    if normalized_type == "all" || normalized_type == "items" {
        if normalized_org.is_empty() {
            result.item_rows = tx
                .execute("DELETE FROM medical_item_catalog", [])
                .map_err(|e| e.to_string())?;
            result.sync_state_rows += tx
                .execute(
                    "DELETE FROM catalog_sync_state WHERE catalog_type = 'items'",
                    [],
                )
                .map_err(|e| e.to_string())?;
        } else {
            result.item_rows = tx
                .execute(
                    "DELETE FROM medical_item_catalog WHERE org_code = ?1",
                    params![normalized_org.as_str()],
                )
                .map_err(|e| e.to_string())?;
            result.sync_state_rows += tx
                .execute(
                    "DELETE FROM catalog_sync_state WHERE catalog_type = 'items' AND org_code = ?1",
                    params![normalized_org.as_str()],
                )
                .map_err(|e| e.to_string())?;
        }
    }

    if normalized_type == "all" || normalized_type == "medicines" {
        if normalized_org.is_empty() {
            result.medicine_rows = tx
                .execute("DELETE FROM medicine_catalog", [])
                .map_err(|e| e.to_string())?;
            result.sync_state_rows += tx
                .execute(
                    "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines'",
                    [],
                )
                .map_err(|e| e.to_string())?;
        } else {
            let scope_codes = parse_scope_codes(normalized_org.as_str());
            let scope_codes = if scope_codes.is_empty() {
                vec![normalized_org.clone()]
            } else {
                scope_codes
            };

            if scope_codes.len() > 1 {
                result.medicine_rows += tx
                    .execute(
                        "DELETE FROM medicine_catalog WHERE org_code = ?1",
                        params![normalized_org.as_str()],
                    )
                    .map_err(|e| e.to_string())?;
                result.sync_state_rows += tx
                    .execute(
                        "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1",
                        params![normalized_org.as_str()],
                    )
                    .map_err(|e| e.to_string())?;
            }

            for scope_code in &scope_codes {
                result.medicine_rows += tx
                    .execute(
                        "DELETE FROM medicine_catalog WHERE org_code = ?1",
                        params![scope_code.as_str()],
                    )
                    .map_err(|e| e.to_string())?;
                result.sync_state_rows += tx
                    .execute(
                        "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1",
                        params![scope_code.as_str()],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}
