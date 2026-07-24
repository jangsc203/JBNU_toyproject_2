# 요구사항 추적표

## 1. 문서 목적

이 문서는 PRD의 요구사항이 어떤 설계 문서, 구현 단계, 구현물, 테스트와 연결되는지 추적하기 위해 작성한다.

구현 중 PRD가 변경되면 요구사항 ID, 우선순위, 관련 설계, 테스트 상태도 함께 갱신해야 한다.

## 2. 기능 요구사항 추적표

| 요구사항 ID | 요약 | 설계 문서 | 구현 단계 | 주요 구현물 | 테스트 상태 |
|---|---|---|---|---|---|
| FR-01 | 활성 품목 목록 조회 | `docs/03-design/database-design.md`, `docs/03-design/architecture.md` | Phase 11, Phase 20 | `products`, Supabase 조회 모듈, 품목 UI | 정적 검증 완료 |
| FR-02 | KAMIS 가격 데이터 수집 | `docs/03-design/data-workflow.md`, `docs/03-design/architecture.md` | Phase 12 | 수집 Edge Function, `data_sync_jobs` | 정적 검증 완료 |
| FR-03 | 동일 품목·날짜 중복 방지 | `docs/03-design/database-design.md`, `docs/03-design/data-workflow.md` | Phase 9, Phase 12 | unique constraint, upsert 로직 | 정적 검증 완료 |
| FR-04 | 카드형 전체 대시보드 | `docs/01-planning/user-flow.md`, `docs/03-design/architecture.md` | Phase 20, Phase 21 | 대시보드 카드 UI, 최신 가격 조회 | 정적 검증 완료 |
| FR-05 | 품목별 기간 가격 추이 조회 | `docs/03-design/data-workflow.md`, `docs/03-design/database-design.md` | Phase 20, Phase 21 | 가격 추이 화면, 가격 조회 쿼리 | 정적 검증 완료 |
| FR-06 | 규칙 기반 위험 점수와 등급 계산 | `docs/03-design/data-workflow.md`, `docs/03-design/database-design.md` | Phase 14 | 위험 분석 Edge Function, `risk_results` | 정적 검증 완료 |
| FR-07 | 위험 점수 계산 근거 제공 | `docs/03-design/data-workflow.md`, `docs/03-design/database-design.md` | Phase 14, Phase 22 | 부분 점수, 가중치, 위험 상세 UI | 정적 검증 완료 |
| FR-08 | 검색용 문서 생성 | `docs/03-design/data-workflow.md`, `docs/03-design/database-design.md` | Phase 16 | `analysis_documents`, 문서 생성 로직 | 정적 검증 완료 |
| FR-09 | Pinecone 등록 | `docs/03-design/data-workflow.md`, `docs/03-design/architecture.md` | Phase 17 | 벡터 동기화 Edge Function, `vector_sync_jobs` | 정적 검증 완료 |
| FR-10 | 자연어 질의응답 | `docs/03-design/data-workflow.md`, `docs/03-design/architecture.md` | Phase 18, Phase 19, Phase 23 | 질문 처리 Edge Function, 채팅 UI | 정적 검증 완료 |
| FR-11 | AI 답변 기간/근거/한계 표시 | `docs/03-design/data-workflow.md`, `docs/01-planning/user-flow.md` | Phase 19, Phase 23 | 답변 구조, 근거 문서 UI | 정적 검증 완료 |
| FR-12 | 수집/분석/인덱싱 상태 확인 | `docs/03-design/data-workflow.md` | Phase 24 | 시스템 상태 화면, 작업 이력 조회 | 정적 검증 완료 |
| FR-13 | 로그인 사용자 대화 저장 | `docs/03-design/security.md`, `docs/03-design/database-design.md` | Phase 10, Phase 23 | `conversations`, `messages`, RLS | 정적 검증 완료 |
| FR-14 | 답변 피드백 저장 | `docs/03-design/security.md`, `docs/03-design/database-design.md` | Phase 10, Phase 23 | `feedback`, 피드백 UI, RLS | 정적 검증 완료 |
| FR-15 | AI 분석 보고서 생성/조회 | `docs/03-design/data-workflow.md`, `docs/03-design/database-design.md` | Phase 22 | `reports`, 보고서 Edge Function, 보고서 UI | 정적 검증 완료 |

## 3. 비기능 요구사항 추적표

| 요구사항 ID | 요약 | 설계 문서 | 구현 단계 | 주요 구현물 | 테스트 상태 |
|---|---|---|---|---|---|
| NFR-01 | 비밀키 브라우저 노출 방지 | `docs/03-design/security.md`, `docs/03-design/architecture.md` | Phase 10, Phase 12, Phase 17, Phase 19 | Supabase Secrets, Edge Functions | 정적 검증 완료 |
| NFR-02 | RLS 적용 | `docs/03-design/security.md` | Phase 10 | RLS policies, 권한 테스트 | 정적 검증 완료 |
| NFR-03 | 사용자 데이터 격리 | `docs/03-design/security.md` | Phase 10, Phase 23 | 대화/피드백 RLS | 정적 검증 완료 |
| NFR-04 | 일부 품목 실패가 전체 작업 중단 방지 | `docs/03-design/data-workflow.md` | Phase 12, Phase 13 | 품목별 작업 결과, 부분 실패 처리 | 정적 검증 완료 |
| NFR-05 | 작업 이력 저장 | `docs/03-design/data-workflow.md`, `docs/03-design/database-design.md` | Phase 12, Phase 14, Phase 17 | `data_sync_jobs`, `vector_sync_jobs` | 정적 검증 완료 |
| NFR-06 | Pinecone 벡터와 Supabase 원본 연결 | `docs/03-design/database-design.md`, `docs/03-design/data-workflow.md` | Phase 15, Phase 17 | vector metadata, source document ID | 정적 검증 완료 |
| NFR-07 | 위험 점수 재현성 | `docs/03-design/data-workflow.md` | Phase 14 | 위험 계산 함수, 고정 가중치 | 정적 검증 완료 |
| NFR-08 | 로딩/오류/빈 데이터 상태 구분 | `docs/01-planning/user-flow.md` | Phase 20~24 | 공통 상태 컴포넌트 | 정적 검증 완료 |
| NFR-09 | 모바일 반응형 | `docs/03-design/architecture.md` | Phase 20~24 | 반응형 레이아웃 | 정적 검증 완료 |

## 4. 우선 구현 대상

첫 번째 완성본은 Must Have 요구사항을 기준으로 한다.

| 우선순위 | 요구사항 |
|---|---|
| 1 | FR-01, FR-03, FR-04, FR-05 |
| 2 | FR-02, FR-06, FR-07 |
| 3 | FR-08, FR-09 |
| 4 | FR-10, FR-11 |

대시보드 중심의 사용자 경험을 먼저 확인하기 위해 품목 조회, 가격 조회, 카드형 대시보드, 가격 추이를 초반 구현 대상으로 둔다. 외부 API Key 준비가 늦어질 경우 Mock 데이터로 UI와 데이터 흐름을 먼저 검증한다.

## 5. 변경 관리 규칙

1. 새 기능이 필요하면 먼저 PRD의 기능 요구사항을 수정한다.
2. 요구사항 ID를 추가하거나 기존 ID의 우선순위를 변경한다.
3. 영향받는 설계 문서와 구현 단계를 갱신한다.
4. 요구사항 추적표의 테스트 상태를 갱신한다.
5. 구현 후 회귀 테스트를 실행한다.

## 6. 현재 승인 대기 항목

| 항목 | 현재 제안 |
|---|---|
| 주요 사용자 | 유통 관계자 |
| 첫 화면 | 품목별 현재 시세와 간단한 가격 흐름 카드가 나열된 전체 대시보드 |
| Must Have 범위 | FR-01 ~ FR-11 |
| Should Have 범위 | FR-12 ~ FR-15 |
| 제외 범위 | 미래 가격 예측, 자동 거래, 결제, 모바일 네이티브 앱, 운영 배포, 별도 백엔드 서버 |

