# ask-ai

질문 의도를 분류하고, 질문 유형에 따라 Supabase 수치 조회와 Pinecone 의미 검색을 분기하는 Edge Function이다.

이 함수는 5.4 단계의 라우팅 역할에 초점을 둔다. 최종 자연어 답변 생성은 다음 단계에서 이어 붙일 수 있다.

## Secrets

필수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_HOST`

권장:

- `PINECONE_INDEX_NAME`
- `PINECONE_NAMESPACE`
- `GEMINI_EMBEDDING_MODEL`

## 요청 예시

```json
{
  "question": "배추 가격이 최근에 왜 올랐어?",
  "countyCodes": ["3613"],
  "topK": 5
}
```

숫자 질문:

```json
{
  "question": "배추 현재 시세와 평균 가격 알려줘",
  "productIds": ["11111111-1111-4111-8111-111111111111"]
}
```

설명 질문:

```json
{
  "question": "대파 가격이 오른 이유를 알려줘"
}
```

## 동작 방식

1. 질문 문자열을 보고 숫자형 질문인지, 설명형 질문인지, 복합 질문인지 분류한다.
2. 품목과 지역 힌트를 요청값과 질문 본문에서 최대한 추출한다.
3. 숫자형이면 `price_records`와 `risk_results`에서 근거를 조회한다.
4. 설명형이면 Gemini 임베딩으로 질문 벡터를 만들고 Pinecone에서 관련 문서를 찾는다.
5. 복합형이면 두 경로를 모두 사용한다.
6. 검색된 `analysis_documents`는 Supabase에서 다시 조회해 원본 기준으로 정리한다.

## 응답 구조

이 단계의 응답에는 다음이 들어간다.

- `route`
- `intent`
- `filter`
- `clarificationNeeded`
- `numericEvidence`
- `semanticEvidence`

## 다음 단계

5.5 단계의 `generate-rag-answer` 함수가 이 라우터의 결과를 바탕으로 Gemini 답변 생성과 `messages` 저장을 담당한다.
