# 환경변수 및 Secrets 정리

## 1. 목적

이 문서는 프로젝트에서 사용하는 환경변수를 어디에 둘지 정리한다.

- 프론트엔드에서 읽는 값
- 로컬 개발용 값
- Supabase Edge Functions Secrets로 옮길 값

## 2. 저장 위치 기준

| 위치 | 용도 |
|---|---|
| `frontend/.env.local` | 브라우저에서 읽는 공개값 |
| 루트 `.env.local` | 로컬 개발용 서버/도구 비밀값 |
| Supabase Edge Functions Secrets | 배포된 Edge Function이 읽는 비밀값 |

## 3. 현재 프로젝트 기준 분류

### 프론트엔드용

| 변수 | 위치 | 설명 |
|---|---|---|
| `VITE_SUPABASE_URL` | `frontend/.env.local` | Supabase 클라이언트 연결 주소 |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local` | 브라우저에서 사용하는 공개 anon key |

### 로컬 개발용 / 서버사이드용

| 변수 | 위치 | 설명 |
|---|---|---|
| `SUPABASE_URL` | 루트 `.env.local` | 로컬 도구 또는 서버사이드에서 참고 |
| `SUPABASE_SERVICE_ROLE_KEY` | 루트 `.env.local` | 로컬 개발 시에만 보관, 배포 전에는 Secrets로 옮김 |
| `KAMIS_API_ID` | 루트 `.env.local` | KAMIS 인증용 |
| `KAMIS_API_KEY` | 루트 `.env.local` | KAMIS 인증용 |
| `KAMIS_MOCK_MODE` | 루트 `.env.local` | 선택값. Edge Function에서 KAMIS 대신 Mock 수집을 강제할 때 사용 |
| `GEMINI_API_KEY` | 루트 `.env.local` | Gemini 호출용 |
| `GEMINI_MODEL` | 루트 `.env.local` | 답변 생성 모델명 |
| `GEMINI_EMBEDDING_MODEL` | 루트 `.env.local` | 임베딩 생성 모델명 |
| `PINECONE_API_KEY` | 루트 `.env.local` | Pinecone 호출용 |
| `PINECONE_INDEX_NAME` | 루트 `.env.local` | Pinecone 인덱스 이름 |
| `PINECONE_HOST` | 루트 `.env.local` | Pinecone 인덱스 host |

## 4. Supabase Secrets로 옮길 값

배포된 Edge Functions가 실제로 참조해야 하는 값은 Secrets에 넣는다.

| 변수 | 이유 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | 브라우저와 저장소에 노출되면 안 됨 |
| `KAMIS_API_ID` | 외부 API 인증값이므로 노출 금지 |
| `KAMIS_API_KEY` | 외부 API 인증값이므로 노출 금지 |
| `KAMIS_MOCK_MODE` | 선택값. 배포 함수에서 Mock 모드를 강제할 때만 등록 |
| `GEMINI_API_KEY` | 외부 AI API 인증값이므로 노출 금지 |
| `PINECONE_API_KEY` | 벡터 DB 인증값이므로 노출 금지 |

## 5. 등록 순서

1. 로컬 `.env.local`에 먼저 입력한다.
2. 로컬 개발과 검증을 끝낸다.
3. 배포 전 `supabase secrets set --env-file .env.local`로 필요한 값만 Supabase Secrets에 등록한다.
4. 배포된 Edge Function에서는 `Deno.env.get(...)`로 읽는다.

## 6. 주의사항

1. `frontend/.env.local`에는 `VITE_` 접두사가 있는 값만 둔다.
2. `service role key`는 프론트엔드 파일에 넣지 않는다.
3. 비밀값을 채팅에 붙여넣는 일은 피한다.
4. 로컬 파일은 개발용이고, 배포 비밀값은 Supabase Secrets가 기준이다.

## 7. 현재 상태 메모

- KAMIS, Gemini, Pinecone, Supabase 관련 값은 로컬 `.env.local`에 정리되어 있다.
- 브라우저 공개용 값은 `frontend/.env.local`에 정리되어 있다.
- 배포 단계 전까지는 Secrets 등록을 미뤄도 된다.
