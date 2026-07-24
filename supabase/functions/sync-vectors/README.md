# sync-vectors

`analysis_documents`를 Gemini 임베딩으로 변환하고 Pinecone에 upsert하는 Supabase Edge Function이다.

이 함수는 검색용 문서가 만들어진 뒤 5.3 단계에서 실행한다.

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

대기 중인 문서만 동기화:

```json
{}
```

특정 문서만 재처리:

```json
{
  "analysisDocumentIds": ["..."],
  "force": true
}
```

품목별로 재동기화:

```json
{
  "productIds": ["11111111-1111-4111-8111-111111111111"]
}
```

## 동작 방식

1. `analysis_documents`에서 대상 문서를 조회한다.
2. 각 문서별로 `vector_sync_jobs`를 `running` 상태로 만든다.
3. 문서 본문과 제목을 합쳐 Gemini 임베딩을 생성한다.
4. 임베딩 차원을 `1024`로 확인한다.
5. Pinecone `toy-project-2` 인덱스의 `jeonnam-agri-analysis` namespace에 upsert한다.
6. 성공 시 `analysis_documents.vector_status = synced`로 바꾼다.
7. 실패 시 `vector_sync_jobs`와 `analysis_documents.vector_status = failed`를 기록한다.

## 벡터 ID

```text
analysis_document:{analysis_document_id}:v{version}
```

## Pinecone metadata

동기화 시 다음 metadata를 넣는다.

- `analysis_document_id`
- `source_table`
- `source_id`
- `document_type`
- `risk_result_id`
- `product_id`
- `product_name`
- `county_code`
- `period_start`
- `period_end`
- `risk_grade`
- `risk_score`
- `score_version`
- `content_hash`
- `version`
- `is_mock`

## 재처리

`force: true`를 주면 이미 동기화된 문서도 다시 임베딩하고 다시 upsert할 수 있다. Pinecone 인덱스를 재구축해야 할 때 이 옵션을 사용한다.
