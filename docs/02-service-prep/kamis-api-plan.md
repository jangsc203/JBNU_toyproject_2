# KAMIS API 준비 정리

## 1. 현재 준비 상태

### 로컬 환경

- `KAMIS_API_ID` 입력 완료
- `KAMIS_API_KEY` 입력 완료
- 루트 `.env.local`에 보관 중
- `frontend/.env.local`에는 넣지 않음

### 등록 시점

- 로컬 개발만 할 때는 `.env.local`로 충분하다
- 배포된 Supabase Edge Function이 실제로 KAMIS를 호출하기 전에 `Supabase Edge Functions Secrets`에 등록해야 한다

## 2. 우리 프로젝트에서 먼저 쓸 API

| 우선순위 | KAMIS API | 요청 action | 쓰는 화면 | 용도 |
|---|---|---|---|---|
| 1 | 최근일자 지역별 도.소매가격정보(상품 기준) | `dailyCountyList` | 전체 대시보드 | 품목별 현재 시세, 1일전/1개월전/1년전 비교, 간단한 흐름 |
| 2 | 신)일별 품목별 소매 가격자료 | `periodRetailProductList` | 가격 추이 화면 | 품목별 기간 가격 흐름, 그래프, 변동률 |
| 3 | 농축수산물 품목 및 등급 코드표 | `productInfo` | 내부 매핑/드롭다운 | 품목 코드, 품종 코드, 등급 코드 확인 |

## 3. 대시보드용 API

### `dailyCountyList`

- 요청 URL
  - `http://www.kamis.or.kr/service/price/xml.do?action=dailyCountyList`

- 주요 파라미터
  - `p_cert_key`
  - `p_cert_id`
  - `p_returntype`
  - `p_countycode`

- 응답에서 중요한 필드
  - `county_code`
  - `county_name`
  - `product_cls_code`
  - `product_cls_name`
  - `category_code`
  - `category_name`
  - `productno`
  - `productName`
  - `item_name`
  - `unit`
  - `day1`, `dpr1`
  - `day2`, `dpr2`
  - `day3`, `dpr3`
  - `day4`, `dpr4`
  - `direction`
  - `value`
  - `result_code`

- 화면에서의 역할
  - 카드형 전체 대시보드에 바로 넣을 현재 가격
  - 최근 변동 방향 표시
  - 간단한 미니 추세 계산

## 4. 가격 추이용 API

### `periodRetailProductList`

- 요청 URL
  - `http://www.kamis.or.kr/service/price/xml.do?action=periodRetailProductList`

- 주요 파라미터
  - `p_startday`
  - `p_endday`
  - `p_itemcategorycode`
  - `p_itemcode`
  - `p_kindcode`
  - `p_productrankcode`
  - `p_countrycode`
  - `p_convert_kg_yn`
  - `p_cert_key`
  - `p_cert_id`
  - `p_returntype`

- 응답에서 중요한 필드
  - `itemname`
  - `kindname`
  - `countyname`
  - `marketname`
  - `yyyy`
  - `regday`
  - `price`
  - `condition`
  - `data`

- 화면에서의 역할
  - 품목별 기간 가격 추이 그래프
  - 평균, 최고, 최저, 변화율 계산
  - 위험 분석 입력 데이터

## 5. 코드표용 API

### `productInfo`

- 요청 URL
  - `http://www.kamis.or.kr/service/price/xml.do?action=productInfo`

- 주요 파라미터
  - `p_cert_id`
  - `p_returntype`
  - `p_startday`
  - `p_endday`
  - `p_countrycode`
  - `p_convert_kg_yn`
  - `p_itemcategorycode`
  - `p_itemcode`
  - `p_kindcode`
  - `p_productrankcode`
  - `p_cert_key`

- 응답에서 중요한 필드
  - `itemcategorycode`
  - `itemcategoryname`
  - `itemcode`
  - `itemname`
  - `kindcode`
  - `kindname`
  - `wholesale_unit`
  - `wholesale_unitsize`
  - `retail_unit`
  - `retail_unitsize`
  - `whole_productrankcode`
  - `retail_productrankcode`
  - `price`
  - `marketname`
  - `yyyy`
  - `regday`
  - `countyname`

- 화면에서의 역할
  - 품목 선택 드롭다운
  - 품종 선택 드롭다운
  - 등급 선택 드롭다운
  - 내부 코드 매핑 테이블 생성

## 6. 처음 쓸 품목 후보

엑셀 코드표 기준으로 초기에 다루기 좋은 후보는 다음이다.

| 품목 | 품목 코드 | 품종 코드 | 비고 |
|---|---|---|---|
| 배추 | `211` | `01` 봄, `02` 여름(고랭지), `03` 가을, `06` 월동 | 가격 변동이 크고 화면에 보여주기 좋음 |
| 무 | `231` | `01` 봄, `02` 고랭지, `03` 가을, `06` 월동 | 배추와 함께 대표 채소로 보기 좋음 |
| 양파 | `245` | `00` 양파, `02` 햇양파, `10` 수입 | 대시보드용 대표 품목으로 적합 |
| 대파 | `274` | 품종코드 추가 확인 필요 | 추후 확장 후보 |

## 7. 지역 코드 후보

엑셀 코드표에서 확인된 전남권 또는 인접 조회 후보는 다음이다.

| 지역 | 코드 | 메모 |
|---|---|---|
| 목포 | `3611` | 전남권 대표 지역 후보 |
| 순천 | `3613` | 전남권 대표 지역 후보 |
| 광주 | `2401` | 인접 비교용 후보 |

초기 기본값은 `순천(3613)` 또는 `목포(3611)` 중 하나로 잡고, 필요하면 광주를 비교군으로 추가하면 좋다.

## 8. 등록 순서

1. 로컬 `.env.local`에 `KAMIS_API_ID`, `KAMIS_API_KEY`를 둔다
2. 대시보드용 `dailyCountyList` 호출을 먼저 만든다
3. 품목 추이용 `periodRetailProductList`를 붙인다
4. `productInfo`로 품목/품종/등급 코드 매핑을 만든다
5. 배포 전 `Supabase Edge Functions Secrets`에 같은 키를 등록한다

## 9. 다음 구현 단계에서 필요한 값

- `KAMIS_API_ID`
- `KAMIS_API_KEY`
- 우선 품목 3개 정도의 선택
- 기본 지역 코드 1개
- 대시보드 기준 품목 정렬 방식
- 가격 추이 기본 기간

