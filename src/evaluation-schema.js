let schemaReady=false;

export async function ensureEvaluationManagementSchema(env){
  if(schemaReady)return;
  await env.partner_evaluation_db.batch([
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_templates_v2 (
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
      UNIQUE(year,half,version)
    )`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_categories_v2 (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      parent_id TEXT,
      category_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_categories_v2_template ON evaluation_categories_v2(template_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_items_v2 (
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
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_items_v2_template ON evaluation_items_v2(template_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_na_rules_v2 (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      industry_name TEXT,
      min_worker_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`),
    env.partner_evaluation_db.prepare(`CREATE INDEX IF NOT EXISTS idx_eval_na_rules_v2_item ON evaluation_na_rules_v2(item_id,sort_order)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS ipass_policy_settings_v2 (
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
    )`),
    env.partner_evaluation_db.prepare(`INSERT OR IGNORE INTO ipass_policy_settings_v2 (
      id,excellence_threshold,first_half_exempt_enabled,normal_first_half_weight,normal_second_half_weight,exempt_second_half_weight,committee_weight,industrial_accident_weight
    ) VALUES (1,90,1,40,40,80,10,10)`),
    env.partner_evaluation_db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_template_logs_v2 (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      action TEXT NOT NULL,
      detail_json TEXT,
      changed_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
  ]);
  schemaReady=true;
}
