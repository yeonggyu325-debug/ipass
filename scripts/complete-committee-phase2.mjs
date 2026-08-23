import fs from 'node:fs';

const indexPath='src/index.js';
let index=fs.readFileSync(indexPath,'utf8');

const normalizeRe=/function normalizeCommitteeRows\(rows, key, label\) \{[\s\S]*?\n\}\n\nfunction committeeSnapshotChanged/;
if(!normalizeRe.test(index)) throw new Error('normalizeCommitteeRows block not found');
const normalizeReplacement=`function parseCommitteeAttendeeList(positionValue, nameValue, label) {
  const parse = value => {
    const text = String(value ?? "").trim();
    if (!text) return [];
    if (text.startsWith("[")) {
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) return arr.map(v => String(v ?? "").trim());
      } catch {}
    }
    return [text];
  };
  const positions = parse(positionValue);
  const names = parse(nameValue);
  const count = Math.max(positions.length, names.length);
  const attendees = [];
  for (let i = 0; i < count; i++) {
    const position = positions[i] || "";
    const name = names[i] || "";
    if (!position && !name) continue;
    if (!position || !name) throw new Error(\`참석 \${label}의 직급과 성명을 모두 입력하세요.\`);
    attendees.push({ position, name });
  }
  return attendees;
}

function normalizeCommitteeRows(rows, key, label) {
  const out = [];
  const seen = new Set();
  for (const raw of rows || []) {
    const id = String(raw?.[key] || "").trim();
    const status = normalizeCommitteeStatus(raw?.attendance_status);
    if (!id || !status) throw new Error(\`\${label} 참석정보가 올바르지 않습니다.\`);
    if (seen.has(id)) throw new Error(\`같은 \${label}를 중복 선택할 수 없습니다.\`);
    seen.add(id);

    let attendeePosition = null;
    let attendeeName = null;
    if (status === "present") {
      const attendees = parseCommitteeAttendeeList(raw?.attendee_position, raw?.attendee_name, label);
      if (!attendees.length) throw new Error(\`참석 \${label}의 직급과 성명을 모두 입력하세요.\`);
      attendeePosition = attendees.length === 1 ? attendees[0].position : JSON.stringify(attendees.map(v => v.position));
      attendeeName = attendees.length === 1 ? attendees[0].name : JSON.stringify(attendees.map(v => v.name));
    }
    out.push({ [key]: id, attendance_status: status, attendee_position: attendeePosition, attendee_name: attendeeName });
  }
  return out;
}

function committeeSnapshotChanged`;
index=index.replace(normalizeRe,normalizeReplacement);

index=index.replace(
`              cm.id, cm.meeting_month, cm.meeting_date, cm.title, cm.note,\n              cpa.attendance_status, cpa.attendee_position, cpa.attendee_name`,
`              cm.id, cm.meeting_month, cm.meeting_date, cm.title, cm.note,\n              cpa.attendance_status,\n              CASE WHEN cpa.attendance_status = 'present' THEN cpa.attendee_position ELSE NULL END AS attendee_position,\n              CASE WHEN cpa.attendance_status = 'present' THEN cpa.attendee_name ELSE NULL END AS attendee_name`
);

index=index.replace(
`      SELECT cpa.company_id, c.company_name, cpa.attendance_status, cpa.attendee_position, cpa.attendee_name`,
`      SELECT cpa.company_id, c.company_name, cpa.attendance_status,\n        CASE WHEN cpa.attendance_status = 'present' THEN cpa.attendee_position ELSE NULL END AS attendee_position,\n        CASE WHEN cpa.attendance_status = 'present' THEN cpa.attendee_name ELSE NULL END AS attendee_name`
);
index=index.replace(
`      SELECT cda.department_id, cd.department_name, cd.sort_order, cda.attendance_status, cda.attendee_position, cda.attendee_name`,
`      SELECT cda.department_id, cd.department_name, cd.sort_order, cda.attendance_status,\n        CASE WHEN cda.attendance_status = 'present' THEN cda.attendee_position ELSE NULL END AS attendee_position,\n        CASE WHEN cda.attendance_status = 'present' THEN cda.attendee_name ELSE NULL END AS attendee_name`
);

if(!index.includes('function parseCommitteeAttendeeList')) throw new Error('attendee normalization not installed');
fs.writeFileSync(indexPath,index);

const htmlPath='public/committee.html';
let html=fs.readFileSync(htmlPath,'utf8');
const stampRe=/function stampHtml\(row,month\)\{[^\n]*\}/;
if(!stampRe.test(html)) throw new Error('stampHtml function not found');
html=html.replace(stampRe,`function stampHtml(row,month){const v=row.months[month],meeting=meetingByMonth(month);if(meeting&&meeting.status!=='finalized')return \`<button class="stamp none" type="button" disabled title="\${month}월 미확정">·</button>\`;if(!v||v.status==='pending')return \`<button class="stamp none \${meeting?'clickable':''}" type="button" \${meeting?\`data-month="\${month}" title="\${month}월 비대상"\`:'disabled'}>-</button>\`;if(v.status==='present')return \`<button class="stamp present clickable" type="button" data-month="\${month}" title="\${month}월 참석">✓</button>\`;return \`<button class="stamp absent clickable" type="button" data-month="\${month}" title="\${month}월 불참">×</button>\`}`);
fs.writeFileSync(htmlPath,html);
console.log('committee phase2 data integrity patch applied');
