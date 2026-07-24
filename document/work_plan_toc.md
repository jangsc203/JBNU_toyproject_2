# 향후 작업 순서 목차 및 사용자 준비 사항

## 0. 진행 원칙

이 프로젝트는 바로 구현부터 시작하지 않고, PRD와 요구사항 추적표를 먼저 확정한 뒤 설계, 구현, 테스트 순서로 진행한다.

작업 중 외부 서비스 계정 생성, API Key 발급, Supabase 프로젝트 생성처럼 사용자의 계정 권한이 필요한 일은 사용자가 직접 진행해야 한다. 나는 그 결과값을 바탕으로 프로젝트 파일, 설정, 코드, 문서, 테스트를 작성한다.

비밀키는 저장소에 직접 기록하지 않고 `.env.local`, Supabase Secrets, 또는 로컬 환경변수에만 둔다.

## 1. 문서 및 기획 단계

### 1.1 문제 정의서 작성

- 생성 파일: `docs/01-planning/problem-definition.md`
- 작업 내용:
  - 전남 특산 농수산물 가격 확인 과정의 문제 정의
  - 가격 변동과 수급 위험 분석이 필요한 이유 정리
  - 해결 범위와 제외 범위 구분
  - 초기 성공 기준 작성
- 사용자 준비 사항:
  - 주요 관심 품목 후보가 있으면 공유
  - 주요 사용자 후보를 선택하거나 의견 제공

### 1.2 사용자 및 이해관계자 분석

- 생성 파일: `docs/01-planning/users-and-stakeholders.md`
- 작업 내용:
  - 주요 사용자 1개 그룹 선정
  - 보조 사용자 그룹 정의
  - 사용자 목표, 어려움, 사용 환경, 신뢰 조건 정리
- 사용자 준비 사항:
  - 주요 사용자를 누구로 둘지 결정
    - 예: 생산자, 유통 관계자, 지역 행정 담당자, 시장 분석 담당자, 교육 과정 수강생

### 1.3 사용자 흐름 작성

- 생성 파일: `docs/01-planning/user-flow.md`
- 작업 내용:
  - 최신 가격 확인 흐름
  - 특정 품목 가격 추이 확인 흐름
  - 위험 점수와 계산 근거 확인 흐름
  - AI 질의응답 흐름
  - 데이터 없음, 수집 실패, 검색 근거 부족 흐름
- 사용자 준비 사항:
  - 서비스에서 가장 먼저 보여야 할 화면에 대한 선호 의견 제공

### 1.4 PRD 작성 및 확정

- 생성 파일: `docs/01-planning/PRD.md`
- 작업 내용:
  - 프로젝트 배경, 목표, 비목표 정리
  - 기능 요구사항 작성
  - 비기능 요구사항 작성
  - 데이터 요구사항 작성
  - 화면 요구사항 작성
  - 성공 기준과 위험 요소 작성
- 사용자 준비 사항:
  - Must Have 범위 승인
  - 제외할 기능 승인

### 1.5 요구사항 추적표 작성

- 생성 파일: `docs/01-planning/requirements-traceability.md`
- 작업 내용:
  - PRD 요구사항 ID와 설계, 구현, 테스트 연결
  - 구현 중 누락 여부를 확인할 기준 마련
- 사용자 준비 사항:
  - 없음

## 2. 외부 서비스 준비 단계

### 2.1 Supabase 프로젝트 생성

- 사용자가 해야 할 일:
  - Supabase 계정 로그인
  - 새 프로젝트 생성
  - 프로젝트 URL 확인
  - anon public key 확인
  - service role key 확인
  - Database password 보관
- 사용자가 나에게 제공해야 할 값:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Supabase CLI 연결에 필요한 project ref
- 주의:
  - `service_role` key는 프론트엔드 `.env`에 넣으면 안 된다.
  - service role key가 필요하면 Supabase Edge Functions Secrets로만 등록한다.

### 2.2 Supabase CLI 로그인 및 프로젝트 연결

- 내가 진행할 일:
  - 로컬 `supabase/` 구조 확인 또는 생성
  - 마이그레이션 파일 작성
  - Edge Functions 구조 작성
  - 로컬 환경변수 예시 파일 작성
- 사용자가 해야 할 일:
  - Supabase CLI 로그인이 필요한 경우 브라우저 인증 진행
  - 로컬 프로젝트와 Supabase 원격 프로젝트 연결 승인
- 사용자가 나에게 제공해야 할 값:
  - Supabase project ref

### 2.3 KAMIS Open API Key 준비

- 사용자가 해야 할 일:
  - KAMIS Open API 사용 신청
  - API 인증키 발급
  - 요청 가능한 품목 코드 또는 API 문서 확인
- 사용자가 나에게 제공해야 할 값:
  - `KAMIS_API_KEY`
  - `KAMIS_API_ID` 또는 계정 식별자가 별도로 필요한 경우 해당 값
  - 실제 사용할 품목 코드 후보
- 주의:
  - KAMIS Key는 브라우저에 노출하지 않는다.
  - Supabase Edge Functions Secrets에 등록한다.

### 2.4 Pinecone 프로젝트 및 인덱스 준비

- 사용자가 해야 할 일:
  - Pinecone 계정 로그인
  - 새 프로젝트 또는 기존 프로젝트 선택
  - 인덱스 생성
  - API Key 발급
  - 인덱스 이름과 host 확인
- 사용자가 나에게 제공해야 할 값:
  - `PINECONE_API_KEY`
  - `PINECONE_INDEX_NAME`
  - `PINECONE_HOST`
- 주의:
  - Pinecone 인덱스 차원은 사용할 Gemini 임베딩 모델의 출력 차원과 맞아야 한다.
  - Pinecone은 원본 DB가 아니라 파생 검색 저장소로만 사용한다.

### 2.5 Gemini API Key 준비

- 사용자가 해야 할 일:
  - Google AI Studio 또는 Google Cloud에서 Gemini API Key 발급
  - 사용할 모델 확인
- 사용자가 나에게 제공해야 할 값:
  - `GEMINI_API_KEY`
  - 사용할 텍스트 생성 모델명
  - 사용할 임베딩 모델명
- 주의:
  - Gemini Key는 브라우저에 노출하지 않는다.
  - Edge Functions Secrets에 등록한다.

### 2.6 환경변수 및 Secrets 정리

- 생성 또는 수정 파일:
  - `.env.example`
  - `frontend/.env.example`
  - Supabase Secrets 설정 문서
- 내가 진행할 일:
  - 저장소에 안전한 예시 변수명만 작성
  - 실제 키가 git에 포함되지 않도록 `.gitignore` 점검
  - Edge Functions에서 사용할 Secrets 이름 표준화
- 사용자 준비 사항:
  - 실제 키 값을 로컬 또는 Supabase Secrets에 입력

## 3. 아키텍처 및 데이터 설계 단계

### 3.1 시스템 아키텍처 문서 작성

- 생성 파일: `docs/03-design/architecture.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - React, Supabase, Edge Functions, KAMIS, Pinecone, Gemini 연결 구조 작성
  - 브라우저 직접 호출 금지 대상 명시
  - 인증과 권한 흐름 표시
  - 실패 시 데이터 보존 방식 작성
- 완료 내용:
  - 전체 시스템 구성도와 구성 요소별 책임을 정리했다.
  - 브라우저 직접 호출 금지 대상과 허용 호출 위치를 명시했다.
  - Supabase를 Source of Truth로 두고 Pinecone을 파생 검색 저장소로 사용하는 원칙을 정리했다.
  - 주요 Edge Functions 후보와 실패 시 Supabase 원본 데이터 보존 원칙을 정리했다.

### 3.2 데이터 워크플로 문서 작성

- 생성 파일: `docs/03-design/data-workflow.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 가격 수집 흐름
  - 위험 분석 흐름
  - 검색용 문서 생성 흐름
  - Pinecone 동기화 흐름
  - RAG 질의응답 흐름
  - 실패 및 재처리 흐름
- 완료 내용:
  - KAMIS 가격 수집, 정규화, Supabase upsert 흐름을 정리했다.
  - 규칙 기반 위험 분석 입력값, 후보 지표, 등급 후보를 정리했다.
  - 검색용 문서 생성, content hash, Gemini 임베딩, Pinecone upsert 기준을 정리했다.
  - RAG 질문 유형별 데이터 라우팅과 답변 필수 구조를 정리했다.
  - 실패 유형별 기록 위치와 재처리 원칙을 정리했다.

### 3.3 데이터베이스 설계

- 생성 파일:
  - `docs/03-design/database-design.md`
  - `supabase/migrations/*.sql`
  - `supabase/seed.sql`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - `products`
  - `price_records`
  - `data_sync_jobs`
  - `risk_results`
  - `analysis_documents`
  - `vector_sync_jobs`
  - `reports`
  - `conversations`
  - `messages`
  - `feedback`
- 완료 내용:
  - 초기 스키마 마이그레이션 `supabase/migrations/202607220001_initial_schema.sql`을 작성했다.
  - `products`, `price_records`, `data_sync_jobs`, `risk_results`, `analysis_documents`, `vector_sync_jobs`, `reports`, `conversations`, `messages`, `feedback` 테이블을 정의했다.
  - 동일 품목·동일 날짜·동일 지역·동일 도소매 구분·동일 시장 기준 가격 중복 방지 unique index를 작성했다.
  - Pinecone 벡터와 Supabase 원본 문서 연결을 위한 `analysis_documents`, `vector_sync_jobs` 구조를 작성했다.
  - 초기 품목 후보 seed `supabase/seed.sql`을 작성했다.
  - 로컬 적용 검증은 Docker Desktop 미실행으로 보류되었다.
- 사용자 준비 사항:
  - 실제 사용할 품목 수와 품목 후보 확정

### 3.4 RLS 및 보안 설계

- 생성 파일:
  - `docs/03-design/security.md`
  - Supabase RLS migration
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 공개 조회 가능 데이터 정의
  - 로그인 사용자별 대화/피드백 격리
  - 관리자 또는 Edge Function만 수정 가능한 테이블 구분
  - service role key 프론트엔드 노출 방지
- 완료 내용:
  - RLS 마이그레이션 `supabase/migrations/202607220002_rls_policies.sql`을 작성했다.
  - 모든 public 테이블에 RLS를 활성화했다.
  - 품목, 가격, 위험 결과는 공개 조회 가능하게 하고 일반 사용자 수정은 막았다.
  - 대화, 메시지, 피드백은 `auth.uid()` 기준으로 사용자별 격리했다.
  - 작업 이력 원본 대신 민감한 `error_detail`을 제외한 요약 view를 만들었다.
  - `anon`, `authenticated` 권한을 회수한 뒤 필요한 권한만 다시 부여했다.
  - 로컬 적용 검증은 Docker Desktop 미실행으로 보류되었다.

## 4. Supabase 및 Edge Functions 구현 단계

### 4.1 품목 기준 데이터 구현

- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 품목명, KAMIS 코드, 카테고리, 단위, 활성 여부 저장
  - seed 데이터 작성
  - 실제 코드와 mock 코드 구분
- 완료 내용:
  - `supabase/seed.sql`의 초기 품목 후보 배추, 무, 양파, 대파에 KAMIS 카테고리, 품종, 등급, 기본 단위 후보를 보강했다.
  - `metadata.data_mode`, `metadata.mock_supported`, `metadata.default_county_codes`로 실제 코드 후보와 Mock 지원 여부를 구분했다.
  - 대파는 `metadata.needs_code_verification`으로 코드 추가 확인 필요 상태를 남겼다.

### 4.2 KAMIS 수집 Edge Function 구현

- 생성 파일:
  - `supabase/functions/sync-kamis-prices/index.ts`
  - `supabase/functions/sync-kamis-prices/README.md`
  - `supabase/functions/_shared/cors.ts`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 입력 품목과 기간 검증
  - KAMIS API 호출
  - 응답 파싱 및 정규화
  - 가격 데이터 upsert
  - 작업 이력 저장
  - 일부 품목 실패 처리
  - Mock 모드 지원
- 완료 내용:
  - `dailyCountyList`와 `periodRetailProductList` 수집 모드를 지원하는 `sync-kamis-prices` Edge Function을 작성했다.
  - `SUPABASE_SERVICE_ROLE_KEY`, `KAMIS_API_ID`, `KAMIS_API_KEY`를 Edge Function 내부에서만 읽도록 했다.
  - 수집 작업 시작/완료/실패 상태를 `data_sync_jobs`에 기록하도록 했다.
  - KAMIS 응답을 `price_records` 구조로 정규화하고 중복 키 기준으로 upsert하도록 했다.
  - 일부 지역 또는 품목 실패를 `partial_success`로 기록할 수 있게 했다.
  - `mock: true` 요청 또는 `KAMIS_MOCK_MODE=true` 환경변수로 Mock 데이터를 저장할 수 있게 했다.
  - 로컬 실행 검증은 Deno CLI 미설치와 Docker Desktop 미실행으로 보류되었다.
- 사용자 준비 사항:
  - KAMIS API Key와 요청 파라미터 확인

### 4.3 정기 수집 설정

- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 수동 실행만으로 운영 방식 확정
  - `sync-kamis-prices` 직접 호출 방식 정리
  - 중복 실행 방지와 실패 작업 재처리 기준 정리
- 완료 내용:
  - 정기 스케줄은 두지 않고 수동 실행만 사용하기로 결정했다.
  - `sync-kamis-prices`를 `POST` 요청으로 직접 호출하는 방식으로 정리했다.
  - 실행 결과는 `data_sync_jobs`와 `price_records`에서 확인하도록 정리했다.
  - `daily`는 `countyCodes`만 넣고 `productIds`와 기간은 비우는 방식으로 고정했다.
  - `period`는 `productIds`, `countyCodes`, `startDate`, `endDate`를 모두 넣는 방식으로 고정했다.
  - `countyCodes` 기본값은 `3613`으로 고정했다.
- 사용자 준비 사항:
  - 수동 수집 시 사용할 품목과 지역, 기간 입력 방식 정리

### 4.4 규칙 기반 위험 분석 구현

- 생성 파일:
  - `supabase/functions/calculate-risks/index.ts`
  - `supabase/functions/calculate-risks/README.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 최근 가격, 기준 가격, 변화율, 변동성, 데이터 수, 결측 비율 계산
  - 부분 위험 점수와 가중치 적용
  - 최종 점수와 등급 결정
  - 계산 근거 저장
- 완료 내용:
  - 규칙 기반 위험 분석 Edge Function `calculate-risks`를 작성했다.
  - 기본 분석 기간은 최근 30일, 기본 지역은 `3613`, 기본 점수 버전은 `v1`로 정했다.
  - 유효 가격 5개 미만, 결측 비율 50% 초과, 최신 가격 없음은 `insufficient_data`로 분리했다.
  - 점수는 기간 변화율 35, 최근 변화율 20, 변동성 25, 데이터 품질 20 가중치로 계산한다.
  - 등급은 `high >= 70`, `watch >= 40`, `stable < 40`으로 고정했다.
  - 계산 근거는 `risk_results.evidence`, 데이터 품질은 `risk_results.data_quality`에 저장하도록 했다.
  - 로컬 실행 검증은 Deno CLI 미설치와 Docker Desktop 미실행으로 보류되었다.

## 5. Pinecone 및 RAG 구현 단계

### 5.1 Pinecone 인덱스 설계 문서 작성

- 생성 파일: `docs/03-design/vector-index-design.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 인덱스 이름
  - namespace 기준
  - 벡터 ID 규칙
  - 메타데이터 필드
  - 재구축 정책
- 완료 내용:
  - Pinecone 인덱스 이름을 `toy-project-2`로 명시했다.
  - Gemini 임베딩 모델 `gemini-embedding-2`, 출력 차원 `1024`, cosine metric 기준을 정리했다.
  - 기본 namespace를 `jeonnam-agri-analysis`로 고정했다.
  - 벡터 ID를 `analysis_document:{analysis_document_id}:v{version}` 형식으로 정했다.
  - Supabase `analysis_documents` 원본과 Pinecone metadata 연결 필드를 정의했다.
  - Pinecone 장애 또는 인덱스 손실 시 Supabase 원본 문서 기준으로 재구축하는 정책을 정리했다.
- 사용자 준비 사항:
  - Pinecone 인덱스 생성 및 접속 정보 제공

### 5.2 검색용 문서 생성 구현

- 생성 파일:
  - `supabase/functions/generate-analysis-documents/index.ts`
  - `supabase/functions/generate-analysis-documents/README.md`
- 수정 파일:
  - `docs/03-design/data-workflow.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 위험 분석 결과를 의미 검색 가능한 문서로 변환
  - 품목, 기간, 핵심 수치, 위험 근거, 데이터 한계 포함
  - 문서 해시와 버전 관리
- 완료 내용:
  - `risk_results`를 `analysis_documents`의 `risk_summary` 문서로 변환하는 Edge Function을 작성했다.
  - 품목명, 지역 코드, 분석 기간, 위험 점수, 위험 등급, 핵심 가격 지표, 부분 점수, 데이터 품질, 데이터 한계를 문서 본문에 포함했다.
  - 제목, 본문, 주요 metadata 기준 SHA-256 `content_hash`를 계산하도록 했다.
  - 같은 원본 위험 결과의 최신 문서와 hash가 같으면 `skipped` 처리하고, 내용이 바뀌면 `version`을 증가시켜 새 문서를 생성하도록 했다.
  - 생성된 문서는 `vector_status = pending`으로 저장해 5.3 임베딩 및 Pinecone 동기화 단계로 넘기도록 했다.
  - 문서 생성 작업 이력은 `data_sync_jobs.job_type = document_generation`으로 기록하도록 했다.

### 5.3 임베딩 및 Pinecone 동기화 구현

- 생성 파일:
  - `supabase/functions/sync-vectors/index.ts`
  - `supabase/functions/sync-vectors/README.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - Gemini 임베딩 생성
  - Pinecone upsert
  - 동기화 상태 저장
  - 실패 문서 재처리
  - 원본 수정 시 재인덱싱
- 완료 내용:
  - `analysis_documents`를 대상으로 `sync-vectors` Edge Function을 작성했다.
  - Gemini `embedContent`로 `1024`차원 임베딩을 생성하고 Pinecone `toy-project-2` 인덱스에 upsert하도록 했다.
  - 벡터 ID를 `analysis_document:{analysis_document_id}:v{version}`으로 고정했다.
  - `vector_sync_jobs`에 각 문서별 실행 이력과 실패 사유를 남기도록 했다.
  - 성공 시 `analysis_documents.vector_status = synced`, 실패 시 `failed`로 바꾸도록 했다.
  - `force: true`로 이미 동기화된 문서도 재처리할 수 있게 했다.
- 사용자 준비 사항:
  - Gemini API Key와 Pinecone API Key 등록

### 5.4 질문 의도 분류 및 검색 라우팅 구현

- 생성 파일:
  - `supabase/functions/ask-ai/index.ts`
  - `supabase/functions/ask-ai/README.md`
- 수정 파일:
  - `docs/03-design/data-workflow.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - 수치 질문은 Supabase 조회
  - 설명 질문은 Pinecone 의미 검색
  - 복합 질문은 Supabase와 Pinecone 함께 사용
  - 모호한 질문 처리
- 완료 내용:
  - `ask-ai` Edge Function에서 질문 의도를 숫자형, 설명형, 복합형, 모호한 질문으로 분류하도록 했다.
  - 품목/지역/기간 힌트를 요청값과 질문 본문에서 추출해 검색 범위를 정하도록 했다.
  - 숫자형 질문은 `price_records`와 `risk_results`를 우선 조회하도록 했다.
  - 설명형 질문은 질문 임베딩을 만들어 Pinecone에서 관련 `analysis_documents`를 찾도록 했다.
  - 복합형 질문은 두 경로를 함께 사용하고, 모호한 질문은 `ambiguous`로 표시하도록 했다.
  - 이 단계에서는 최종 자연어 답변 대신 5.5에서 사용할 근거 묶음을 반환하도록 경계를 뒀다.

### 5.5 근거 기반 RAG 답변 구현

- 생성 파일:
  - `supabase/functions/generate-rag-answer/index.ts`
  - `supabase/functions/generate-rag-answer/README.md`
- 수정 파일:
  - `docs/03-design/architecture.md`
  - `docs/03-design/data-workflow.md`
- 진행 상태: 완료
- 완료일: 2026-07-22
- 작업 내용:
  - Supabase 수치 결과와 Pinecone 검색 결과 통합
  - Gemini 답변 생성
  - 사용 기간, 근거 문서, 데이터 한계 반환
  - 대화와 근거 저장
- 완료 내용:
  - `generate-rag-answer` Edge Function을 작성해 Gemini 답변 생성과 대화 저장을 분리했다.
  - `ask-ai`에서 전달된 근거 묶음을 바탕으로 한국어 답변을 생성하고, 숫자를 새로 만들지 않도록 프롬프트를 고정했다.
  - 로그인 사용자가 있으면 `conversations`와 `messages`에 사용자 질문과 AI 답변을 각각 저장하도록 했다.
  - `messages.evidence_document_ids`와 `messages.data_limitations`에 사용한 근거와 한계를 남기도록 했다.
  - 질문이 모호하면 Gemini 호출 대신 확인용 답변을 반환하도록 했다.

## 6. 프론트엔드 구현 단계

### 6.1 React 공통 구조 정리

- 작업 내용:
  - 라우팅
  - 공통 레이아웃
  - Supabase client
  - Edge Function 호출 모듈
  - 타입 정의
  - 로딩, 오류, 빈 데이터 컴포넌트

### 6.2 대시보드 구현

- 화면 경로: `/`
- 작업 내용:
  - 전체 품목 수
  - 최신 수집 시각
  - 성공/실패 품목 수
  - 고위험 품목 수
  - 품목별 최신 가격과 위험 등급 표시

### 6.3 가격 추이 화면 구현

- 화면 경로: `/prices`
- 작업 내용:
  - 품목 선택
  - 기간 선택
  - 가격 선 그래프
  - 평균, 최고가, 최저가, 변화율
  - 결측 구간과 출처 표시

### 6.4 위험 분석 화면 구현

- 화면 경로: `/risks`
- 작업 내용:
  - 최종 위험 점수와 등급
  - 부분 점수와 가중치
  - 계산 근거
  - 데이터 충분성
  - 계산 불가 항목 표시

### 6.5 AI 보고서 화면 구현

- 화면 경로: `/reports`
- 작업 내용:
  - 분석 대상 선택
  - 보고서 생성 버튼
  - 고위험 품목 요약
  - 시장 관찰
  - 대응 참고 사항
  - 저장된 보고서 조회

### 6.6 AI 질의응답 화면 구현

- 화면 경로: `/chat`
- 작업 내용:
  - 질문 입력
  - 사용자/AI 메시지 표시
  - 처리 상태 표시
  - 답변 근거 문서 표시
  - 사용 데이터 기간 표시
  - 피드백 저장

### 6.7 시스템 상태 화면 구현

- 화면 경로: `/system-status`
- 작업 내용:
  - 최근 수집 작업
  - 위험 분석 작업
  - 벡터 동기화 작업
  - 실패 작업
  - 재처리 상태
  - Mock 모드 표시

## 7. 테스트 및 검증 단계

### 7.1 데이터베이스 테스트

- 검증 항목:
  - 제약조건
  - 외래키
  - 중복 방지
  - 상태값 제한
  - RLS 정책

### 7.2 Edge Functions 테스트

- 검증 항목:
  - 정상 수집
  - 인증 실패
  - 타임아웃
  - 빈 응답
  - 잘못된 응답 형식
  - 일부 품목 실패
  - 중복 재수집

### 7.3 위험 분석 테스트

- 검증 항목:
  - 안정 가격
  - 지속 상승
  - 지속 하락
  - 단기 급등
  - 단기 급락
  - 데이터 부족
  - 결측치
  - 등급 경계값
  - 동일 입력 재현성

### 7.4 Pinecone 및 RAG 테스트

- 검증 항목:
  - 문서 등록
  - 동일 문서 재등록
  - 메타데이터 필터
  - 원본 수정 후 재인덱싱
  - 근거 없음 질문
  - 숫자 일치
  - 모호한 질문
  - 프롬프트 인젝션 시도

### 7.5 프론트엔드 테스트

- 검증 항목:
  - 로딩 상태
  - 오류 상태
  - 빈 데이터 상태
  - 모바일 화면
  - 긴 AI 답변
  - 네트워크 중단
  - 중복 클릭 방지

### 7.6 요구사항 검증표 업데이트

- 생성 파일: `docs/04-validation/test-report.md`
- 작업 내용:
  - 요구사항 ID별 테스트 이름
  - 기대 결과
  - 실제 결과
  - PASS/FAIL 상태
  - 증빙 기록

## 8. 최종 통합 및 문서화 단계

### 8.1 최종 사용자 시나리오 검증

- 검증 시나리오:
  - 최신 가격 확인
  - 품목별 가격 추이 확인
  - 위험 분석 확인
  - AI 질의응답 확인
  - KAMIS 실패 후 복구
  - Pinecone 실패 후 재처리

### 8.2 README 작성

- 생성 파일: `README.md`
- 포함 내용:
  - 프로젝트 배경과 목표
  - 주요 사용자
  - Must Have 기능
  - 전체 아키텍처
  - Supabase와 Pinecone 역할
  - 디렉터리 구조
  - 환경변수
  - Supabase 마이그레이션
  - Edge Functions 목록
  - Secrets 설정
  - Pinecone 인덱스 준비
  - 프론트엔드 실행
  - 테스트 실행
  - Cron 설정
  - Mock 모드
  - 보안 주의
  - 알려진 제한사항

### 8.3 WORKLOG 작성 및 갱신

- 생성 파일: `WORKLOG.md`
- 작업 내용:
  - 단계명
  - 수행 목표
  - 관련 요구사항 ID
  - 생성/수정 파일
  - 주요 설계 결정
  - 실행 명령
  - 테스트 결과
  - 오류와 해결 방법
  - 미해결 문제
  - 다음 단계 진입 가능 여부

## 9. 사용자가 외부 사이트에서 준비해야 하는 전체 목록

| 순서 | 외부 서비스 | 사용자가 해야 할 일 | 나에게 필요한 값 |
|---|---|---|---|
| 1 | Supabase | 프로젝트 생성 | Project URL, anon key, project ref |
| 2 | Supabase | CLI 로그인 및 프로젝트 연결 승인 | 연결 승인 |
| 3 | Supabase | Edge Functions Secrets 등록 또는 등록할 값 제공 | service role key, KAMIS/Gemini/Pinecone keys |
| 4 | KAMIS | Open API Key 발급 | API Key, API ID, 품목 코드 |
| 5 | Pinecone | 프로젝트와 인덱스 생성 | API Key, index name, host |
| 6 | Gemini | API Key 발급 | API Key, 생성 모델명, 임베딩 모델명 |
| 7 | Supabase | Cron 사용 가능 여부 확인 | 수집 주기 결정 |

## 10. 내가 우선 진행할 첫 번째 작업 묶음

1. `docs/` 디렉터리 생성
2. `docs/01-planning/problem-definition.md` 작성
3. `docs/01-planning/users-and-stakeholders.md` 작성
4. `docs/01-planning/user-flow.md` 작성
5. `docs/01-planning/PRD.md` 초안 작성
6. `docs/01-planning/requirements-traceability.md` 초안 작성
7. 사용자에게 PRD 범위 승인 요청

PRD가 승인되면 그 다음에 Supabase 프로젝트 연결, DB 마이그레이션, Edge Functions, 프론트엔드 구현 순서로 넘어간다.
