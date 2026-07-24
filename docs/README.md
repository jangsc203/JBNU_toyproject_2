# docs 문서 구조

이 폴더는 프로젝트 문서를 단계와 성격별로 분류한다.

## 폴더

| 폴더 | 용도 |
|---|---|
| `01-planning/` | 문제 정의, 사용자 분석, 사용자 흐름, PRD, 요구사항 추적 |
| `02-service-prep/` | Supabase, KAMIS, Pinecone, Gemini, 환경변수/Secrets 준비 |
| `03-design/` | 아키텍처, 데이터 워크플로, DB 설계, 보안/RLS 설계 |
| `04-validation/` | 향후 테스트 리포트와 검증 문서 |

## 현재 핵심 문서

| 단계 | 문서 |
|---|---|
| 기획 | `01-planning/PRD.md` |
| 추적 | `01-planning/requirements-traceability.md` |
| 서비스 준비 | `02-service-prep/external-services-prep.md` |
| 아키텍처 | `03-design/architecture.md` |
| 데이터 흐름 | `03-design/data-workflow.md` |
| 데이터베이스 | `03-design/database-design.md` |
| 보안 | `03-design/security.md` |
| 벡터 인덱스 | `03-design/vector-index-design.md` |

## 진행 상태

| 작업 | 상태 | 산출물 |
|---|---|---|
| 3.1 시스템 아키텍처 문서 작성 | 완료 | `03-design/architecture.md` |
| 3.2 데이터 워크플로 문서 작성 | 완료 | `03-design/data-workflow.md` |
| 3.3 데이터베이스 설계 | 완료 | `03-design/database-design.md`, `../supabase/migrations/202607220001_initial_schema.sql`, `../supabase/seed.sql` |
| 3.4 RLS 및 보안 설계 | 완료 | `03-design/security.md`, `../supabase/migrations/202607220002_rls_policies.sql` |
| 4.1 품목 기준 데이터 구현 | 완료 | `../supabase/seed.sql` |
| 4.2 KAMIS 수집 Edge Function 구현 | 완료 | `../supabase/functions/sync-kamis-prices/index.ts` |
| 4.3 정기 수집 설정 | 완료 | `03-design/data-workflow.md`, `../supabase/functions/sync-kamis-prices/README.md` |
| 4.4 규칙 기반 위험 분석 구현 | 완료 | `../supabase/functions/calculate-risks/index.ts` |
| 5.1 Pinecone 인덱스 설계 문서 작성 | 완료 | `03-design/vector-index-design.md` |
| 5.2 검색용 문서 생성 구현 | 완료 | `../supabase/functions/generate-analysis-documents/index.ts`, `../supabase/functions/generate-analysis-documents/README.md` |
| 5.3 임베딩 및 Pinecone 동기화 구현 | 완료 | `../supabase/functions/sync-vectors/index.ts`, `../supabase/functions/sync-vectors/README.md` |
| 5.4 질문 의도 분류 및 검색 라우팅 구현 | 완료 | `../supabase/functions/ask-ai/index.ts`, `../supabase/functions/ask-ai/README.md` |
| 5.5 근거 기반 RAG 답변 구현 | 완료 | `../supabase/functions/generate-rag-answer/index.ts`, `../supabase/functions/generate-rag-answer/README.md` |
