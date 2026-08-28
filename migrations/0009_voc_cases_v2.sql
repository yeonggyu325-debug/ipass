-- Partner VOC intake, image evidence, review status, and short-lived previews.

CREATE TABLE IF NOT EXISTS voc_cases_v2 (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  created_by TEXT,
  category TEXT NOT NULL DEFAULT 'general'
    CHECK(category IN ('general','safety','facility','other')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','received','in_review','answered','closed')),
  admin_reply TEXT,
  replied_by TEXT,
  replied_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voc_cases_v2_company_created
  ON voc_cases_v2(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voc_cases_v2_status_created
  ON voc_cases_v2(status, created_at DESC);

CREATE TABLE IF NOT EXISTS voc_images_v2 (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 10485760),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_voc_images_v2_case
  ON voc_images_v2(case_id, deleted_at, created_at);

CREATE TRIGGER IF NOT EXISTS trg_voc_images_v2_quota
BEFORE INSERT ON voc_images_v2
WHEN
  (SELECT COUNT(*) FROM voc_images_v2 WHERE case_id = NEW.case_id AND deleted_at IS NULL) >= 5
  OR
  (SELECT COALESCE(SUM(file_size), 0) FROM voc_images_v2 WHERE case_id = NEW.case_id AND deleted_at IS NULL) + NEW.file_size > 31457280
BEGIN
  SELECT RAISE(ABORT, 'VOC_IMAGE_QUOTA_EXCEEDED');
END;

CREATE TABLE IF NOT EXISTS voc_preview_tickets_v2 (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  issued_by TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voc_preview_tickets_v2_expiry
  ON voc_preview_tickets_v2(expires_at);

CREATE TABLE IF NOT EXISTS voc_case_logs_v2 (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voc_case_logs_v2_case
  ON voc_case_logs_v2(case_id, created_at DESC);
