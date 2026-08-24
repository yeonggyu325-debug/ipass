# Hniruja 협력사 EHS 포털 V16.4.1

## 협의체
- 연도/월당 협의체 1개
- 월별 대상 협력사/사내부서를 관리자가 직접 선택
- 선택 대상은 참석/불참 + 직급 + 성명 기록
- 참석 시 직급/성명 필수, 불참 시 비워둘 수 있음
- 협력사 불참 1회당 -3점, 10점 만점/최소 0점
- 사내 부서 참석은 점수 미적용
- V16.4 속도 최적화 유지

## 배포
ZIP을 풀고 이 폴더 안의 public, src, migrations, package.json, wrangler.jsonc 등을 GitHub 저장소 루트에 그대로 덮어씁니다. ZIP 파일 자체를 저장소에 올리는 것이 아닙니다.

D1 변경이 포함된 배포는 `npm run deploy`를 사용합니다. 이 명령은 원격 D1 migration을 먼저 적용하고 Worker를 배포합니다. Cloudflare Git 자동 배포의 deploy command도 `npm run deploy`로 설정합니다.

성능 지표의 필드 구성과 한국 사용자 p50·p95 조회문은 `PERFORMANCE_METRICS.md`에 정리되어 있습니다.
