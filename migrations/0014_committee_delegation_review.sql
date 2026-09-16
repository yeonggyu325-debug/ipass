-- Separate administrator attendance records from partner delegation submissions.
CREATE TABLE IF NOT EXISTS committee_attendance_records (
  meeting_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  attendance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(attendance_status IN ('pending','present','absent')),
  attendee_position TEXT,
  attendee_name TEXT,
  attendee_type TEXT CHECK(attendee_type IN ('representative','delegate')),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(meeting_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_committee_attendance_records_meeting
  ON committee_attendance_records(meeting_id, company_id);

ALTER TABLE committee_attendance_submissions ADD COLUMN delegation_reason TEXT;
ALTER TABLE committee_attendance_submissions ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK(review_status IN ('pending','approved','rejected'));
ALTER TABLE committee_attendance_submissions ADD COLUMN review_comment TEXT;
ALTER TABLE committee_attendance_submissions ADD COLUMN reviewed_by TEXT;
ALTER TABLE committee_attendance_submissions ADD COLUMN reviewed_at TEXT;
