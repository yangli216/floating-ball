use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
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
    pub tenant_id: Option<String>,
    pub store_id: Option<String>,
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

        CREATE INDEX IF NOT EXISTS idx_diagnosis_code ON diagnosis_catalog(code);
        CREATE INDEX IF NOT EXISTS idx_diagnosis_name ON diagnosis_catalog(name);
        "
    )?;

    ensure_scoped_catalog_tables(&mut conn).map_err(rusqlite::Error::InvalidParameterName)?;

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

fn normalize_scope_value(raw: Option<String>) -> String {
    raw.unwrap_or_default().trim().to_string()
}

fn normalize_store_ids(raw: Option<Vec<String>>) -> Vec<String> {
    raw.unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn collect_store_ids_from_items(items: &[MedicineCatalogEntry]) -> Vec<String> {
    let mut store_ids = BTreeSet::new();
    for item in items {
        for store_id in &item.store_ids {
            let normalized = store_id.trim();
            if !normalized.is_empty() {
                store_ids.insert(normalized.to_string());
            }
        }
    }
    store_ids.into_iter().collect()
}

fn table_exists(conn: &Connection, table_name: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
        params![table_name],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
    .map_err(|e| e.to_string())
}

fn table_has_column(conn: &Connection, table_name: &str, column_name: &str) -> Result<bool, String> {
    if !table_exists(conn, table_name)? {
        return Ok(false);
    }

    let sql = format!("PRAGMA table_info({table_name})");
    let mut stmt = conn.prepare(sql.as_str()).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;
    let columns = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(columns.iter().any(|column| column == column_name))
}

fn create_scoped_catalog_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS medical_item_catalog (
            org_code TEXT NOT NULL DEFAULT '',
            tenant_id TEXT NOT NULL DEFAULT '',
            id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            keywords_json TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (org_code, tenant_id, id)
        );

        CREATE TABLE IF NOT EXISTS medicine_catalog (
            org_code TEXT NOT NULL DEFAULT '',
            tenant_id TEXT NOT NULL DEFAULT '',
            store_id TEXT NOT NULL DEFAULT '',
            id TEXT NOT NULL,
            code TEXT,
            name TEXT NOT NULL,
            spec TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (org_code, tenant_id, store_id, id)
        );

        CREATE TABLE IF NOT EXISTS catalog_sync_state (
            catalog_type TEXT NOT NULL,
            org_code TEXT NOT NULL DEFAULT '',
            tenant_id TEXT NOT NULL DEFAULT '',
            store_id TEXT NOT NULL DEFAULT '',
            last_sync_at INTEGER NOT NULL,
            sync_date TEXT,
            row_count INTEGER NOT NULL,
            PRIMARY KEY (catalog_type, org_code, tenant_id, store_id)
        );

        CREATE INDEX IF NOT EXISTS idx_medical_item_scope_category
            ON medical_item_catalog(org_code, tenant_id, category);
        CREATE INDEX IF NOT EXISTS idx_medical_item_name ON medical_item_catalog(name);
        CREATE INDEX IF NOT EXISTS idx_medicine_scope_name
            ON medicine_catalog(org_code, tenant_id, store_id, name);
        CREATE INDEX IF NOT EXISTS idx_sync_state_scope
            ON catalog_sync_state(catalog_type, org_code, tenant_id, store_id);
        "
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn purge_transient_exam_lab_cache(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM medical_item_catalog WHERE category IN ('检查', '检验')",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "
        UPDATE catalog_sync_state
        SET row_count = (
            SELECT COUNT(*)
            FROM medical_item_catalog
            WHERE medical_item_catalog.org_code = catalog_sync_state.org_code
              AND medical_item_catalog.tenant_id = catalog_sync_state.tenant_id
        )
        WHERE catalog_type = 'items';

        DELETE FROM catalog_sync_state
        WHERE catalog_type = 'items' AND row_count = 0;
        ",
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

fn ensure_scoped_catalog_tables(conn: &mut Connection) -> Result<(), String> {
    let medical_item_ready = table_has_column(conn, "medical_item_catalog", "tenant_id")?;
    let medicine_tenant_ready = table_has_column(conn, "medicine_catalog", "tenant_id")?;
    let medicine_store_ready = table_has_column(conn, "medicine_catalog", "store_id")?;
    let sync_tenant_ready = table_has_column(conn, "catalog_sync_state", "tenant_id")?;
    let sync_store_ready = table_has_column(conn, "catalog_sync_state", "store_id")?;

    if medical_item_ready && medicine_tenant_ready && medicine_store_ready && sync_tenant_ready && sync_store_ready {
        create_scoped_catalog_tables(conn)?;
        return purge_transient_exam_lab_cache(conn);
    }

    let has_medical_item_table = table_exists(conn, "medical_item_catalog")?;
    let has_medicine_table = table_exists(conn, "medicine_catalog")?;
    let has_sync_table = table_exists(conn, "catalog_sync_state")?;

    if !has_medical_item_table && !has_medicine_table && !has_sync_table {
        create_scoped_catalog_tables(conn)?;
        return purge_transient_exam_lab_cache(conn);
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute_batch(
        "
        DROP TABLE IF EXISTS medical_item_catalog_next;
        DROP TABLE IF EXISTS medicine_catalog_next;
        DROP TABLE IF EXISTS catalog_sync_state_next;

        CREATE TABLE medical_item_catalog_next (
            org_code TEXT NOT NULL DEFAULT '',
            tenant_id TEXT NOT NULL DEFAULT '',
            id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            keywords_json TEXT,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (org_code, tenant_id, id)
        );

        CREATE TABLE medicine_catalog_next (
            org_code TEXT NOT NULL DEFAULT '',
            tenant_id TEXT NOT NULL DEFAULT '',
            store_id TEXT NOT NULL DEFAULT '',
            id TEXT NOT NULL,
            code TEXT,
            name TEXT NOT NULL,
            spec TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (org_code, tenant_id, store_id, id)
        );

        CREATE TABLE catalog_sync_state_next (
            catalog_type TEXT NOT NULL,
            org_code TEXT NOT NULL DEFAULT '',
            tenant_id TEXT NOT NULL DEFAULT '',
            store_id TEXT NOT NULL DEFAULT '',
            last_sync_at INTEGER NOT NULL,
            sync_date TEXT,
            row_count INTEGER NOT NULL,
            PRIMARY KEY (catalog_type, org_code, tenant_id, store_id)
        );
        "
    )
    .map_err(|e| e.to_string())?;

    if has_medical_item_table {
        tx.execute(
            "
            INSERT INTO medical_item_catalog_next (org_code, tenant_id, id, code, name, category, keywords_json, updated_at)
            SELECT org_code, '', id, code, name, category, keywords_json, updated_at
            FROM medical_item_catalog
            ",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    if has_sync_table {
        tx.execute(
            "
            INSERT INTO catalog_sync_state_next (catalog_type, org_code, tenant_id, store_id, last_sync_at, sync_date, row_count)
            SELECT catalog_type, org_code, '', '', last_sync_at, sync_date, row_count
            FROM catalog_sync_state
            WHERE catalog_type IN ('diagnoses', 'items')
            ",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    if has_medical_item_table {
        tx.execute("DROP TABLE medical_item_catalog", []).map_err(|e| e.to_string())?;
    }
    if has_medicine_table {
        tx.execute("DROP TABLE medicine_catalog", []).map_err(|e| e.to_string())?;
    }
    if has_sync_table {
        tx.execute("DROP TABLE catalog_sync_state", []).map_err(|e| e.to_string())?;
    }

    tx.execute("ALTER TABLE medical_item_catalog_next RENAME TO medical_item_catalog", [])
        .map_err(|e| e.to_string())?;
    tx.execute("ALTER TABLE medicine_catalog_next RENAME TO medicine_catalog", [])
        .map_err(|e| e.to_string())?;
    tx.execute("ALTER TABLE catalog_sync_state_next RENAME TO catalog_sync_state", [])
        .map_err(|e| e.to_string())?;

    tx.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_medical_item_scope_category
            ON medical_item_catalog(org_code, tenant_id, category);
        CREATE INDEX IF NOT EXISTS idx_medical_item_name ON medical_item_catalog(name);
        CREATE INDEX IF NOT EXISTS idx_medicine_scope_name
            ON medicine_catalog(org_code, tenant_id, store_id, name);
        CREATE INDEX IF NOT EXISTS idx_sync_state_scope
            ON catalog_sync_state(catalog_type, org_code, tenant_id, store_id);
        "
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    purge_transient_exam_lab_cache(conn)
}

fn get_sync_state(
    conn: &Connection,
    catalog_type: &str,
    org_code: &str,
    tenant_id: &str,
    store_id: &str,
) -> Result<(Option<i64>, Option<String>), String> {
    conn.query_row(
        "
        SELECT last_sync_at, sync_date
        FROM catalog_sync_state
        WHERE catalog_type = ?1 AND org_code = ?2 AND tenant_id = ?3 AND store_id = ?4
        ",
        params![catalog_type, org_code, tenant_id, store_id],
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
    tenant_id: &str,
    store_id: &str,
    row_count: usize,
    sync_date: Option<&str>,
) -> Result<(), String> {
    tx.execute(
        "
        INSERT INTO catalog_sync_state (catalog_type, org_code, tenant_id, store_id, last_sync_at, sync_date, row_count)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(catalog_type, org_code, tenant_id, store_id)
        DO UPDATE SET
            last_sync_at = excluded.last_sync_at,
            sync_date = excluded.sync_date,
            row_count = excluded.row_count
        ",
        params![
            catalog_type,
            org_code,
            tenant_id,
            store_id,
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
    tenant_id: Option<String>,
    store_ids: Option<Vec<String>>,
) -> Result<MedicalCatalogSnapshot, String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let normalized_org_code = normalize_scope_value(org_code);
    let normalized_tenant_id = normalize_scope_value(tenant_id);
    let requested_store_ids = normalize_store_ids(store_ids);

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

    let (diagnosis_synced_at, _) = get_sync_state(&conn, "diagnoses", "", "", "")?;

    let mut items = Vec::new();
    let mut medicines = Vec::new();
    let mut item_sync_date = None;
    let mut medicine_sync_date = None;

    if !normalized_org_code.is_empty() {
        let mut item_stmt = conn
            .prepare(
                "SELECT id, code, name, category, keywords_json
                 FROM medical_item_catalog
                 WHERE org_code = ?1 AND tenant_id = ?2
                   AND category NOT IN ('检查', '检验')
                 ORDER BY category, name",
            )
            .map_err(|e| e.to_string())?;
        items = item_stmt
            .query_map(params![normalized_org_code.as_str(), normalized_tenant_id.as_str()], |row| {
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

        let (_, sync_date) = get_sync_state(
            &conn,
            "items",
            normalized_org_code.as_str(),
            normalized_tenant_id.as_str(),
            "",
        )?;
        item_sync_date = sync_date;

        let effective_store_ids = if requested_store_ids.is_empty() {
            let mut stmt = conn
                .prepare(
                    "
                    SELECT DISTINCT store_id
                    FROM medicine_catalog
                    WHERE org_code = ?1 AND tenant_id = ?2 AND store_id <> ''
                    UNION
                    SELECT DISTINCT store_id
                    FROM catalog_sync_state
                    WHERE catalog_type = 'medicines' AND org_code = ?1 AND tenant_id = ?2 AND store_id <> ''
                    ORDER BY store_id
                    ",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![normalized_org_code.as_str(), normalized_tenant_id.as_str()], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
        } else {
            requested_store_ids.clone()
        };

        if !effective_store_ids.is_empty() {
            let mut medicine_stmt = conn
                .prepare(
                    "
                    SELECT id, code, name, spec
                    FROM medicine_catalog
                    WHERE org_code = ?1 AND tenant_id = ?2 AND store_id = ?3
                    ORDER BY name, spec
                    ",
                )
                .map_err(|e| e.to_string())?;
            let mut unique_medicines = HashMap::<String, MedicineCatalogEntry>::new();
            for scope_store_id in &effective_store_ids {
                let scoped_items = medicine_stmt
                    .query_map(
                        params![
                            normalized_org_code.as_str(),
                            normalized_tenant_id.as_str(),
                            scope_store_id.as_str()
                        ],
                        |row| {
                            Ok(MedicineCatalogEntry {
                                id: row.get(0)?,
                                code: row.get(1)?,
                                name: row.get(2)?,
                                spec: row.get(3)?,
                                store_ids: Vec::new(),
                            })
                        },
                    )
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
                    if !entry.store_ids.iter().any(|existing| existing == scope_store_id) {
                        entry.store_ids.push(scope_store_id.clone());
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
            for scope_store_id in &effective_store_ids {
                let (_, sync_date) = get_sync_state(
                    &conn,
                    "medicines",
                    normalized_org_code.as_str(),
                    normalized_tenant_id.as_str(),
                    scope_store_id.as_str(),
                )?;
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

    upsert_sync_state(&tx, "diagnoses", "", "", "", items.len(), None)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn replace_org_medical_item_catalog(
    app: AppHandle,
    org_code: String,
    tenant_id: Option<String>,
    items: Vec<MedicalItemCatalogEntry>,
    sync_date: String,
) -> Result<(), String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let normalized_org_code = normalize_scope_value(Some(org_code));
    let normalized_tenant_id = normalize_scope_value(tenant_id);
    let persistable_items = items
        .iter()
        .filter(|item| item.category != "检查" && item.category != "检验")
        .collect::<Vec<_>>();

    tx.execute(
        "DELETE FROM medical_item_catalog WHERE org_code = ?1 AND tenant_id = ?2",
        params![normalized_org_code.as_str(), normalized_tenant_id.as_str()],
    )
    .map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO medical_item_catalog (org_code, tenant_id, id, code, name, category, keywords_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )
            .map_err(|e| e.to_string())?;

        for item in &persistable_items {
            stmt.execute(params![
                normalized_org_code.as_str(),
                normalized_tenant_id.as_str(),
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

    upsert_sync_state(
        &tx,
        "items",
        normalized_org_code.as_str(),
        normalized_tenant_id.as_str(),
        "",
        persistable_items.len(),
        Some(sync_date.as_str()),
    )?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn replace_org_medicine_catalog(
    app: AppHandle,
    org_code: String,
    tenant_id: Option<String>,
    store_ids: Option<Vec<String>>,
    items: Vec<MedicineCatalogEntry>,
    sync_date: String,
) -> Result<(), String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let normalized_org_code = normalize_scope_value(Some(org_code));
    let normalized_tenant_id = normalize_scope_value(tenant_id);
    let effective_store_ids = {
        let normalized = normalize_store_ids(store_ids);
        if normalized.is_empty() {
            collect_store_ids_from_items(&items)
        } else {
            normalized
        }
    };

    for scope_store_id in &effective_store_ids {
        tx.execute(
            "DELETE FROM medicine_catalog WHERE org_code = ?1 AND tenant_id = ?2 AND store_id = ?3",
            params![
                normalized_org_code.as_str(),
                normalized_tenant_id.as_str(),
                scope_store_id.as_str()
            ],
        )
        .map_err(|e| e.to_string())?;

        tx.execute(
            "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1 AND tenant_id = ?2 AND store_id = ?3",
            params![
                normalized_org_code.as_str(),
                normalized_tenant_id.as_str(),
                scope_store_id.as_str()
            ],
        )
        .map_err(|e| e.to_string())?;

        let scoped_items: Vec<&MedicineCatalogEntry> = items
            .iter()
            .filter(|item| {
                item.store_ids
                    .iter()
                    .any(|existing| existing.trim() == scope_store_id.as_str())
            })
            .collect();

        {
            let mut stmt = tx
                .prepare(
                    "INSERT INTO medicine_catalog (org_code, tenant_id, store_id, id, code, name, spec, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                )
                .map_err(|e| e.to_string())?;

            for item in &scoped_items {
                stmt.execute(params![
                    normalized_org_code.as_str(),
                    normalized_tenant_id.as_str(),
                    scope_store_id.as_str(),
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
            normalized_org_code.as_str(),
            normalized_tenant_id.as_str(),
            scope_store_id.as_str(),
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
    let conn = db.0.lock().map_err(|e| e.to_string())?;

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
            "SELECT catalog_type, org_code, tenant_id, store_id, last_sync_at, sync_date, row_count
             FROM catalog_sync_state
             ORDER BY catalog_type, org_code, tenant_id, store_id",
        )
        .map_err(|e| e.to_string())?;
    let sync_states = stmt
        .query_map([], |row| {
            Ok(MedicalCatalogSyncStateEntry {
                catalog_type: row.get(0)?,
                org_code: row.get(1)?,
                tenant_id: row
                    .get::<_, String>(2)
                    .ok()
                    .and_then(|value| if value.trim().is_empty() { None } else { Some(value) }),
                store_id: row
                    .get::<_, String>(3)
                    .ok()
                    .and_then(|value| if value.trim().is_empty() { None } else { Some(value) }),
                last_sync_at: row.get(4)?,
                sync_date: row.get(5)?,
                row_count: row.get(6)?,
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
    tenant_id: Option<String>,
    store_id: Option<String>,
) -> Result<MedicalCatalogClearResult, String> {
    ensure_medical_catalog_access(&app)?;

    let db = app.state::<MedicalCatalogDbConnection>();
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let normalized_type = catalog_type
        .unwrap_or_else(|| "all".to_string())
        .trim()
        .to_lowercase();
    let normalized_org = normalize_scope_value(org_code);
    let normalized_tenant = normalize_scope_value(tenant_id);
    let normalized_store = normalize_scope_value(store_id);

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
                "DELETE FROM catalog_sync_state WHERE catalog_type = 'diagnoses' AND org_code = '' AND tenant_id = '' AND store_id = ''",
                [],
            )
            .map_err(|e| e.to_string())?;
    }

    if normalized_type == "all" || normalized_type == "items" {
        if normalized_org.is_empty() && normalized_tenant.is_empty() {
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
                    "DELETE FROM medical_item_catalog WHERE org_code = ?1 AND tenant_id = ?2",
                    params![normalized_org.as_str(), normalized_tenant.as_str()],
                )
                .map_err(|e| e.to_string())?;
            result.sync_state_rows += tx
                .execute(
                    "DELETE FROM catalog_sync_state WHERE catalog_type = 'items' AND org_code = ?1 AND tenant_id = ?2 AND store_id = ''",
                    params![normalized_org.as_str(), normalized_tenant.as_str()],
                )
                .map_err(|e| e.to_string())?;
        }
    }

    if normalized_type == "all" || normalized_type == "medicines" {
        if normalized_org.is_empty() && normalized_tenant.is_empty() && normalized_store.is_empty() {
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
            let delete_store_ids = if normalized_store.is_empty() {
                let mut stmt = tx
                    .prepare(
                        "
                        SELECT DISTINCT store_id
                        FROM medicine_catalog
                        WHERE org_code = ?1 AND tenant_id = ?2
                        UNION
                        SELECT DISTINCT store_id
                        FROM catalog_sync_state
                        WHERE catalog_type = 'medicines' AND org_code = ?1 AND tenant_id = ?2
                        ORDER BY store_id
                        ",
                    )
                    .map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map(params![normalized_org.as_str(), normalized_tenant.as_str()], |row| {
                        row.get::<_, String>(0)
                    })
                    .map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
            } else {
                vec![normalized_store.clone()]
            };

            for scope_store_id in &delete_store_ids {
                result.medicine_rows += tx
                    .execute(
                        "DELETE FROM medicine_catalog WHERE org_code = ?1 AND tenant_id = ?2 AND store_id = ?3",
                        params![
                            normalized_org.as_str(),
                            normalized_tenant.as_str(),
                            scope_store_id.as_str()
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                result.sync_state_rows += tx
                    .execute(
                        "DELETE FROM catalog_sync_state WHERE catalog_type = 'medicines' AND org_code = ?1 AND tenant_id = ?2 AND store_id = ?3",
                        params![
                            normalized_org.as_str(),
                            normalized_tenant.as_str(),
                            scope_store_id.as_str()
                        ],
                    )
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn purges_exam_lab_rows_and_keeps_other_scoped_items() {
        let conn = Connection::open_in_memory().expect("open in-memory catalog db");
        create_scoped_catalog_tables(&conn).expect("create catalog tables");
        conn.execute(
            "INSERT INTO medical_item_catalog
             (org_code, tenant_id, id, code, name, category, keywords_json, updated_at)
             VALUES ('ORG-1', 'TENANT-1', 'LAB-1', 'LAB-1', '血常规', '检验', NULL, 1),
                    ('ORG-1', 'TENANT-1', 'PROC-1', 'PROC-1', '雾化治疗', '治疗', NULL, 1)",
            [],
        )
        .expect("insert scoped items");
        conn.execute(
            "INSERT INTO catalog_sync_state
             (catalog_type, org_code, tenant_id, store_id, last_sync_at, sync_date, row_count)
             VALUES ('items', 'ORG-1', 'TENANT-1', '', 1, '2026-08-21', 2)",
            [],
        )
        .expect("insert item sync state");

        purge_transient_exam_lab_cache(&conn).expect("purge transient catalog rows");

        let remaining_ids = conn
            .prepare("SELECT id FROM medical_item_catalog ORDER BY id")
            .expect("prepare item query")
            .query_map([], |row| row.get::<_, String>(0))
            .expect("query remaining items")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect remaining items");
        let row_count = conn
            .query_row(
                "SELECT row_count FROM catalog_sync_state WHERE catalog_type = 'items'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("read updated sync count");

        assert_eq!(remaining_ids, vec!["PROC-1"]);
        assert_eq!(row_count, 1);
    }
}
