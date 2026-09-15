-- Partner attendance registration and mandatory delegation documents.
CREATE TABLE IF NOT EXISTS committee_attendance_submissions (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  attendee_type TEXT NOT NULL CHECK(attendee_type IN ('representative','delegate')),
  attendee_position TEXT NOT NULL,
  attendee_name TEXT NOT NULL,
  submitted_by TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(meeting_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_committee_attendance_submissions_meeting
  ON committee_attendance_submissions(meeting_id, company_id);

CREATE TABLE IF NOT EXISTS committee_delegation_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_committee_delegation_files_active
  ON committee_delegation_files(submission_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_committee_delegation_files_submission
  ON committee_delegation_files(submission_id, deleted_at);

CREATE TABLE IF NOT EXISTS committee_attendance_submission_logs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT,
  changed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_committee_attendance_submission_logs
  ON committee_attendance_submission_logs(submission_id, created_at DESC);
