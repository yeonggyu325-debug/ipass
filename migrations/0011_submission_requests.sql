CREATE TABLE IF NOT EXISTS evaluation_submission_requests_v2 (
  request_id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing','completed','failed')),
  response_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_submission_requests_v2_target_created
  ON evaluation_submission_requests_v2(target_id, created_at DESC);
