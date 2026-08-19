# I-PASS Firebase Auth v3

GitHub 저장소에 아래 파일을 덮어쓴 뒤 Commit 하세요.

- public/index.html
- src/index.js
- wrangler.jsonc
- package.json

전제:
1. Firebase Authentication에서 Email/Password가 활성화되어 있어야 합니다.
2. Firebase UID가 D1 users.firebase_uid에 연결되어 있어야 합니다.
3. Cloudflare Worker의 D1 binding 이름은 partner_evaluation_db 이어야 합니다.

배포 후:
- https://ipass.i-pass-eval.workers.dev/
- Firebase에서 만든 관리자 이메일/비밀번호로 로그인
