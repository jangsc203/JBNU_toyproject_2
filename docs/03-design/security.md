# 보안 및 RLS 설계

## 1. 문서 목적

이 문서는 Supabase Auth, RLS, Edge Functions, 외부 API Secrets 관리 기준을 정의한다.

핵심 목표는 브라우저에 비밀키를 노출하지 않고, 공개 조회 데이터와 사용자별 개인 데이터를 분리하며, Edge Function/service role만 수정 가능한 데이터를 명확히 구분하는 것이다.

## 2. 보안 원칙

1. 브라우저에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만 노출한다.
2. `SUPABASE_SERVICE_ROLE_KEY`, `KAMIS_API_ID`, `KAMIS_API_KEY`, `GEMINI_API_KEY`, `PINECONE_API_KEY`는 브라우저에 노출하지 않는다.
3. KAMIS, Gemini, Pinecone 호출은 Supabase Edge Functions에서만 수행한다.
4. 공개 조회가 가능한 테이블도 RLS를 활성화하고 조회 정책을 명시한다.
5. 일반 사용자는 가격 원본, 위험 결과, 분석 문서, 작업 이력을 직접 수정할 수 없다.
6. 로그인 사용자의 대화, 메시지, 피드백은 `auth.uid()` 기준으로 격리한다.
7. service role은 RLS를 우회할 수 있으므로 Edge Function 내부에서만 제한적으로 사용한다.

## 3. 비밀값 저장 위치

| 변수 | 브라우저 | 루트 `.env.local` | Supabase Secrets | 설명 |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | 가능 | 가능 | 불필요 | 공개 Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | 가능 | 가능 | 불필요 | 공개 anon key |
| `SUPABASE_URL` | 불필요 | 가능 | 가능 | Edge Function 내부 참고 |
| `SUPABASE_SERVICE_ROLE_KEY` | 금지 | 로컬 개발용 가능 | 필수 | RLS 우회 권한 |
| `KAMIS_API_ID` | 금지 | 가능 | 필수 | KAMIS 인증 |
| `KAMIS_API_KEY` | 금지 | 가능 | 필수 | KAMIS 인증 |
| `GEMINI_API_KEY` | 금지 | 가능 | 필수 | Gemini 호출 |
| `PINECONE_API_KEY` | 금지 | 가능 | 필수 | Pinecone 호출 |
| `PINECONE_INDEX_NAME` | 금지 권장 | 가능 | 권장 | Edge Function 설정 |
| `PINECONE_HOST` | 금지 권장 | 가능 | 권장 | Pinecone endpoint |

비밀값은 로그, 작업 이력, 오류 상세, 채팅 답변에 저장하지 않는다.

## 4. 클라이언트 호출 허용 범위

React 웹 앱은 다음만 수행한다.

1. Supabase anon client로 공개 조회 데이터 조회
2. 로그인/세션 확인
3. Edge Function 호출
4. 자신의 대화/피드백 조회와 저장

React 웹 앱은 다음을 수행하지 않는다.

1. KAMIS API 직접 호출
2. Gemini API 직접 호출
3. Pinecone API 직접 호출
4. service role key 사용
5. 가격, 위험 결과, 분석 문서 원본 직접 수정

## 5. 테이블별 접근 정책 요약

| 테이블 | anon 조회 | authenticated 조회 | authenticated 삽입/수정 | service role/Edge Function |
|---|---|---|---|---|
| `products` | 활성 품목 조회 가능 | 활성 품목 조회 가능 | 불가 | 전체 가능 |
| `price_records` | 조회 가능 | 조회 가능 | 불가 | 전체 가능 |
| `data_sync_jobs` | 요약 조회 가능 또는 제한 | 요약 조회 가능 또는 제한 | 불가 | 전체 가능 |
| `risk_results` | 조회 가능 | 조회 가능 | 불가 | 전체 가능 |
| `analysis_documents` | 제한적 조회 | 제한적 조회 | 불가 | 전체 가능 |
| `vector_sync_jobs` | 요약 조회 가능 또는 제한 | 요약 조회 가능 또는 제한 | 불가 | 전체 가능 |
| `reports` | 공개 보고서 조회 가능 | 공개/본인 보고서 조회 가능 | 직접 생성 불가 | 전체 가능 |
| `conversations` | 불가 | 본인만 | 본인만 생성/수정 | 전체 가능 |
| `messages` | 불가 | 본인만 | 본인 질문 생성 가능, AI 답변은 Edge | 전체 가능 |
| `feedback` | 불가 | 본인만 | 본인 피드백 생성/수정 | 전체 가능 |

시스템 상태 화면은 실습 편의상 요약 조회를 열 수 있지만, 외부 API 오류 원문이나 내부 스택 정보는 공개하지 않는다.

## 6. RLS 정책 설계

모든 public 테이블은 RLS를 활성화한다.

```sql
alter table public.products enable row level security;
alter table public.price_records enable row level security;
alter table public.data_sync_jobs enable row level security;
alter table public.risk_results enable row level security;
alter table public.analysis_documents enable row level security;
alter table public.vector_sync_jobs enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.feedback enable row level security;
```

### 6.1 공개 조회 테이블

`products`, `price_records`, `risk_results`는 일반 사용자가 조회할 수 있다.

정책 의도:

```sql
create policy "Anyone can read active products"
on public.products
for select
using (is_active = true);

create policy "Anyone can read price records"
on public.price_records
for select
using (true);

create policy "Anyone can read risk results"
on public.risk_results
for select
using (true);
```

일반 사용자의 insert/update/delete 정책은 만들지 않는다. Edge Function은 service role로 필요한 쓰기를 수행한다.

### 6.2 작업 이력 조회

`data_sync_jobs`, `vector_sync_jobs`는 시스템 상태 화면 요구사항 `FR-12` 때문에 요약 조회가 필요하다.

권장 방향:

1. 테이블 원본은 authenticated 사용자 또는 service role만 조회한다.
2. anon 공개가 필요하면 민감정보를 제거한 view를 별도로 만든다.
3. `error_detail`은 공개하지 않고 `status`, `job_type`, `created_at`, `success_count`, `failed_count`, `error_summary` 정도만 노출한다.

실습 초기에는 authenticated 조회로 제한하는 방향을 권장한다.

### 6.3 분석 문서 조회

`analysis_documents`는 AI 근거 표시를 위해 일부 조회가 필요하지만, 전체 본문을 항상 공개할 필요는 없다.

권장 방향:

1. 공개 화면에는 제목, 기간, 품목, 요약 metadata만 표시한다.
2. RAG 답변 생성은 Edge Function이 service role로 원본 본문을 조회한다.
3. 사용자가 AI 답변 근거를 펼칠 때 필요한 범위만 반환한다.

초기 정책 후보:

```sql
create policy "Authenticated users can read analysis documents"
on public.analysis_documents
for select
to authenticated
using (true);
```

anon 조회가 필요하면 별도 view를 만든다.

### 6.4 보고서 조회

`reports.visibility` 기준으로 공개 보고서와 개인 보고서를 나눈다.

정책 의도:

```sql
create policy "Anyone can read public reports"
on public.reports
for select
using (visibility = 'public');

create policy "Users can read own reports"
on public.reports
for select
to authenticated
using (created_by = auth.uid());
```

보고서 생성은 Gemini 호출이 필요하므로 사용자가 테이블에 직접 insert하지 않고 Edge Function을 통해 생성한다.

### 6.5 대화 격리

`conversations`는 로그인 사용자 본인만 접근한다.

정책 의도:

```sql
create policy "Users can read own conversations"
on public.conversations
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own conversations"
on public.conversations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own conversations"
on public.conversations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

### 6.6 메시지 격리

`messages`도 `user_id = auth.uid()` 기준으로 격리한다.

사용자 질문 메시지는 클라이언트 insert를 허용할 수 있지만, AI 답변 메시지는 Edge Function이 생성하는 방향이 더 안전하다. 초기 구현에서는 모든 메시지 생성을 Edge Function으로 통일해도 된다.

정책 의도:

```sql
create policy "Users can read own messages"
on public.messages
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own user messages"
on public.messages
for insert
to authenticated
with check (user_id = auth.uid() and role = 'user');
```

AI 답변 생성 정책은 만들지 않고 service role을 사용한다.

### 6.7 피드백 격리

`feedback`은 본인 피드백만 조회, 생성, 수정할 수 있다.

정책 의도:

```sql
create policy "Users can read own feedback"
on public.feedback
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own feedback"
on public.feedback
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own feedback"
on public.feedback
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

## 7. Edge Function 권한 기준

Edge Function은 다음 작업에 service role을 사용할 수 있다.

| 작업 | service role 필요 이유 |
|---|---|
| KAMIS 수집 결과 저장 | 일반 사용자의 가격 수정 금지 |
| 위험 분석 결과 저장 | 일반 사용자의 위험 결과 수정 금지 |
| 분석 문서 생성 | 원본 문서 정합성 유지 |
| 벡터 동기화 상태 갱신 | Pinecone 결과 기록 |
| AI 답변 메시지 저장 | assistant 메시지 위조 방지 |
| 실패 작업 재처리 | 작업 이력과 대상 데이터 수정 |

Edge Function 내부에서도 사용자 요청을 처리할 때는 JWT를 검증해 `auth.uid()`를 확인한다. service role을 쓰더라도 사용자가 접근할 수 없는 대화나 피드백을 대신 조회해 반환하면 안 된다.

## 8. 외부 API 호출 보안

### 8.1 KAMIS

1. 인증 파라미터는 Edge Function에서만 붙인다.
2. 실패 로그에 `p_cert_key`, `p_cert_id`를 저장하지 않는다.
3. 응답 파싱 실패 시 원문 전체 대신 필요한 샘플 필드와 오류 요약만 저장한다.

### 8.2 Gemini

1. Gemini API Key는 Supabase Secrets에서 읽는다.
2. 사용자의 질문과 검색 근거를 프롬프트로 보낼 때 개인정보나 비밀값을 포함하지 않는다.
3. 답변은 근거 문서와 수치 한계를 포함하는 구조로 제한한다.
4. 근거가 부족하면 추정 답변을 만들지 않도록 시스템 지시를 둔다.

### 8.3 Pinecone

1. Pinecone API Key와 host는 Edge Function에서만 사용한다.
2. Pinecone metadata에는 비밀값이나 사용자 개인 대화를 넣지 않는다.
3. 벡터 검색 결과는 Supabase 원본 문서 ID로 재검증한다.

## 9. 로그와 오류 메시지 기준

저장 가능:

1. 작업 종류
2. 대상 품목 ID
3. 대상 기간
4. 외부 API action 이름
5. HTTP 상태 코드
6. 사용자에게 보여줄 오류 요약
7. 민감정보를 제거한 응답 구조 일부

저장 금지:

1. API Key
2. service role key
3. 인증 헤더
4. Secrets가 포함된 전체 URL
5. 사용자의 개인 정보가 포함된 불필요한 원문
6. 전체 스택 트레이스의 공개 노출

## 10. 인증 포함 시점에 대한 설계

로그인 기능 포함 시점은 PRD에서 미결정이지만, 다음 기준으로 설계한다.

| 기능 | 로그인 없이 가능 | 로그인 필요 권장 |
|---|---|---|
| 대시보드 조회 | 가능 | 불필요 |
| 가격 추이 조회 | 가능 | 불필요 |
| 위험 분석 조회 | 가능 | 불필요 |
| AI 질의응답 | 제한 가능 | 권장 |
| 대화 저장 | 불가 | 필요 |
| 피드백 저장 | 불가 | 필요 |
| 실패 작업 재처리 | 불가 | 관리자 또는 Edge Function |

초기 구현에서 로그인 없이 AI 질문을 허용하더라도, 대화 저장과 피드백은 authenticated 사용자 기준으로 시작하는 편이 RLS 검증에 유리하다.

## 11. 보안 테스트 체크리스트

| 항목 | 검증 방법 |
|---|---|
| 브라우저 번들에 KAMIS/Gemini/Pinecone key 없음 | 빌드 결과와 네트워크 요청 확인 |
| anon 사용자가 가격 데이터를 수정할 수 없음 | insert/update/delete 요청 실패 확인 |
| anon 사용자가 대화를 조회할 수 없음 | `conversations`, `messages` select 실패 확인 |
| 사용자 A가 사용자 B 대화를 볼 수 없음 | 서로 다른 계정으로 RLS 테스트 |
| 피드백은 본인 것만 조회/수정 가능 | `feedback.user_id` 기준 테스트 |
| Edge Function만 가격 upsert 가능 | service role 경로로만 성공 확인 |
| Pinecone 벡터가 Supabase 문서 ID와 연결됨 | metadata와 `analysis_documents.id` 비교 |
| 오류 로그에 비밀값 없음 | `data_sync_jobs`, `vector_sync_jobs` 내용 확인 |

## 12. 마이그레이션 반영 순서

1. 모든 public 테이블 RLS 활성화
2. 공개 조회 정책 작성
3. 사용자별 테이블 정책 작성
4. 일반 사용자 insert/update/delete 차단 확인
5. service role 기반 Edge Function 동작 확인
6. RLS 테스트 SQL 또는 Supabase test 작성

## 13. 구현 반영 현황

RLS 정책은 `supabase/migrations/202607220002_rls_policies.sql`에 반영한다.

반영된 내용은 다음과 같다.

1. 모든 public 테이블 RLS 활성화
2. `products`, `price_records`, `risk_results` 공개 조회 정책
3. `reports` 공개 보고서와 본인 보고서 조회 정책
4. `analysis_documents` 로그인 사용자 조회 정책
5. `conversations`, `messages`, `feedback` 사용자별 격리 정책
6. 원본 작업 이력 대신 `data_sync_job_summaries`, `vector_sync_job_summaries` 요약 view 조회 권한
7. `anon`, `authenticated` 직접 권한 회수 후 필요한 권한만 재부여

`data_sync_jobs`, `vector_sync_jobs` 원본 테이블에는 일반 사용자 조회 정책을 열지 않는다. 시스템 상태 화면은 민감한 `error_detail`을 제외한 요약 view를 사용한다.

## 14. 관련 요구사항

| 요구사항 | 반영 위치 |
|---|---|
| FR-11 | 비밀키 브라우저 노출 방지 |
| FR-13 | 로그인 사용자 대화 저장 |
| FR-14 | AI 답변 피드백 저장 |
| NFR-01 | KAMIS, Gemini, Pinecone 비밀키 보호 |
| NFR-02 | RLS 적용 |
| NFR-03 | 사용자별 대화/피드백 격리 |
| NFR-05 | 작업 이력 저장 시 민감정보 제외 |
