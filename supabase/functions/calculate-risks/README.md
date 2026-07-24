# calculate-risks

`price_records`를 읽어 규칙 기반 위험 점수와 등급을 계산하고 `risk_results`에 저장하는 Supabase Edge Function이다.

## Secrets

필수:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 입력 규칙

1. `productIds`를 비우면 활성 품목 전체를 대상으로 한다.
2. `countyCodes`를 비우면 기본 지역 `3613`을 사용한다.
3. `startDate`, `endDate`를 비우면 최근 30일을 분석한다.
4. 날짜는 `YYYY-MM-DD` 형식을 사용한다.
5. `scoreVersion`을 비우면 `v1`을 사용한다.

## 요청 예시

```json
{
  "countyCodes": ["3613"],
  "startDate": "2026-07-01",
  "endDate": "2026-07-22"
}
```

특정 품목만 분석:

```json
{
  "productIds": ["11111111-1111-4111-8111-111111111111"],
  "countyCodes": ["3613"],
  "startDate": "2026-07-01",
  "endDate": "2026-07-22"
}
```

## 등급 기준

| 등급 | 기준 |
|---|---|
| `insufficient_data` | 유효 가격 5개 미만, 결측 비율 50% 초과, 최신 가격 없음 |
| `high` | `risk_score >= 70` |
| `watch` | `40 <= risk_score < 70` |
| `stable` | `risk_score < 40` |

## 점수 구성

| 항목 | 가중치 |
|---|---|
| 기간 변화율 | 35 |
| 최근 변화율 | 20 |
| 변동성 | 25 |
| 데이터 품질 | 20 |

AI는 위험 점수를 만들지 않는다. 이 함수가 재현 가능한 규칙으로 계산하고, AI는 이후 단계에서 결과를 설명하는 역할을 맡는다.
