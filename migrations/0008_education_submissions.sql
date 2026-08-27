-- Monthly safety-and-health education submissions.
-- Only partner companies participate.

CREATE TABLE IF NOT EXISTS education_submissions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  education_year INTEGER NOT NULL,
  education_month INTEGER NOT NULL CHECK(education_month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','under_review','approved','changes_requested')),
  note TEXT,
  review_comment TEXT,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, education_year, education_month)
);

CREATE INDEX IF NOT EXISTS idx_education_submissions_year_status
  ON education_submissions(education_year, status, education_month);
CREATE INDEX IF NOT EXISTS idx_education_submissions_company_year
  ON education_submissions(company_id, education_year, education_month);

CREATE TABLE IF NOT EXISTS education_submission_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK(file_size > 0),
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_education_files_submission
  ON education_submission_files(submission_id, deleted_at, created_at DESC);

CREATE TABLE IF NOT EXISTS education_preview_tickets (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  issued_by TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_education_preview_expiry
  ON education_preview_tickets(expires_at);

CREATE TABLE IF NOT EXISTS education_submission_logs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_education_logs_submission
  ON education_submission_logs(submission_id, created_at DESC);
