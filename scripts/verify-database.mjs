import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
const migrationFiles = [
  new URL('../migrations/0006_evaluation_runtime_baseline.sql', import.meta.url),
  new URL('../migrations/0007_fast_database_hot_paths.sql', import.meta.url),
  new URL('../migrations/0011_submission_requests.sql', import.meta.url)
];

for (const file of migrationFiles) db.exec(await readFile(file, 'utf8'));

const expectedIndexes = [
  'idx_eval_items_v2_template_type',
  'idx_eval_targets_v2_cycle_company',
  'idx_eval_target_items_v2_target_applicable',
  'idx_evidence_files_v2_target_live_created',
  'idx_evidence_files_v2_item_live_created',
  'idx_upload_reservations_v2_created',
  'idx_template_logs_v2_template_created',
  'idx_cycle_logs_v2_cycle_created',
  'idx_system_request_audit_v2_path_created',
  'idx_submission_requests_v2_target_created'
];

const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row => row.name));
for (const index of expectedIndexes) assert(indexes.has(index), `missing index: ${index}`);

db.exec(`
  INSERT INTO evaluation_templates_v2 (id,year,half,name) VALUES ('template',2026,'second','test');
  INSERT INTO evaluation_cycles_v2 (id,year,half,cycle_name,template_id,status) VALUES ('cycle',2026,'second','test','template','active');
  INSERT INTO evaluation_targets_v2 (id,cycle_id,company_id,is_selected,status,business_number,representative_name,worker_count)
    VALUES ('target','cycle','company',1,'submitted','123','대표',10);
  INSERT INTO evaluation_target_items_v2 (id,target_id,template_item_id,item_name,item_type,max_score,applicable,description,earned_score,sort_order)
    VALUES ('base-1','target','item-1','기본 1','score',60,1,'자료',54,1),
           ('base-2','target','item-2','기본 2','score',40,1,NULL,32,2),
           ('bonus','target','item-3','가점','bonus',5,1,'자료',3,3),
           ('na','target','item-4','비대상','score',10,0,NULL,NULL,4);
  INSERT INTO evaluation_evidence_files_v2 (id,target_id,target_item_id,object_key,file_name,file_size)
    VALUES ('file','target','base-2','key','evidence.pdf',100);
`);

db.prepare(`UPDATE evaluation_target_items_v2 SET
  description=CASE id WHEN ? THEN ? WHEN ? THEN ? ELSE description END,
  needs_rescore=CASE WHEN 1=1 AND earned_score IS NOT NULL THEN 1 ELSE needs_rescore END,
  partner_changed_at=CASE WHEN 1=1 AND earned_score IS NOT NULL THEN CURRENT_TIMESTAMP ELSE partner_changed_at END,
  updated_at=CURRENT_TIMESTAMP
  WHERE target_id=? AND id IN (?,?)`).run('base-1','자료 변경','base-2','파일과 설명','target','base-1','base-2');
assert.deepEqual(db.prepare(`SELECT id,description,needs_rescore FROM evaluation_target_items_v2 WHERE id IN ('base-1','base-2') ORDER BY id`).all().map(row=>({...row})),[
  {id:'base-1',description:'자료 변경',needs_rescore:1},
  {id:'base-2',description:'파일과 설명',needs_rescore:1}
]);

const summarySql = `SELECT COUNT(*) AS total,
  SUM(CASE WHEN ti.applicable<>0 THEN 1 ELSE 0 END) AS applicable,
  SUM(CASE WHEN ti.applicable=0 THEN 1 ELSE 0 END) AS na,
  SUM(CASE WHEN ti.applicable<>0 AND (
    TRIM(COALESCE(ti.description,''))<>'' OR EXISTS (
      SELECT 1 FROM evaluation_evidence_files_v2 f
      WHERE f.target_id=ti.target_id AND f.target_item_id=ti.id AND f.deleted_at IS NULL
    )
  ) THEN 1 ELSE 0 END) AS prepared
  FROM evaluation_target_items_v2 ti WHERE ti.target_id=?`;
const summary = db.prepare(summarySql).get('target');
assert.deepEqual({ ...summary }, { total: 4, applicable: 3, na: 1, prepared: 3 });

const plan = db.prepare(`EXPLAIN QUERY PLAN ${summarySql}`).all('target').map(row => row.detail).join('\n');
assert.match(plan, /idx_eval_target_items_v2_target_applicable|idx_eval_target_items_v2_target/);
assert.match(plan, /idx_evidence_files_v2_item_live_created|idx_evidence_files_v2_target_live_created|idx_evidence_files_v2_item/);

db.prepare(`UPDATE evaluation_targets_v2 SET raw_score=(SELECT ROUND(MIN(100,MAX(0,
  CASE WHEN COALESCE(SUM(CASE WHEN applicable<>0 AND item_type<>'bonus' THEN max_score ELSE 0 END),0)>0
    THEN COALESCE(SUM(CASE WHEN applicable<>0 AND item_type<>'bonus' THEN earned_score ELSE 0 END),0)*100.0/
      SUM(CASE WHEN applicable<>0 AND item_type<>'bonus' THEN max_score ELSE 0 END)
    ELSE 0 END+
  COALESCE(SUM(CASE WHEN applicable<>0 AND item_type='bonus' THEN earned_score ELSE 0 END),0))),1)
  FROM evaluation_target_items_v2 WHERE target_id=?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run('target','target');
assert.equal(db.prepare('SELECT raw_score FROM evaluation_targets_v2 WHERE id=?').get('target').raw_score, 89);

console.log(JSON.stringify({ success: true, indexes: expectedIndexes.length, bulk_update: true, summary, raw_score: 89, query_plan: plan }, null, 2));
