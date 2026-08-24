# i-PaSS 성능 계측

모든 응답에는 `Server-Timing`이 포함된다. `app`은 Worker 전체 처리 시간, `d1`은 D1 왕복 대기 시간, `d1sql`은 D1이 보고한 SQL 실행 시간이다. API 요청은 같은 값을 구조화 로그와 `ipass_performance_v1` Analytics Engine 데이터셋에도 기록한다.

Analytics Engine 필드 배치는 다음과 같다.

## 서버 API

- `index1`: 정규화된 API 경로
- `blob1`~`blob5`: `server`, HTTP method, country, colo, HTTP status
- `double1`~`double8`: total ms, D1 wall ms, D1 engine ms, D1 round trips, D1 statements, rows read, rows written, HTTP status

한국 요청의 최근 24시간 p50·p95 예시:

```sql
SELECT
  index1 AS route,
  quantileWeighted(double1, _sample_interval, 0.50) AS p50_ms,
  quantileWeighted(double1, _sample_interval, 0.95) AS p95_ms,
  quantileWeighted(double2, _sample_interval, 0.95) AS d1_p95_ms
FROM ipass_performance_v1
WHERE blob1 = 'server'
  AND blob3 = 'KR'
  AND timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY index1
ORDER BY p95_ms DESC;
```

## 브라우저 RUM

- `index1`: 페이지 경로
- `blob1`~`blob5`: `client`, navigation type, country, colo, `page`
- `double1`~`double8`: page load, TTFB, DOM ready, FCP, LCP, authenticated API ready, resource count, sample count

한국 사용자 페이지 로드 p50·p95 예시:

```sql
SELECT
  index1 AS page,
  quantileWeighted(double1, _sample_interval, 0.50) AS p50_ms,
  quantileWeighted(double1, _sample_interval, 0.95) AS p95_ms,
  quantileWeighted(double5, _sample_interval, 0.95) AS lcp_p95_ms
FROM ipass_performance_v1
WHERE blob1 = 'client'
  AND blob3 = 'KR'
  AND timestamp >= NOW() - INTERVAL '1' DAY
GROUP BY index1
ORDER BY p95_ms DESC;
```

측정 데이터에는 사용자 ID, 협력사 ID, 평가 대상 ID, 파일명이나 제출 내용이 포함되지 않는다.
