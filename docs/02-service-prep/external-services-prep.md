# 외부 서비스 준비 현황

## 1. 확인된 Supabase 정보

사용자로부터 다음 값을 확인했다.

| 항목 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | `https://tctafxokypmsrtucertd.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | 확인 완료 |
| `project ref` | `tctafxokypmsrtucertd` |

나머지 키는 사용자가 별도로 보관 중이다.

## 2. 2-1 진행 상태

2-1은 Supabase 프로젝트 연결 준비 단계로 본다.

### 이미 확보된 것

1. Supabase 프로젝트 URL
2. Supabase project ref
3. 프론트엔드용 anon key
4. 나머지 비밀키 보관 상태

### 내가 준비한 것

1. `frontend/.env.local`
2. 루트 `.env.local`
3. 외부 서비스 준비 체크리스트

## 3. 2-2 진행 상태

2-2는 Supabase CLI 연결과 이후 구조 준비 단계로 본다.

### 이미 완료된 것

1. `supabase init`
2. `supabase link --project-ref tctafxokypmsrtucertd`
3. `supabase/config.toml` 생성
4. `supabase/functions`, `supabase/migrations`, `supabase/tests` 기본 구조 생성

### 다음에 내가 할 일

1. Supabase CLI 기준 디렉터리 구조 확인
2. 마이그레이션 초기 파일 작성
3. Edge Functions 초기 뼈대 작성
4. 환경변수 이름과 Secrets 이름 정리

## 4. KAMIS 2-3 진행 상태

### 확인된 값

| 항목 | 상태 |
|---|---|
| `KAMIS_API_ID` | 로컬 `.env.local`에 입력 완료 |
| `KAMIS_API_KEY` | 로컬 `.env.local`에 입력 완료 |
| 품목 코드 참고 파일 | `추가정보/농축수산물 품목 및 등급 코드표.xlsx` |
| 최근일자 지역별 가격 API 참고 파일 | `추가정보/최근일자 지역별 도.소매가격정보(상품 기준).txt` |

### 지금은 무엇을 해도 되는가

1. KAMIS API 키를 로컬 `.env.local`에 두고 개발을 이어간다.
2. API 문서와 품목 코드표를 기준으로 우선 품목 후보를 고른다.
3. Edge Function 호출 코드와 매핑 테이블 초안을 만든다.

### Supabase Secrets는 언제 등록하나

1. 로컬에서만 확인하고 끝낼 때는 지금 당장 등록하지 않아도 된다.
2. 배포된 Edge Function이 KAMIS를 실제 호출하기 전에 등록해야 한다.
3. `supabase secrets set --env-file .env.local` 형태로 한 번에 올릴 수 있다.

### 다음에 내가 할 일

1. KAMIS 호출용 품목-품종-등급-지역 매핑 초안 작성
2. Edge Function에서 읽을 환경변수 이름 표준화
3. 수집, 추이, 코드표 조회용 API를 테이블로 정리

## 5. 안전 수칙

1. `service role key`는 브라우저용 파일에 넣지 않는다.
2. 실제 키는 tracked file이 아니라 `.env.local` 또는 Supabase Secrets에만 둔다.
3. `frontend/.env.local`에는 프론트엔드가 필요한 공개 키만 둔다.

## 6. 다음 연결 순서

1. 사용자가 Supabase CLI 로그인 상태를 확인한다.
2. `supabase link --project-ref tctafxokypmsrtucertd` 형태로 연결한다.
3. 마이그레이션과 Edge Functions 구조를 준비한다.
