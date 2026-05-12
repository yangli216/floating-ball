-- Patient long-term memory schema
-- Created: 2026-04-25
-- Storage: app_data_dir/patient_memory.db
-- 与 next.md 第 3 节"智能记忆系统"对齐：本表保存就诊摘要 + 累积过敏史 + 慢病候选

CREATE TABLE IF NOT EXISTS patient_memory (
    patient_id TEXT PRIMARY KEY,
    patient_profile_json TEXT,
    allergy_history TEXT NOT NULL DEFAULT '[]',
    chronic_diagnoses TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS patient_visits (
    visit_id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL,
    completed_at INTEGER NOT NULL,
    chief_complaint TEXT NOT NULL DEFAULT '',
    primary_diagnosis TEXT,
    diagnoses TEXT NOT NULL DEFAULT '[]',
    medications TEXT NOT NULL DEFAULT '[]',
    lab_tests TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (patient_id) REFERENCES patient_memory(patient_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_patient_visits_patient_completed
    ON patient_visits(patient_id, completed_at DESC);
