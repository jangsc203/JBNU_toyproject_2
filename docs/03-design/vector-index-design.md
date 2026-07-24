# Pinecone 인덱스 설계

## 1. 목적

이 문서는 분석 문서를 Pinecone에 저장할 때 사용할 인덱스, namespace, vector ID, metadata, 재구축 정책을 정의한다.

Supabase Postgres는 이 프로젝트의 Source of Truth이며, Pinecone은 Supabase `analysis_documents`에서 언제든 다시 만들 수 있는 파생 검색 저장소로만 사용한다.

## 2. 인덱스 기준

| 항목 | 값 |
|---|---|
| Pinecone index name | `toy-project-2` |
| vector type | dense |
| embedding model | `gemini-embedding-2` |
| embedding dimension | `1024` |
| Gemini option | `outputDimensionality: 1024` |
| metric | cosine |
| 원본 저장소 | Supabase `analysis_documents` |

Pinecone API Key, host, index 접속 정보는 브라우저에 노출하지 않고 Supabase Edge Functions Secrets 또는 서버 실행 환경에서만 사용한다.

## 3. Namespace 기준

초기 namespace는 다음 값으로 고정한다.

```text
jeonnam-agri-analysis
```

namespace를 고정하는 이유는 초기 범위가 단일 프로젝트, 단일 데이터셋, 단일 임베딩 차원으로 제한되기 때문이다. 향후 운영 데이터와 실습/mock 데이터를 분리해야 하면 아래처럼 확장한다.

| 용도 | namespace 예시 |
|---|---|
| 기본 운영 문서 | `jeonnam-agri-analysis` |
| 실습/mock 문서 | `jeonnam-agri-analysis-mock` |
| 임베딩 모델 교체 실험 | `jeonnam-agri-analysis-gemini-embedding-2` |

초기 구현에서는 mock 여부를 namespace로 나누지 않고 metadata `is_mock` 필드로 필터링한다.

## 4. Vector ID 규칙

Pinecone vector ID는 Supabase 원본 문서 ID와 문서 버전을 포함한다.

```text
analysis_document:{analysis_document_id}:v{version}
```

예시:

```text
analysis_document:4b0325e0-11f3-41bb-9c42-2d23ef5f4f05:v1
```

규칙:

1. 하나의 Pinecone vector는 하나의 Supabase `analysis_documents` 행과 연결한다.
2. 문서 내용이 바뀌면 `analysis_documents.version`을 증가시키고 새 vector ID를 만든다.
3. 동일 `content_hash`는 중복 임베딩하지 않고 `skipped`로 처리할 수 있다.
4. Pinecone 검색 결과는 metadata만 신뢰하지 않고 Supabase 원본 문서를 다시 조회해 사용자에게 표시한다.

## 5. Metadata 필드

Pinecone metadata에는 필터링과 Supabase 재조회에 필요한 최소 필드만 넣는다. 본문 전체는 Pinecone metadata에 저장하지 않는다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `source_table` | string | 원본 테이블. 초기값 `analysis_documents` |
| `analysis_document_id` | string | Supabase `analysis_documents.id` |
| `document_type` | string | `risk_summary`, `price_summary`, `report` |
| `source_id` | string | 원천 데이터 ID. 위험 요약이면 `risk_results.id` |
| `risk_result_id` | string/null | 위험 분석 결과 ID |
| `product_id` | string/null | 품목 ID |
| `product_name` | string/null | 품목 표시명 |
| `county_code` | string/null | 지역 코드 |
| `period_start` | string/null | 문서 기준 시작일 |
| `period_end` | string/null | 문서 기준 종료일 |
| `risk_grade` | string/null | `high`, `watch`, `stable`, `insufficient_data` |
| `risk_score` | number/null | 위험 점수 |
| `score_version` | string/null | 위험 점수 규칙 버전 |
| `content_hash` | string | 문서 내용 해시 |
| `version` | number | 문서 버전 |
| `is_mock` | boolean | mock 데이터 여부 |

필터 예시:

| 질문 유형 | Pinecone 필터 |
|---|---|
| 특정 품목 분석 근거 | `product_id = ...` |
| 특정 기간 문서 | `period_start`, `period_end` 범위 |
| 고위험 사례 검색 | `risk_grade = high` |
| 실데이터만 검색 | `is_mock = false` |

## 6. 재구축 정책

Pinecone은 파생 저장소이므로 장애나 삭제가 발생해도 Supabase 원본을 기준으로 재구축한다.

재구축 절차:

1. Supabase `analysis_documents`에서 재동기화 대상 문서를 조회한다.
2. 대상 조건은 `vector_status in ('pending', 'failed')` 또는 강제 재구축 요청이다.
3. Gemini `gemini-embedding-2`로 문서 본문을 임베딩한다.
4. 임베딩 요청에는 `outputDimensionality: 1024`를 지정한다.
5. Pinecone `toy-project-2` 인덱스의 `jeonnam-agri-analysis` namespace에 upsert한다.
6. `vector_sync_jobs`에 index, namespace, vector ID, model, dimension, content hash, 성공/실패 상태를 기록한다.
7. 성공한 `analysis_documents.vector_status`는 `synced`로 변경한다.

## 7. 실패 처리

| 실패 지점 | 보존 데이터 | 처리 |
|---|---|---|
| 검색 문서 생성 실패 | `risk_results` | `data_sync_jobs`에 실패 기록 후 재실행 |
| Gemini 임베딩 실패 | `analysis_documents` | `vector_sync_jobs.failed`, 문서는 `failed` 또는 `pending` 유지 |
| Pinecone upsert 실패 | `analysis_documents`, 임베딩 작업 이력 | `vector_sync_jobs.failed` 기록 후 재시도 |
| Pinecone 인덱스 손실 | Supabase 전체 원본 | 모든 `analysis_documents` 기준 재구축 |

오류 로그에는 API Key, service role key, Pinecone host 전체 URL 같은 민감값을 저장하지 않는다.

## 8. 검색 시 원본 재검증

RAG 응답 흐름에서는 Pinecone 검색 결과를 최종 근거로 바로 사용하지 않는다.

1. Pinecone에서 관련 vector를 검색한다.
2. metadata의 `analysis_document_id` 목록을 얻는다.
3. Supabase `analysis_documents`를 다시 조회한다.
4. 필요한 경우 `risk_results`, `price_records`, `products`를 추가 조회한다.
5. 사용자 응답에는 Supabase 원본 기준의 제목, 기간, 수치, 데이터 한계를 사용한다.

이 원칙을 지키면 Pinecone metadata가 오래되었거나 누락되어도 원본 데이터 정합성을 유지할 수 있다.
