# generate-rag-answer

`ask-ai`에서 만든 근거 묶음을 바탕으로 Gemini 답변을 생성하고, 로그인 사용자의 대화와 메시지를 Supabase에 저장하는 Edge Function이다.

이 함수가 5.5 단계의 본체다.

## Secrets

필수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`

권장:

- `GEMINI_MODEL`

## 요청 예시

```json
{
  "question": "배추 가격이 최근에 왜 올랐어?",
  "route": "hybrid",
  "filter": {
    "productIds": ["11111111-1111-4111-8111-111111111111"],
    "countyCodes": ["3613"],
    "startDate": "2026-06-22",
    "endDate": "2026-07-22"
  },
  "numericEvidence": {
    "priceSummaries": [],
    "riskSummaries": []
  },
  "semanticEvidence": {
    "matches": [],
    "documents": []
  }
}
```

## 동작 방식

1. 질문과 근거 묶음을 입력받는다.
2. `route = ambiguous`면 Gemini를 호출하지 않고 확인용 답변을 만든다.
3. 그 외에는 Gemini `generateContent`로 한국어 답변을 생성한다.
4. 로그인 사용자가 있으면 `conversations`와 `messages`에 저장한다.
5. `messages`에는 사용자 질문과 AI 답변을 각각 남기고, AI 답변에는 사용한 문서 ID와 데이터 한계를 저장한다.

저장을 원하면 요청에 로그인 사용자의 `Authorization: Bearer <jwt>` 헤더를 포함해야 한다.

## 저장 규칙

- `conversations.user_id`는 현재 로그인 사용자여야 한다.
- `messages.role`은 사용자 질문은 `user`, AI 답변은 `assistant`다.
- `messages.evidence_document_ids`에는 실제 근거로 쓴 `analysis_documents.id`를 저장한다.
- `messages.data_limitations`에는 데이터 부족, 결측, 범위 제한 같은 내용을 저장한다.

## 응답 예시

```json
{
  "status": "success",
  "answer": "..."
}
```

## 주의 사항

이 함수는 숫자 계산을 새로 하지 않는다. 숫자는 `ask-ai`가 만든 근거 묶음을 그대로 사용하고, 이 함수는 자연어 답변과 저장만 담당한다.
