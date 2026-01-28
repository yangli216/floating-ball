pub mod models;

use tauri_plugin_sql::{Migration, MigrationKind};

#[allow(dead_code)]
pub fn get_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "Initial feedback schema",
        sql: include_str!("../../migrations/001_initial_schema.sql"),
        kind: MigrationKind::Up,
    }]
}
