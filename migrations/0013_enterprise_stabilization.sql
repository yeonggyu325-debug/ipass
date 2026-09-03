-- Enterprise stabilization: canonical accounts, deterministic N/A states,
-- edit leases, notification dedupe, and schema-version diagnostics.

ALTER TABLE notifications ADD COLUMN recipient_account_id TEXT;
ALTER TABLE notifications ADD COLUMN entity_type TEXT;
ALTER TABLE notifications ADD COLUMN entity_id TEXT;
ALTER TABLE notifications ADD COLUMN dedupe_key TEXT;

UPDATE notifications
SET recipient_account_id = recipient_user_id
WHERE recipient_account_id IS NULL
  AND EXISTS (SELECT 1 FROM portal_accounts pa WHERE pa.id = notifications.recipient_user_id);

UPDATE notifications
SET recipient_account_id = (
  SELECT pa.id
  FROM users u
  JOIN portal_accounts pa ON LOWER(pa.email) = LOWER(u.email)
  WHERE u.id = notifications.recipient_user_id
  LIMIT 1
)
WHERE recipient_account_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM users u
    JOIN portal_accounts pa ON LOWER(pa.email) = LOWER(u.email)
    WHERE u.id = notifications.recipient_user_id
  );

CREATE INDEX IF NOT EXISTS idx_notifications_account_read_created
  ON notifications(recipient_account_id, is_read, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_key
  ON notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE evaluation_na_rules_v2 ADD COLUMN industry_code TEXT;
ALTER TABLE evaluation_target_items_v2 ADD COLUMN applicability_status TEXT NOT NULL DEFAULT 'applicable';
ALTER TABLE evaluation_target_items_v2 ADD COLUMN applicability_reason TEXT;

UPDATE evaluation_target_items_v2
SET applicability_status = CASE WHEN applicable = 0 THEN 'not_applicable' ELSE 'applicable' END
WHERE applicability_status IS NULL OR applicability_status = '';

CREATE INDEX IF NOT EXISTS idx_eval_na_rules_v2_code_workers
  ON evaluation_na_rules_v2(item_id, industry_code, min_worker_count, sort_order);
CREATE INDEX IF NOT EXISTS idx_eval_target_items_v2_target_status
  ON evaluation_target_items_v2(target_id, applicability_status, sort_order);

CREATE TABLE IF NOT EXISTS evaluation_edit_leases_v2 (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  lease_token TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  UNIQUE(target_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_evaluation_edit_leases_v2_lookup
  ON evaluation_edit_leases_v2(target_id, account_id, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_evaluation_edit_leases_v2_expiry
  ON evaluation_edit_leases_v2(expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS system_schema_metadata_v2 (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO system_schema_metadata_v2(key,value,updated_at)
VALUES('schema_version','0013',CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
