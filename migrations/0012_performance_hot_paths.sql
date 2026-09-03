-- Additional covering indexes for frequently-read portal data.
-- These complement 0007_fast_database_hot_paths.sql and target current
-- skeleton-heavy screens: education overview, notifications, registrations,
-- portal content, and evaluation submission history.

CREATE INDEX IF NOT EXISTS idx_education_files_live_cover
  ON education_submission_files(submission_id, file_size)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read_created
  ON notifications(recipient_user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_accounts_status_created
  ON portal_accounts(approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_accounts_company_status
  ON portal_accounts(company_id, approval_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_notices_active_placement_created
  ON portal_notices(is_active, show_after_login, show_on_login, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eval_targets_v2_company_status_cycle
  ON evaluation_targets_v2(company_id, status, cycle_id, is_selected);

CREATE INDEX IF NOT EXISTS idx_submission_logs_v2_target_action_created
  ON evaluation_submission_logs_v2(target_id, action, created_at DESC);
