# Jeolla Agri Analysis

전라도 농수산물 가격, 위험 분석, AI 보고서를 한 화면에서 다루는 대시보드입니다.  
KAMIS 가격 데이터를 기반으로 시세를 수집하고, Supabase에 저장한 뒤, 위험 분석과 보고서 생성, 채팅 응답까지 이어지도록 구성했습니다.

배포 주소: https://jeolla-agri-analysis.ai-ax-9678.chatgpt.site

## 주요 기능

- 대시보드에서 품목별 오늘 가격과 최근 추이를 카드 형태로 확인
- 가격추이 화면에서 품목별 월별 가격 흐름 확인
- 위험분석 화면에서 품목별 위험 점수와 등급 확인
- 채팅 화면에서 가격, 위험, 보고서에 대한 질의응답
- 보고서 화면에서 선택한 품목 기준 AI 보고서 생성 및 저장
- Supabase Auth 기반 로그인 / 로그아웃 및 대화 기록 보존

## 기술 스택

- Frontend: React, TypeScript, Vite
- Backend: Supabase Postgres, Supabase Auth, Supabase Edge Functions, Supabase Cron
- External APIs: KAMIS Open API, Gemini API, Pinecone

## 아키텍처 개요

1. KAMIS Edge Function이 농수산물 가격을 수집합니다.
2. 수집된 데이터는 Supabase `price_records` 등에 저장됩니다.
3. `calculate-risks` Edge Function이 최근 가격과 이력 데이터를 바탕으로 위험 점수를 계산합니다.
4. `generate-analysis-documents`와 `sync-vectors`가 보고서 및 벡터 검색용 문서를 만듭니다.
5. `ask-ai`와 `generate-rag-answer`가 채팅 질문을 분류하고 Pinecone + Gemini 기반 응답을 만듭니다.
6. 프론트엔드는 Supabase Auth 세션을 사용해 채팅 기록과 보고서 저장을 사용자별로 구분합니다.

## 화면 구성

- 대시보드
- 가격추이
- 위험분석
- 보고서
- 채팅

## 준비해야 할 값

### 루트 `.env.local`

아래 값은 서버 사이드 작업이나 Edge Function 호출 기준으로 사용합니다.

- `SUPABASE_SERVICE_ROLE_KEY`
- `KAMIS_API_ID`
- `KAMIS_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_EMBEDDING_MODEL`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME`
- `PINECONE_HOST`

### `frontend/.env.local`

프론트엔드에서 직접 읽는 값입니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 로컬 실행

프론트엔드 앱은 `frontend/` 디렉터리에서 실행합니다.

```bash
cd frontend
npm install
npm run dev
```

기본 개발 서버는 Vite 기준으로 실행됩니다.

## 빌드

```bash
cd frontend
npm run build
```

빌드 후 `frontend/dist` 아래에 정적 파일과 배포용 산출물이 생성됩니다.

## Supabase 관련 명령

루트에서 Supabase CLI를 사용합니다.

```bash
supabase link --project-ref tctafxokypmsrtucertd
supabase secrets set --env-file .\.env.local
supabase functions deploy sync-kamis-prices --project-ref tctafxokypmsrtucertd
supabase functions deploy calculate-risks --project-ref tctafxokypmsrtucertd
supabase functions deploy generate-analysis-documents --project-ref tctafxokypmsrtucertd
supabase functions deploy sync-vectors --project-ref tctafxokypmsrtucertd
supabase functions deploy ask-ai --project-ref tctafxokypmsrtucertd
supabase functions deploy generate-rag-answer --project-ref tctafxokypmsrtucertd
supabase functions deploy save-report --project-ref tctafxokypmsrtucertd
supabase functions deploy generate-report --project-ref tctafxokypmsrtucertd
```

## 현재 구현 상태

- 로그인 후 메인 화면 진입
- 채팅 기록 저장 및 재조회
- 보고서 생성 및 과거 보고서 상세 보기
- 대시보드 및 가격추이의 실데이터 연동
- KAMIS, Gemini, Pinecone 연계 구조 정리
- 프로덕션 배포 완료

## 알려진 제한사항

- KAMIS 응답 구조나 품목 조합에 따라 일부 품목은 데이터가 부족할 수 있습니다.
- 외부 API 장애 시 일부 화면은 mock 또는 기본 템플릿으로 대체될 수 있습니다.
- 배포 환경의 Secrets와 로컬 `.env.local`은 별도로 관리해야 합니다.

