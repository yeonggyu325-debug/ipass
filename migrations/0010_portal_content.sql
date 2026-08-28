-- Notice attachments, popup images, and the EHS safety resource library.

CREATE TABLE IF NOT EXISTS safety_resources_v2 (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'guide'
    CHECK(category IN ('guide','form','education','law','other')),
  title TEXT NOT NULL,
  description TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_safety_resources_v2_active
  ON safety_resources_v2(is_active, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_resources_v2_category
  ON safety_resources_v2(category, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS portal_content_files_v2 (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('notice','resource')),
  owner_id TEXT NOT NULL,
  file_role TEXT NOT NULL DEFAULT 'attachment'
    CHECK(file_role IN ('attachment','popup_image')),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size > 0 AND file_size <= 26214400),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_portal_content_files_v2_owner
  ON portal_content_files_v2(owner_type, owner_id, deleted_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_content_notice_popup_v2
  ON portal_content_files_v2(owner_id)
  WHERE owner_type = 'notice' AND file_role = 'popup_image' AND deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_portal_content_files_v2_quota
BEFORE INSERT ON portal_content_files_v2
WHEN
  (SELECT COUNT(*) FROM portal_content_files_v2
    WHERE owner_type = NEW.owner_type AND owner_id = NEW.owner_id AND deleted_at IS NULL) >= 10
  OR
  (SELECT COALESCE(SUM(file_size), 0) FROM portal_content_files_v2
    WHERE owner_type = NEW.owner_type AND owner_id = NEW.owner_id AND deleted_at IS NULL) + NEW.file_size > 104857600
BEGIN
  SELECT RAISE(ABORT, 'PORTAL_CONTENT_FILE_QUOTA_EXCEEDED');
END;

CREATE TABLE IF NOT EXISTS portal_content_preview_tickets_v2 (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  issued_by TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_content_preview_tickets_v2_expiry
  ON portal_content_preview_tickets_v2(expires_at);

CREATE TABLE IF NOT EXISTS portal_content_logs_v2 (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL CHECK(owner_type IN ('notice','resource')),
  owner_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_content_logs_v2_owner
  ON portal_content_logs_v2(owner_type, owner_id, created_at DESC);
