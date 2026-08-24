-- Evaluation, submission, scoring, storage, and audit runtime schema baseline.
-- Evaluation request handlers must not execute DDL; all future changes belong here.

CREATE TABLE IF NOT EXISTS evaluation_templates_v2 (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  half TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  source_template_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at TEXT,
  UNIQUE(year, half, version)
);

CREATE TABLE IF NOT EXISTS evaluation_categories_v2 (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  parent_id TEXT,
  category_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eval_categories_v2_template ON evaluation_categories_v2(template_id, sort_order);

CREATE TABLE IF NOT EXISTS evaluation_items_v2 (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  item_code TEXT,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'score',
  max_score REAL NOT NULL DEFAULT 0,
  judgment_guide TEXT,
  submission_guide TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_eval_items_v2_template ON evaluation_items_v2(template_id, sort_order);

CREATE TABLE IF NOT EXISTS evaluation_na_rules_v2 (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  industry_name TEXT,
  min_worker_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_eval_na_rules_v2_item ON evaluation_na_rules_v2(item_id, sort_order);

CREATE TABLE IF NOT EXISTS ipass_policy_settings_v2 (
  id INTEGER PRIMARY KEY CHECK(id=1),
  excellence_threshold REAL NOT NULL DEFAULT 90,
  first_half_exempt_enabled INTEGER NOT NULL DEFAULT 1,
  normal_first_half_weight REAL NOT NULL DEFAULT 40,
  normal_second_half_weight REAL NOT NULL DEFAULT 40,
  exempt_second_half_weight REAL NOT NULL DEFAULT 80,
  committee_weight REAL NOT NULL DEFAULT 10,
  industrial_accident_weight REAL NOT NULL DEFAULT 10,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO ipass_policy_settings_v2 (
  id, excellence_threshold, first_half_exempt_enabled, normal_first_half_weight,
  normal_second_half_weight, exempt_second_half_weight, committee_weight, industrial_accident_weight
) VALUES (1, 90, 1, 40, 40, 80, 10, 10);

CREATE TABLE IF NOT EXISTS evaluation_template_logs_v2 (
  id TEXT PRIMARY KEY,
  template_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_template_settings_v2 (
  template_id TEXT PRIMARY KEY,
  concept_text TEXT,
  excellent_min REAL NOT NULL DEFAULT 90,
  qualified_min REAL NOT NULL DEFAULT 70,
  first_half_exempt_enabled INTEGER NOT NULL DEFAULT 1,
  exemption_threshold REAL NOT NULL DEFAULT 90,
  normal_first_half_weight REAL NOT NULL DEFAULT 40,
  normal_second_half_weight REAL NOT NULL DEFAULT 40,
  exempt_second_half_weight REAL NOT NULL DEFAULT 80,
  committee_weight REAL NOT NULL DEFAULT 10,
  industrial_accident_weight REAL NOT NULL DEFAULT 10,
  score_cap REAL NOT NULL DEFAULT 100,
  bonus_cap REAL NOT NULL DEFAULT 5,
  manual_publish INTEGER NOT NULL DEFAULT 1,
  allow_partner_edits INTEGER NOT NULL DEFAULT 1,
  preserve_score_on_edit INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_cycle_settings_v2 (
  cycle_id TEXT PRIMARY KEY,
  source_template_id TEXT,
  concept_text TEXT,
  excellent_min REAL NOT NULL DEFAULT 90,
  qualified_min REAL NOT NULL DEFAULT 70,
  first_half_exempt_enabled INTEGER NOT NULL DEFAULT 1,
  exemption_threshold REAL NOT NULL DEFAULT 90,
  normal_first_half_weight REAL NOT NULL DEFAULT 40,
  normal_second_half_weight REAL NOT NULL DEFAULT 40,
  exempt_second_half_weight REAL NOT NULL DEFAULT 80,
  committee_weight REAL NOT NULL DEFAULT 10,
  industrial_accident_weight REAL NOT NULL DEFAULT 10,
  score_cap REAL NOT NULL DEFAULT 100,
  bonus_cap REAL NOT NULL DEFAULT 5,
  manual_publish INTEGER NOT NULL DEFAULT 1,
  allow_partner_edits INTEGER NOT NULL DEFAULT 1,
  preserve_score_on_edit INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_cycles_v2 (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  half TEXT NOT NULL,
  cycle_name TEXT NOT NULL,
  start_at TEXT,
  end_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  template_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  closed_at TEXT,
  UNIQUE(year, half)
);
CREATE INDEX IF NOT EXISTS idx_eval_cycles_v2_status ON evaluation_cycles_v2(status, year, half);

CREATE TABLE IF NOT EXISTS evaluation_targets_v2 (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  exclusion_reason TEXT,
  exemption_type TEXT,
  previous_ipass_score REAL,
  status TEXT NOT NULL DEFAULT 'not_started',
  business_number TEXT,
  representative_name TEXT,
  worker_count INTEGER,
  submitted_at TEXT,
  finalized_at TEXT,
  finalized_by TEXT,
  published_at TEXT,
  published_by TEXT,
  raw_score REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(cycle_id, company_id)
);
CREATE INDEX IF NOT EXISTS idx_eval_targets_v2_cycle ON evaluation_targets_v2(cycle_id, is_selected, status);
CREATE INDEX IF NOT EXISTS idx_eval_targets_v2_company ON evaluation_targets_v2(company_id, cycle_id);

CREATE TABLE IF NOT EXISTS evaluation_target_items_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  template_item_id TEXT NOT NULL,
  item_code TEXT,
  item_name TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'score',
  max_score REAL NOT NULL DEFAULT 0,
  category_name TEXT,
  parent_category_name TEXT,
  guide_text TEXT,
  judgment_guide TEXT,
  applicable INTEGER NOT NULL DEFAULT 1,
  na_source TEXT,
  manual_na_reason TEXT,
  description TEXT,
  earned_score REAL,
  max_score_snapshot REAL,
  evaluation_comment TEXT,
  evaluated_at TEXT,
  needs_rescore INTEGER NOT NULL DEFAULT 0,
  partner_changed_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(target_id, template_item_id)
);
CREATE INDEX IF NOT EXISTS idx_eval_target_items_v2_target ON evaluation_target_items_v2(target_id, sort_order);

CREATE TABLE IF NOT EXISTS evaluation_cycle_logs_v2 (
  id TEXT PRIMARY KEY,
  cycle_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_partner_submission_logs_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_item_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partner_submission_logs_v2_target ON evaluation_partner_submission_logs_v2(target_id, created_at);

CREATE TABLE IF NOT EXISTS evaluation_evidence_files_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_item_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_evidence_files_v2_item ON evaluation_evidence_files_v2(target_item_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_evidence_files_v2_target ON evaluation_evidence_files_v2(target_id, deleted_at);

CREATE TABLE IF NOT EXISTS evaluation_evidence_preview_tickets_v2 (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  issued_by TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_evidence_preview_tickets_v2_expiry ON evaluation_evidence_preview_tickets_v2(expires_at);

CREATE TABLE IF NOT EXISTS evaluation_upload_reservations_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_upload_reservations_v2_target ON evaluation_upload_reservations_v2(target_id, created_at);
DROP TRIGGER IF EXISTS trg_evidence_upload_quota_v2;

CREATE TABLE IF NOT EXISTS evaluation_scoring_logs_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  target_item_id TEXT,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_evaluation_scoring_logs_target ON evaluation_scoring_logs_v2(target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS system_request_audit_v2 (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  duration_ms INTEGER,
  actor_id TEXT,
  actor_role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_system_request_audit_v2_created ON system_request_audit_v2(created_at DESC);

CREATE TABLE IF NOT EXISTS committee_target_preferences (
  entity_type TEXT NOT NULL CHECK(entity_type IN ('partner', 'department')),
  entity_id TEXT NOT NULL,
  is_target INTEGER NOT NULL DEFAULT 1 CHECK(is_target IN (0, 1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_committee_target_preferences_active ON committee_target_preferences(entity_type, is_target);
