# generate-analysis-documents

`risk_results`를 RAG 검색에 사용할 자연어 문서로 변환해 `analysis_documents`에 저장하는 Supabase Edge Function이다.

이 함수는 Gemini 임베딩이나 Pinecone upsert를 수행하지 않는다. 생성된 문서는 `vector_status = pending` 상태가 되며, 다음 단계의 벡터 동기화 함수가 처리한다.

## Secrets

필수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

KAMIS, Gemini, Pinecone Key는 이 함수에서 사용하지 않는다.

## 요청 예시

최신 위험 분석 결과 전체를 문서화:

```json
{}
```

특정 품목과 지역만 문서화:

```json
{
  "productIds": ["11111111-1111-4111-8111-111111111111"],
  "countyCodes": ["3613"]
}
```

특정 위험 결과만 문서화:

```json
{
  "riskResultIds": ["..."]
}
```

데이터 부족 결과를 제외:

```json
{
  "includeInsufficientData": false
}
```

## 동작 방식

1. `data_sync_jobs`에 `document_generation` 작업을 생성한다.
2. 조건에 맞는 `risk_results`를 조회한다.
3. 품목, 기간, 핵심 수치, 위험 근거, 데이터 한계를 포함한 문서 본문을 만든다.
4. 제목, 본문, 주요 metadata를 기준으로 SHA-256 `content_hash`를 계산한다.
5. 같은 `risk_result_id`의 최신 문서와 hash가 같으면 새 문서를 만들지 않고 `skipped` 처리한다.
6. 내용이 바뀌었으면 `version`을 1 증가시키고 `analysis_documents`에 `vector_status = pending`으로 저장한다.
7. 작업 결과를 `data_sync_jobs`에 기록한다.

## 응답 예시

```json
{
  "jobId": "...",
  "status": "success",
  "totalCount": 4,
  "successCount": 4,
  "skippedCount": 0,
  "failedCount": 0
}
```

## 생성 문서 내용

문서에는 다음 정보가 포함된다.

- 품목명
- 지역 코드
- 분석 기간
- 위험 등급과 위험 점수
- 최초, 직전, 최신, 평균, 최저, 최고 가격
- 기간 변화율, 최근 변화율, 변동성
- 부분 위험 점수와 가중치
- 유효 가격 수, 결측 수, 결측 비율
- 데이터 한계와 미래 가격 예측 제외 문구

## 다음 단계

`analysis_documents.vector_status = pending` 문서는 5.3 단계의 벡터 동기화 함수에서 Gemini 임베딩을 생성한 뒤 Pinecone에 upsert한다.
