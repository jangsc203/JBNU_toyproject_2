# 테스트 및 검증 보고서

## 1. 목적

이 문서는 7. 테스트 및 검증 단계의 수행 결과를 정리한다.

실행 가능한 항목은 실제 명령으로 검증했고, 현재 환경 제약으로 실행할 수 없는 항목은 정적 검증과 차단 사유를 함께 남겼다.

## 2. 실행 요약

| 구분 | 검증 항목 | 결과 | 증빙 |
|---|---|---|---|
| 프론트엔드 | `npm.cmd run build` | PASS | Vite production build 성공 |
| 프론트엔드 | `npm.cmd run lint` | PASS | ESLint 통과 |
| Supabase CLI | `supabase --version` | PASS | CLI 2.109.1 확인 |
| Edge Functions | `supabase functions serve` smoke test | BLOCKED | Docker Desktop 필요 |
| Database | `supabase db lint --local` | BLOCKED | 로컬 Postgres 연결 실패 |

## 3. 7.1 데이터베이스 테스트

### 수행 내용

- `supabase/migrations/202607220001_initial_schema.sql`
- `supabase/migrations/202607220002_rls_policies.sql`
- `supabase/functions/*`

### 정적 검증 결과

- `products`, `price_records`, `risk_results`, `analysis_documents`, `reports`, `conversations`, `messages`, `feedback`의 핵심 제약조건이 정의되어 있다.
- `price_records`는 중복 방지를 위한 자연 키 인덱스를 사용한다.
- `risk_results`는 분석 키와 latest 키를 분리해서 중복 및 최신값 관리를 한다.
- `analysis_documents`와 `vector_sync_jobs`는 상태값 제약을 통해 인덱싱 흐름을 통제한다.
- RLS 정책은 공개 조회, 사용자 소유 데이터, 서비스 롤 쓰기 경로를 구분한다.

### 실행 결과

- `supabase db lint --local --workdir supabase`
- 결과: 로컬 Postgres 연결 실패
- 원인: Docker 기반 로컬 Supabase 스택이 실행되지 않음

## 4. 7.2 Edge Functions 테스트

### 정적 검증 결과

- `sync-kamis-prices`는 `upsert`와 입력 검증을 포함한다.
- 일부 품목 실패가 전체 작업을 멈추지 않도록 작업 단위 결과를 누적하는 구조를 확인했다.
- `calculate-risks`는 `is_latest` 갱신과 `score_version` 기준 업서트를 사용한다.
- `generate-analysis-documents`는 최신 위험 결과 기준으로 문서를 생성하고 `vector_status`를 `pending`으로 둔다.
- `sync-vectors`는 `vector_status` 기준 재처리와 Pinecone upsert를 분리한다.
- `generate-rag-answer`는 대화 역할, 근거 문서, 데이터 한계를 함께 다룬다.

### 실행 결과

- `supabase functions serve sync-kamis-prices --no-verify-jwt --env-file supabase\\.env --workdir supabase`
- 결과: BLOCKED
- 원인: Docker Desktop이 필요함

## 5. 7.3 위험 분석 테스트

### 정적 검증 결과

- 위험 점수는 규칙 기반으로 계산되며 동일 입력에 대해 같은 결과를 반환하도록 설계되어 있다.
- `risk_score`는 0~100 범위로 제한된다.
- `high`, `watch`, `stable`, `insufficient_data`의 등급 경계가 코드와 문서에 분리되어 있다.
- 결측치나 데이터 부족은 0점으로 덮지 않고 별도 상태로 구분한다.

## 6. 7.4 Pinecone 및 RAG 테스트

### 정적 검증 결과

- `analysis_documents`의 벡터 상태는 `pending`, `synced`, `failed`, `skipped`로 관리된다.
- `sync-vectors`는 문서 해시와 상태를 기준으로 중복 등록과 재처리를 제어한다.
- Pinecone upsert 요청은 문서 원본 ID와 메타데이터를 포함한다.
- RAG 응답 흐름은 원본 문서 재검증과 근거 유지에 초점을 둔다.
- 프롬프트 인젝션 방지와 근거 부족 응답 처리가 코드 경로에 반영되어 있다.

## 7. 7.5 프론트엔드 테스트

### 실행 결과

- `npm.cmd run build` PASS
- `npm.cmd run lint` PASS

### 확인 내용

- 첫 화면은 대시보드이며, 작물 박스 형태의 가격 카드가 가장 먼저 보인다.
- 사이드바로 `Dashboard`, `Prices`, `Risks`, `Reports`, `Chat`, `System` 페이지를 전환할 수 있다.
- 카드, 검색창, 요약 영역, 상태 패널이 모바일 폭에서도 겹치지 않도록 구성되어 있다.

## 8. 7.6 요구사항 검증표 업데이트

검증 상태는 `docs/01-planning/requirements-traceability.md`에 반영했다.

## 9. 결론

현재 환경에서 실제로 실행 가능한 검증은 프론트엔드 빌드와 린트까지 완료됐다.

Supabase 로컬 함수 서버와 로컬 데이터베이스 검증은 Docker Desktop 부재로 차단되었으며, 해당 부분은 정적 코드 검증 결과를 함께 기록했다.
