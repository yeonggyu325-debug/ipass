import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const db=new DatabaseSync(':memory:');
const migrationsDir=new URL('../migrations/',import.meta.url);

// Baseline tables that predate the numbered runtime migrations.
db.exec(`
  CREATE TABLE companies(id TEXT PRIMARY KEY,company_name TEXT,industry_code TEXT,industry_name TEXT,status TEXT DEFAULT 'active');
  CREATE TABLE users(id TEXT PRIMARY KEY,firebase_uid TEXT,email TEXT,role TEXT,company_id TEXT,status TEXT DEFAULT 'active');
  CREATE TABLE portal_accounts(
    id TEXT PRIMARY KEY,firebase_uid TEXT UNIQUE,email TEXT,role TEXT,company_id TEXT,name TEXT,position TEXT,phone TEXT,
    privacy_agreed INTEGER DEFAULT 0,privacy_agreed_at TEXT,email_verified INTEGER DEFAULT 0,
    approval_status TEXT DEFAULT 'pending',rejection_reason TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE notifications(
    id TEXT PRIMARY KEY,recipient_user_id TEXT,title TEXT,message TEXT,type TEXT,is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE portal_notices(
    id TEXT PRIMARY KEY,title TEXT,content TEXT,is_important INTEGER DEFAULT 0,show_on_login INTEGER DEFAULT 0,
    show_after_login INTEGER DEFAULT 0,is_active INTEGER DEFAULT 1,start_at TEXT,end_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE evaluation_submission_logs_v2(
    id TEXT PRIMARY KEY,target_id TEXT,action TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const migrationNames=(await readdir(migrationsDir)).filter(name=>/^\d+_.+\.sql$/.test(name)).sort();
assert.ok(migrationNames.length>=8,'all numbered migrations must be discoverable');
for(const name of migrationNames)db.exec(await readFile(new URL(name,migrationsDir),'utf8'));
assert.equal(migrationNames.at(-1),'0013_enterprise_stabilization.sql','latest migration must be enterprise stabilization');

const indexes=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(row=>row.name));
const expectedIndexes=[
  'idx_eval_items_v2_template_type','idx_eval_targets_v2_cycle_company','idx_eval_target_items_v2_target_applicable',
  'idx_evidence_files_v2_target_live_created','idx_evidence_files_v2_item_live_created','idx_upload_reservations_v2_created',
  'idx_template_logs_v2_template_created','idx_cycle_logs_v2_cycle_created','idx_system_request_audit_v2_path_created',
  'idx_submission_requests_v2_target_created','idx_education_files_live_cover','idx_notifications_recipient_read_created',
  'idx_notifications_account_read_created','idx_notifications_dedupe_key','idx_eval_na_rules_v2_code_workers',
  'idx_eval_target_items_v2_target_status','idx_evaluation_edit_leases_v2_lookup'
];
for(const index of expectedIndexes)assert.ok(indexes.has(index),`missing index: ${index}`);

function columns(table){return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name))}
for(const column of ['recipient_account_id','entity_type','entity_id','dedupe_key'])assert.ok(columns('notifications').has(column),`notifications.${column} missing`);
for(const column of ['applicability_status','applicability_reason'])assert.ok(columns('evaluation_target_items_v2').has(column),`evaluation_target_items_v2.${column} missing`);
assert.ok(columns('evaluation_na_rules_v2').has('industry_code'),'evaluation_na_rules_v2.industry_code missing');

const schemaVersion=db.prepare("SELECT value FROM system_schema_metadata_v2 WHERE key='schema_version'").get();
assert.equal(schemaVersion.value,'0013');

db.exec(`
  INSERT INTO companies(id,company_name,industry_code,industry_name) VALUES('company','테스트','C29','기타 운송장비 제조업');
  INSERT INTO users(id,email,role) VALUES('legacy-admin','admin@example.com','admin');
  INSERT INTO portal_accounts(id,email,role,company_id,approval_status) VALUES('admin-account','admin@example.com','admin',NULL,'approved');
  INSERT INTO notifications(id,recipient_user_id,title,is_read) VALUES('legacy-note','legacy-admin','기존 알림',0);
  INSERT INTO evaluation_templates_v2(id,year,half,name) VALUES('template',2026,'second','test');
  INSERT INTO evaluation_cycles_v2(id,year,half,cycle_name,template_id,status) VALUES('cycle',2026,'second','test','template','active');
  INSERT INTO evaluation_targets_v2(id,cycle_id,company_id,is_selected,status,business_number,representative_name,worker_count)
    VALUES('target','cycle','company',1,'submitted','123','대표',10);
  INSERT INTO evaluation_target_items_v2(id,target_id,template_item_id,item_name,item_type,max_score,applicable,applicability_status,description,earned_score,sort_order)
    VALUES('base-1','target','item-1','기본 1','score',60,1,'applicable','자료',54,1),
          ('base-2','target','item-2','기본 2','score',40,1,'applicable',NULL,32,2),
          ('bonus','target','item-3','가점','bonus',5,1,'applicable','자료',3,3),
          ('na','target','item-4','비대상','score',10,0,'not_applicable',NULL,NULL,4),
          ('unknown','target','item-5','판정대기','score',0,1,'undetermined',NULL,NULL,5);
  INSERT INTO evaluation_evidence_files_v2(id,target_id,target_item_id,object_key,file_name,file_size)
    VALUES('file','target','base-2','key','evidence.pdf',100);
`);

// Canonical account migration can be safely re-applied as a data backfill.
db.exec(`UPDATE notifications SET recipient_account_id=(SELECT pa.id FROM users u JOIN portal_accounts pa ON LOWER(pa.email)=LOWER(u.email) WHERE u.id=notifications.recipient_user_id LIMIT 1) WHERE recipient_account_id IS NULL`);
assert.equal(db.prepare("SELECT recipient_account_id FROM notifications WHERE id='legacy-note'").get().recipient_account_id,'admin-account');

db.prepare(`UPDATE evaluation_target_items_v2 SET
  description=CASE id WHEN ? THEN ? WHEN ? THEN ? ELSE description END,
  needs_rescore=CASE WHEN earned_score IS NOT NULL THEN 1 ELSE needs_rescore END,
  partner_changed_at=CASE WHEN earned_score IS NOT NULL THEN CURRENT_TIMESTAMP ELSE partner_changed_at END,
  updated_at=CURRENT_TIMESTAMP
  WHERE target_id=? AND id IN (?,?)`).run('base-1','자료 변경','base-2','파일과 설명','target','base-1','base-2');
assert.deepEqual(db.prepare("SELECT id,description,needs_rescore FROM evaluation_target_items_v2 WHERE id IN ('base-1','base-2') ORDER BY id").all().map(row=>({...row})),[
  {id:'base-1',description:'자료 변경',needs_rescore:1},
  {id:'base-2',description:'파일과 설명',needs_rescore:1}
]);

const summarySql=`SELECT COUNT(*) AS total,
  SUM(CASE WHEN applicability_status='applicable' THEN 1 ELSE 0 END) AS applicable,
  SUM(CASE WHEN applicability_status='not_applicable' THEN 1 ELSE 0 END) AS na,
  SUM(CASE WHEN applicability_status='undetermined' THEN 1 ELSE 0 END) AS undetermined,
  SUM(CASE WHEN applicability_status='applicable' AND (TRIM(COALESCE(description,''))<>'' OR EXISTS(
    SELECT 1 FROM evaluation_evidence_files_v2 f WHERE f.target_id=evaluation_target_items_v2.target_id AND f.target_item_id=evaluation_target_items_v2.id AND f.deleted_at IS NULL
  )) THEN 1 ELSE 0 END) AS prepared
  FROM evaluation_target_items_v2 WHERE target_id=?`;
const summary=db.prepare(summarySql).get('target');
assert.deepEqual({...summary},{total:5,applicable:3,na:1,undetermined:1,prepared:3});

const leaseToken='lease-token-12345678';
db.prepare("INSERT INTO evaluation_edit_leases_v2(id,target_id,account_id,lease_token,expires_at) VALUES(?,?,?,?,datetime('now','+30 minutes'))").run('lease','target','admin-account',leaseToken);
assert.equal(db.prepare("SELECT lease_token FROM evaluation_edit_leases_v2 WHERE target_id='target'").get().lease_token,leaseToken);
assert.throws(()=>db.prepare("INSERT INTO evaluation_edit_leases_v2(id,target_id,account_id,lease_token,expires_at) VALUES(?,?,?,?,datetime('now','+30 minutes'))").run('lease2','target','admin-account','another-token'),/UNIQUE/);

db.prepare(`UPDATE evaluation_targets_v2 SET raw_score=(SELECT ROUND(MIN(100,MAX(0,
  CASE WHEN COALESCE(SUM(CASE WHEN applicability_status='applicable' AND item_type<>'bonus' THEN max_score ELSE 0 END),0)>0
    THEN COALESCE(SUM(CASE WHEN applicability_status='applicable' AND item_type<>'bonus' THEN earned_score ELSE 0 END),0)*100.0/
      SUM(CASE WHEN applicability_status='applicable' AND item_type<>'bonus' THEN max_score ELSE 0 END)
    ELSE 0 END+COALESCE(SUM(CASE WHEN applicability_status='applicable' AND item_type='bonus' THEN earned_score ELSE 0 END),0))),1)
  FROM evaluation_target_items_v2 WHERE target_id=?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run('target','target');
assert.equal(db.prepare("SELECT raw_score FROM evaluation_targets_v2 WHERE id='target'").get().raw_score,89);

console.log(JSON.stringify({
  success:true,
  migrations:migrationNames,
  latest_schema:schemaVersion.value,
  indexes:expectedIndexes.length,
  canonical_notifications:true,
  edit_leases:true,
  applicability_states:true,
  summary,
  raw_score:89
},null,2));
