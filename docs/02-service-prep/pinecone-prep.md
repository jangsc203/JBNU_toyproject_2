# Pinecone 준비 체크리스트

## 1. 2.4에서 해야 할 일

Pinecone은 벡터 검색 저장소다. 우리 프로젝트에서는 분석 문서 임베딩을 저장하고 검색하는 용도로만 쓴다.

### 사용자가 직접 해야 할 일

1. Pinecone 계정 로그인
2. 프로젝트 생성 또는 기존 프로젝트 선택
3. API Key 발급
4. 인덱스 생성
5. 인덱스 `host` 값 확인

### 내가 이어서 할 일

1. Pinecone API Key와 인덱스 정보를 바탕으로 환경변수 이름 정리
2. Edge Function에서 Pinecone upsert/query 흐름 작성
3. Supabase 원본 문서 ID와 벡터 ID 매핑 설계

## 2. Pinecone에서 나에게 필요한 값

| 항목 | 왜 필요한가 |
|---|---|
| `PINECONE_API_KEY` | Pinecone API 호출 인증 |
| `PINECONE_INDEX_NAME` | 어떤 인덱스를 사용할지 식별 |
| `PINECONE_HOST` | upsert/query 요청 대상 주소 |
| 인덱스 생성 방식 | 서버리스인지, 다른 방식인지 구분 |
| 인덱스 지역 | cloud/region 설정 확인 |
| 임베딩 모델명 | 벡터 차원과 맞추기 위해 필요 |

## 3. 인덱스 생성 시 권장 설정

공식 문서 기준으로 인덱스를 만들 때는 아래 요소를 정한다.

- 이름: 소문자, 숫자, 하이픈만 사용
- 벡터 타입: `dense`
- metric: `cosine`
- 배포 방식: serverless
- cloud/region: 보통 `aws`, `us-east-1` 같은 조합부터 시작

인덱스 생성 시에는 벡터 차원이 필요하다. 이 차원은 우리가 최종적으로 사용할 임베딩 모델의 출력 차원과 같아야 한다.

## 4. 지금 바로 해도 되는 것

1. Pinecone 프로젝트 생성
2. API Key 발급
3. 인덱스 이름 후보 정하기
4. region 후보 정하기

## 5. 아직 확정 전에 기다려도 되는 것

1. 정확한 인덱스 차원
2. 최종 임베딩 모델명
3. 문서 분할 기준
4. namespace 분리 규칙

## 6. 준비가 끝나면 나에게 보내줄 것

아래 형태로 보내주면 된다.

```env
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=...
PINECONE_HOST=...
```

추가로 알려주면 좋은 것:

1. 서버리스 인덱스로 만들었는지 여부
2. 선택한 cloud/region
3. 임베딩 모델 후보

## 7. 참고 문서

- [Pinecone authentication](https://docs.pinecone.io/reference/api/authentication)
- [Create an index](https://docs.pinecone.io/reference/api/2026-04/control-plane/create_index)
- [Manage API keys](https://docs.pinecone.io/guides/projects/manage-api-keys)

