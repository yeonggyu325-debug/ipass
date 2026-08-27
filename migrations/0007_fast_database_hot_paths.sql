-- Hot-path indexes for the evaluation runtime.
-- Keep large payloads in R2 and make D1 responsible only for relational metadata.

CREATE INDEX IF NOT EXISTS idx_eval_items_v2_template_type
  ON evaluation_items_v2(template_id, item_type);

CREATE INDEX IF NOT EXISTS idx_eval_targets_v2_cycle_company
  ON evaluation_targets_v2(cycle_id, company_id, is_selected, status);

CREATE INDEX IF NOT EXISTS idx_eval_target_items_v2_target_applicable
  ON evaluation_target_items_v2(target_id, applicable, sort_order);

CREATE INDEX IF NOT EXISTS idx_evidence_files_v2_target_live_created
  ON evaluation_evidence_files_v2(target_id, deleted_at, created_at DESC, target_item_id);

CREATE INDEX IF NOT EXISTS idx_evidence_files_v2_item_live_created
  ON evaluation_evidence_files_v2(target_item_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_reservations_v2_created
  ON evaluation_upload_reservations_v2(created_at);

CREATE INDEX IF NOT EXISTS idx_template_logs_v2_template_created
  ON evaluation_template_logs_v2(template_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cycle_logs_v2_cycle_created
  ON evaluation_cycle_logs_v2(cycle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_request_audit_v2_path_created
  ON system_request_audit_v2(path, created_at DESC);
