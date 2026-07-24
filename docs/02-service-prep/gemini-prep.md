# Gemini 준비 체크리스트

## 1. 2.5에서 해야 할 일

Gemini는 보고서 요약, 자연어 답변 생성, 임베딩 생성에 사용한다.

### 사용자가 직접 해야 할 일

1. Google AI Studio 또는 Google Cloud에서 Gemini API Key 준비
2. 사용할 모델명 확인
3. 필요한 경우 프로젝트 또는 키 제한 설정

### 내가 이어서 할 일

1. 환경변수 이름 정리
2. Edge Function에서 읽는 방식 작성
3. 보고서 생성과 RAG 답변에서 사용할 모델 선택 반영

## 2. 나에게 필요한 값

| 항목 | 왜 필요한가 |
|---|---|
| `GEMINI_API_KEY` | Gemini API 호출 인증 |
| `GEMINI_MODEL` | 답변 생성용 모델 선택 |
| `GEMINI_EMBEDDING_MODEL` | 문서 임베딩 생성용 모델 선택 |

## 3. 지금 상태에서의 원칙

1. 로컬 개발은 `.env.local`에 값이 있으면 시작할 수 있다.
2. 배포된 Edge Function이 Gemini를 실제 호출하기 전에는 Supabase Edge Functions Secrets에도 등록해야 한다.
3. 브라우저 코드에는 Gemini 키를 넣지 않는다.

## 4. Google AI Studio 기준 메모

Gemini API 키는 Google AI Studio에서 만들 수 있고, 새로 생성되는 키는 서버 사이드 secret으로 다루는 것이 권장된다. AI Studio는 키를 앱의 server-side environment에 넣는 흐름을 지원한다.

참고 문서:

- [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)
- [Google AI Studio](https://ai.google.dev/aistudio)
- [Develop Full-Stack Apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-fullstack)

## 5. 준비가 끝나면 나에게 보내줄 것

```env
GEMINI_API_KEY=...
GEMINI_MODEL=...
GEMINI_EMBEDDING_MODEL=...
```

추가로 알려주면 좋은 것:

1. Google AI Studio에서 발급했는지, Google Cloud에서 발급했는지
2. model name 후보가 무엇인지
3. 임베딩과 생성 모델을 분리할지 여부

## 6. 다음 단계

1. KAMIS 수집과 보고서 문서화를 먼저 붙인다
2. Pinecone 인덱스 차원은 임베딩 모델에 맞춘다
3. Edge Function에서 Gemini 호출을 넣는다

## 7. 이 프로젝트에 대한 추천값

| 용도 | 추천 모델 | 이유 |
|---|---|---|
| 답변 생성, 보고서 생성 | `gemini-3.5-flash` | 멀티스텝 작업, RAG 답변, 코드/문서 처리에 균형이 좋다 |
| 비용 절감용 대체안 | `gemini-3.1-flash-lite` | 단순 분류, 추출, 짧은 응답에 더 가볍다 |
| 임베딩 생성 | `gemini-embedding-2` | 최신 임베딩 모델이며 검색/RAG 용도에 맞고, PDF와 멀티모달 입력도 지원한다 |

### 추천 운영 방식

1. 핵심 답변과 보고서는 `gemini-3.5-flash`를 쓴다.
2. 간단한 추출이나 분류가 필요할 때만 `gemini-3.1-flash-lite`를 고려한다.
3. Pinecone 인덱스 차원은 `gemini-embedding-2`의 출력 차원에 맞춘다.

### 현재 문서 기준으로 정리하면

- `GEMINI_MODEL=gemini-3.5-flash`
- `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`
