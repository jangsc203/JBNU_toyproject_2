# sync-kamis-prices

This Edge Function syncs only retail KAMIS datasets used by the current project flow.

## What it fetches

- `periodRetailProductList`
  - Used for the main dashboard price cards and trend cards
  - Today-only snapshot and recent 30-day range
  - County filtered with `p_countrycode`
- `monthlySalesList`
  - Used for the analysis page 18-month regional average chart
  - Stored as `market_name = "monthly"`
  - County filtered with `p_countycode`

## Secrets

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KAMIS_API_ID`
- `KAMIS_API_KEY`

Optional:

- `KAMIS_MOCK_MODE=true`

## Request body

```json
{
  "mock": false,
  "countyCodes": ["3511", "3613", "2401"],
  "includeDaily": true,
  "includeMonthly": false,
  "monthlyMonths": 18
}
```

`productIds` can be added to limit the sync to specific products.

For monthly-only sync:

```json
{
  "countyCodes": ["3511", "3613", "2401"],
  "includeDaily": false,
  "includeMonthly": true,
  "monthlyMonths": 18
}
```

## Response

```json
{
  "jobId": "...",
  "mock": false,
  "countyCodes": ["3511", "3613", "2401"],
  "productCount": 4,
  "recordCount": 128,
  "status": "success",
  "sources": ["periodRetailProductList", "monthlySalesList"]
}
```

## Local run

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/sync-kamis-prices \
  -H "Content-Type: application/json" \
  -d "{\"countyCodes\":[\"3511\",\"3613\",\"2401\"]}"
```
