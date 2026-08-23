import fs from 'node:fs';

const indexPath='src/index.js';
let index=fs.readFileSync(indexPath,'utf8');

const oldBatch='const [meetingResult, companyResult, departmentResult] = await env.partner_evaluation_db.batch([';
const newBatch='const [meetingResult, companyResult, departmentResult, annualScoreResult] = await env.partner_evaluation_db.batch([';
if(!index.includes(oldBatch)) throw new Error('committee admin batch marker not found');
index=index.replace(oldBatch,newBatch);

const departmentTail=`            env.partner_evaluation_db.prepare(\`\n              SELECT id, department_name, sort_order\n              FROM committee_departments\n              WHERE is_active = 1\n              ORDER BY sort_order, department_name\n            \`)\n          ]);`;
const annualTail=`            env.partner_evaluation_db.prepare(\`\n              SELECT id, department_name, sort_order\n              FROM committee_departments\n              WHERE is_active = 1\n              ORDER BY sort_order, department_name\n            \`),\n            env.partner_evaluation_db.prepare(\`\n              SELECT\n                c.id AS company_id, c.company_name,\n                COALESCE(s.finalized_meeting_count, 0) AS finalized_meeting_count,\n                COALESCE(s.present_count, 0) AS present_count,\n                COALESCE(s.absence_count, 0) AS absence_count,\n                MAX(0, 10 - COALESCE(s.absence_count, 0) * 3) AS committee_score\n              FROM companies c\n              LEFT JOIN (\n                SELECT\n                  cpa.company_id,\n                  COUNT(*) AS finalized_meeting_count,\n                  SUM(CASE WHEN cpa.attendance_status = 'present' THEN 1 ELSE 0 END) AS present_count,\n                  SUM(CASE WHEN cpa.attendance_status = 'absent' THEN 1 ELSE 0 END) AS absence_count\n                FROM committee_partner_attendance cpa\n                JOIN committee_meetings cm ON cm.id = cpa.meeting_id\n                WHERE cm.year = ? AND cm.status = 'finalized'\n                GROUP BY cpa.company_id\n              ) s ON s.company_id = c.id\n              WHERE c.status = 'active'\n              ORDER BY c.company_name COLLATE NOCASE\n            \`).bind(year)\n          ]);`;
if(!index.includes(departmentTail)) throw new Error('committee department batch tail not found');
index=index.replace(departmentTail,annualTail);

const oldReturn=`            options: {\n              companies: companyResult?.results || [],\n              departments: departmentResult?.results || []\n            }\n          });`;
const newReturn=`            options: {\n              companies: companyResult?.results || [],\n              departments: departmentResult?.results || []\n            },\n            annual_scores: annualScoreResult?.results || [],\n            scoring_rule: { max_score: 10, deduction_per_absence: 3, finalized_only: true }\n          });`;
if(!index.includes(oldReturn)) throw new Error('committee admin response marker not found');
index=index.replace(oldReturn,newReturn);
fs.writeFileSync(indexPath,index);

const htmlPath='public/committee.html';
let html=fs.readFileSync(htmlPath,'utf8');

const annualRows=/function annualRows\(type\)\{[^\n]*\}/;
if(!annualRows.test(html)) throw new Error('annualRows function not found');
html=html.replace(annualRows,`function officialPartnerSummary(id){return (annualData?.annual_scores||[]).find(x=>String(x.company_id)===String(id))||null}\nfunction annualRows(type){const key=type==='partner'?'company_id':'department_id',nameKey=type==='partner'?'company_name':'department_name',listKey=type==='partner'?'partners':'departments',map=new Map();for(const meeting of annualData?.meetings||[]){if(meeting.status!=='finalized')continue;const d=detailCache.get(meeting.id);if(!d)continue;const month=monthOf(meeting);for(const r of d[listKey]||[]){if(!map.has(r[key]))map.set(r[key],{id:r[key],name:r[nameKey]||r[key],months:{}});map.get(r[key]).months[month]={status:r.attendance_status,finalized:true}}}return [...map.values()].sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko'))}`);

const absence=/function absenceHtml\(row\)\{[^\n]*\}/;
if(!absence.test(html)) throw new Error('absenceHtml function not found');
html=html.replace(absence,`function absenceHtml(row,type){const n=Object.values(row.months).filter(x=>x.finalized&&x.status==='absent').length,cls=n===0?'zero':n===1?'one':'many';if(type==='partner'){const official=officialPartnerSummary(row.id),score=official?Number(official.committee_score):Math.max(0,10-n*3),label=n===0?'-':n+'회';return \`<div class="absence-count \${cls}" title="확정 회차만 반영">\${label} · \${score}점</div>\`}if(n===0)return '<div class="absence-count zero">-</div>';return \`<div class="absence-count \${cls}">\${n}회</div>\`}`);

const section=/function annualSection\(type,title\)\{[^\n]*\}/;
if(!section.test(html)) throw new Error('annualSection function not found');
html=html.replace(section,`function annualSection(type,title){const rows=annualRows(type),last=type==='partner'?'불참 / 점수':'불참 횟수';const head=\`<div class="att-head"><span>\${title}</span>\${Array.from({length:12},(_,i)=>\`<span class="months-label">\${i+1}월</span>\`).join('')}<span class="absence-head">\${last}</span></div>\`;if(!rows.length)return \`<div class="att-section-title">\${title}</div>\${head}<div class="annual-empty">확정된 출석현황이 없습니다.</div>\`;return \`<div class="att-section-title">\${title}</div>\${head}\${rows.map(r=>\`<div class="att-row"><div class="att-org">\${esc(r.name)}</div>\${Array.from({length:12},(_,i)=>stampHtml(r,i+1)).join('')}\${absenceHtml(r,type)}</div>\`).join('')}\`}`);

fs.writeFileSync(htmlPath,html);
console.log('committee phase1 completion patch applied');
