import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type SyncRequest = {
  productIds?: string[];
  countyCodes?: string[];
  startDate?: string;
  endDate?: string;
  includeDaily?: boolean;
  includeMonthly?: boolean;
  monthlyMonths?: number;
  mock?: boolean;
};

type Product = {
  id: string;
  display_name: string;
  category_name: string | null;
  kamis_category_code: string | null;
  kamis_item_code: string;
  kamis_kind_code: string | null;
  kamis_rank_code: string | null;
  default_unit: string | null;
  metadata: Record<string, unknown>;
};

type SourceAction = "periodRetailProductList" | "monthlySalesList" | "mock";

type PriceRecord = {
  product_id: string;
  price_date: string;
  price: number | null;
  unit: string | null;
  county_code: string;
  county_name: string | null;
  market_name: string | null;
  product_cls_code: "01" | "02";
  product_cls_name: string | null;
  source: "KAMIS";
  source_action: SourceAction;
  source_payload: Record<string, unknown>;
  data_status: "valid" | "missing" | "invalid" | "mock";
  is_mock: boolean;
  sync_job_id: string;
};

const DEFAULT_COUNTY_CODES = ["3511", "3613", "2401"];
const TARGET_COUNTY_LABELS: Record<string, string> = {
  "3511": "전주",
  "3613": "순천",
  "2401": "광주",
};
const KAMIS_BASE_URL = "https://www.kamis.or.kr/service/price/xml.do";
const TODAY_PRODUCT_CLASS: "01" | "02" = "01";
const TREND_DAYS = 30;
const MONTHLY_MONTHS = 18;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const mock = body.mock ?? Deno.env.get("KAMIS_MOCK_MODE") === "true";
    const countyCodes = normalizeStringArray(body.countyCodes, DEFAULT_COUNTY_CODES);
    const today = normalizeDateInput(body.endDate) ?? toDateString(new Date());
    const trendStart = normalizeDateInput(body.startDate) ?? shiftDate(today, -(TREND_DAYS - 1));
    const includeDaily = body.includeDaily ?? true;
    const includeMonthly = body.includeMonthly ?? false;
    const monthlyMonths = normalizePositiveInteger(body.monthlyMonths, MONTHLY_MONTHS);
    const monthlyStart = monthStart(shiftMonths(today, -(monthlyMonths - 1)));

    const supabase = createServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("data_sync_jobs")
      .insert({
        job_type: "kamis_period",
        status: "running",
        triggered_by: "manual",
        period_start: trendStart,
        period_end: today,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError) throw new Error(`Failed to create sync job: ${jobError.message}`);

    const jobId = job.id as string;

    try {
      const products = await loadProducts(supabase, body.productIds);
      const targetProductIds = products.map((product) => product.id);

      await supabase
        .from("data_sync_jobs")
        .update({
          target_product_ids: targetProductIds,
          total_count: products.length * countyCodes.length * (Number(includeDaily) + Number(includeMonthly)),
        })
        .eq("id", jobId);

      const records: PriceRecord[] = [];
      const itemResults: Array<Record<string, unknown>> = [];

      for (const product of products) {
        for (const countyCode of countyCodes) {
          if (includeDaily) {
            const trendResult = mock
              ? buildMockTrendRecords(product, countyCode, trendStart, today, jobId)
              : await fetchRetailProductList(product, countyCode, trendStart, today, jobId, "recent_30d");
            records.push(...trendResult.records);
            itemResults.push(trendResult.summary);
          }

          if (includeMonthly) {
            const monthlyResult = mock
              ? buildMockMonthlyRecords(product, countyCode, monthlyStart, today, jobId)
              : await fetchMonthlySalesList(product, countyCode, monthlyStart, today, jobId);
            records.push(...monthlyResult.records);
            itemResults.push(monthlyResult.summary);
          }
        }
      }

      const dedupedRecords = dedupePriceRecords(records);
      const upsertResult = dedupedRecords.length > 0
        ? await supabase.from("price_records").upsert(dedupedRecords, {
          onConflict: "product_id,price_date,county_code,product_cls_code,market_name,source",
        })
        : { error: null };

      if (upsertResult.error) {
        throw new Error(`Failed to upsert price records: ${upsertResult.error.message}`);
      }

      const failedCount = itemResults.filter((item) => item.status === "failed").length;
      const skippedCount = itemResults.filter((item) => item.status === "skipped").length;
      const status = itemResults.length > 0 && skippedCount === itemResults.length
        ? "skipped"
        : failedCount === 0
        ? "success"
        : failedCount === itemResults.length
        ? "failed"
        : "partial_success";

      await finishJob(supabase, jobId, {
        status,
        total_count: itemResults.length,
        success_count: itemResults.length - failedCount - skippedCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        error_summary: failedCount > 0 ? "Some KAMIS requests failed." : null,
        error_detail: {
          itemResults,
          countyCodes,
          productCount: products.length,
          trendStart,
          monthlyStart,
          periodEnd: today,
          includeDaily,
          includeMonthly,
        },
      });

      return jsonResponse({
        jobId,
        mock,
        countyCodes,
        productCount: products.length,
        recordCount: dedupedRecords.length,
        status,
        sources: [
          ...(includeDaily ? ["periodRetailProductList"] : []),
          ...(includeMonthly ? ["monthlySalesList"] : []),
        ],
      });
    } catch (error) {
      await finishJob(supabase, jobId, {
        status: "failed",
        error_summary: toSafeErrorMessage(error),
        error_detail: { message: toSafeErrorMessage(error) },
      });
      throw error;
    }
  } catch (error) {
    return jsonResponse({ error: toSafeErrorMessage(error) }, 500);
  }
});

async function readRequestBody(req: Request): Promise<SyncRequest> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as SyncRequest;
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function loadProducts(
  supabase: ReturnType<typeof createServiceClient>,
  productIds?: string[],
): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("id, display_name, category_name, kamis_category_code, kamis_item_code, kamis_kind_code, kamis_rank_code, default_unit, metadata")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (productIds && productIds.length > 0) {
    query = query.in("id", productIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load products: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No active products found");
  return data as Product[];
}

async function fetchRetailProductList(
  product: Product,
  countyCode: string,
  startDate: string,
  endDate: string,
  jobId: string,
  scope: "today_price" | "recent_30d",
): Promise<{ records: PriceRecord[]; summary: Record<string, unknown> }> {
  try {
    const response = await fetchKamis("periodRetailProductList", {
      p_productclscode: TODAY_PRODUCT_CLASS,
      p_startday: startDate,
      p_endday: endDate,
      p_itemcategorycode: product.kamis_category_code ?? "",
      p_itemcode: product.kamis_item_code,
      p_kindcode: product.kamis_kind_code ?? "",
      p_productrankcode: product.kamis_rank_code ?? "",
      p_countrycode: countyCode,
      p_convert_kg_yn: "N",
    });

    const rows = normalizeRows(response.price ?? response.data);
    const filteredRows = filterRowsByProductNo(rows, product.kamis_item_code).filter(isRegionalAverageRow);
    const records = filteredRows.flatMap((row) =>
      periodRowToRecord(product, countyCode, row, jobId, scope, startDate, endDate)
    );

    return {
      records,
      summary: {
        action: "periodRetailProductList",
        scope,
        productId: product.id,
        countyCode,
        status: records.length > 0 ? "success" : "skipped",
        recordCount: records.length,
      },
    };
  } catch (error) {
    return {
      records: [],
      summary: {
        action: "periodRetailProductList",
        scope,
        productId: product.id,
        countyCode,
        status: "failed",
        error: toSafeErrorMessage(error),
      },
    };
  }
}

async function fetchMonthlySalesList(
  product: Product,
  countyCode: string,
  startMonth: string,
  endDate: string,
  jobId: string,
): Promise<{ records: PriceRecord[]; summary: Record<string, unknown> }> {
  try {
    const rankCandidates = monthlyRankCandidates(product.kamis_rank_code);
    const attempts: Array<Record<string, unknown>> = [];

    for (const rank of rankCandidates) {
      const response = await fetchKamis("monthlySalesList", {
        p_yyyy: endDate.slice(0, 4),
        p_period: String(Math.max(Number(endDate.slice(0, 4)) - Number(startMonth.slice(0, 4)) + 1, 1)),
        p_itemcategorycode: product.kamis_category_code ?? "",
        p_itemcode: product.kamis_item_code,
        p_kindcode: product.kamis_kind_code ?? "",
        p_graderank: rank,
        p_countycode: countyCode,
        p_convert_kg_yn: "N",
      });

      const rows = normalizeRows(response.price ?? response.data);
      const productRows = filterRowsByProductNo(rows, product.kamis_item_code);
      const retailRows = productRows.filter((row) => normalizeProductClass(row.productclscode) === TODAY_PRODUCT_CLASS);
      const records = retailRows
        .flatMap((row) => monthlyItemToRecords(product, countyCode, row, jobId))
        .filter((record) => record.price_date >= `${startMonth}-01` && record.price_date <= endDate);

      attempts.push({
        rank: rank || "empty",
        errorCode: response?.error_code ?? null,
        rawRowCount: rows.length,
        productRowCount: productRows.length,
        retailRowCount: retailRows.length,
        recordCount: records.length,
        sampleKeys: rows[0] ? Object.keys(rows[0]).slice(0, 20) : [],
      });

      if (records.length > 0) {
        return {
          records,
          summary: {
            action: "monthlySalesList",
            productId: product.id,
            countyCode,
            status: "success",
            recordCount: records.length,
            monthlyRank: rank || "empty",
            attempts,
          },
        };
      }
    }

    return {
      records: [],
      summary: {
        action: "monthlySalesList",
        productId: product.id,
        countyCode,
        status: "skipped",
        recordCount: 0,
        attempts,
      },
    };
  } catch (error) {
    return {
      records: [],
      summary: {
        action: "monthlySalesList",
        productId: product.id,
        countyCode,
        status: "failed",
        error: toSafeErrorMessage(error),
      },
    };
  }
}

async function fetchKamis(action: string, params: Record<string, string>) {
  const certKey = Deno.env.get("KAMIS_API_KEY")?.trim();
  const certId = Deno.env.get("KAMIS_API_ID")?.trim();

  if (!certKey || !certId) {
    throw new Error("Missing KAMIS_API_KEY or KAMIS_API_ID");
  }

  const url = new URL(KAMIS_BASE_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("p_cert_key", certKey);
  url.searchParams.set("p_cert_id", certId);
  url.searchParams.set("p_returntype", "json");

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    throw new Error(`KAMIS request failed with HTTP ${response.status}`);
  }

  const data = await response.json();
  const resultCode = asString(data?.condition?.[0]?.code ?? data?.condition?.code ?? data?.result_code);
  if (resultCode && !["0", "000", "001"].includes(resultCode)) {
    throw new Error(`KAMIS returned result code ${resultCode}`);
  }

  return data;
}

function periodRowToRecord(
  product: Product,
  countyCode: string,
  row: Record<string, unknown>,
  jobId: string,
  scope: "today_price" | "recent_30d",
  startDate: string,
  endDate: string,
): PriceRecord[] {
  const priceDate = normalizeKamisDate(asString(row.regday), asString(row.yyyy));
  if (!priceDate) return [];

  const price = parsePrice(row.price ?? row.dpr1 ?? row.dpr2 ?? row.dpr3 ?? row.dpr4);
  return [{
    product_id: product.id,
    price_date: priceDate,
    price,
    unit: nullableString(row.unit) ?? product.default_unit,
    county_code: asString(row.county_code) || countyCode,
    county_name: nullableString(row.county_name) ?? countyLabel(countyCode),
    market_name: scope,
    product_cls_code: normalizeProductClass(row.product_cls_code),
    product_cls_name: nullableString(row.product_cls_name),
    source: "KAMIS",
    source_action: "periodRetailProductList",
    source_payload: {
      requestedAction: "periodRetailProductList",
      scope,
      startDate,
      endDate,
      row: stripSensitivePayload(row),
    },
    data_status: price === null ? "missing" : "valid",
    is_mock: false,
    sync_job_id: jobId,
  }];
}

function monthlyItemToRecords(
  product: Product,
  countyCode: string,
  item: Record<string, unknown>,
  jobId: string,
): PriceRecord[] {
  const year = asString(item.yyyy).trim();
  if (!/^\d{4}$/.test(year)) return [];

  const records: PriceRecord[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const monthKey = `m${month}`;
    const price = parsePrice(item[monthKey]);
    if (price === null) continue;

    records.push({
      product_id: product.id,
      price_date: `${year}-${String(month).padStart(2, "0")}-01`,
      price,
      unit: product.default_unit,
      county_code: countyCode,
      county_name: countyLabel(countyCode),
      market_name: "monthly",
      product_cls_code: normalizeProductClass(item.productclscode),
      product_cls_name: nullableString(item.caption) ?? "monthly_sales",
      source: "KAMIS",
      source_action: "monthlySalesList",
      source_payload: {
        requestedAction: "monthlySalesList",
        countyCode,
        item: stripSensitivePayload(item),
      },
      data_status: "valid",
      is_mock: false,
      sync_job_id: jobId,
    });
  }

  return records;
}

function buildMockTodayRecords(
  product: Product,
  countyCode: string,
  today: string,
  jobId: string,
): { records: PriceRecord[]; summary: Record<string, unknown> } {
  const price = 1000 + Number(product.kamis_item_code.slice(-2)) * 20;
  const records: PriceRecord[] = [{
    product_id: product.id,
    price_date: today,
    price,
    unit: product.default_unit,
    county_code: countyCode,
    county_name: countyLabel(countyCode),
    market_name: "today_price",
    product_cls_code: TODAY_PRODUCT_CLASS,
    product_cls_name: "current_price",
    source: "KAMIS",
    source_action: "mock",
    source_payload: { mock: true, requestedAction: "periodRetailProductList", scope: "today_price" },
    data_status: "mock",
    is_mock: true,
    sync_job_id: jobId,
  }];

  return {
    records,
    summary: {
      action: "periodRetailProductList",
      scope: "today_price",
      productId: product.id,
      countyCode,
      status: "success",
      recordCount: records.length,
    },
  };
}

function buildMockTrendRecords(
  product: Product,
  countyCode: string,
  startDate: string,
  endDate: string,
  jobId: string,
): { records: PriceRecord[]; summary: Record<string, unknown> } {
  const records: PriceRecord[] = [];
  let cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let index = 0;

  while (cursor <= end) {
    records.push({
      product_id: product.id,
      price_date: toDateString(cursor),
      price: 1000 + Number(product.kamis_item_code.slice(-2)) * 20 + index * 3,
      unit: product.default_unit,
      county_code: countyCode,
      county_name: countyLabel(countyCode),
      market_name: "recent_30d",
      product_cls_code: TODAY_PRODUCT_CLASS,
      product_cls_name: "trend",
      source: "KAMIS",
      source_action: "mock",
      source_payload: { mock: true, requestedAction: "periodRetailProductList", scope: "recent_30d" },
      data_status: "mock",
      is_mock: true,
      sync_job_id: jobId,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    index += 1;
  }

  return {
    records,
    summary: {
      action: "periodRetailProductList",
      scope: "recent_30d",
      productId: product.id,
      countyCode,
      status: "success",
      recordCount: records.length,
    },
  };
}

function buildMockMonthlyRecords(
  product: Product,
  countyCode: string,
  startMonth: string,
  endDate: string,
  jobId: string,
): { records: PriceRecord[]; summary: Record<string, unknown> } {
  const records: PriceRecord[] = [];
  let cursor = new Date(`${startMonth}-01T00:00:00.000Z`);
  const end = new Date(`${monthStart(endDate)}-01T00:00:00.000Z`);
  let index = 0;

  while (cursor <= end) {
    records.push({
      product_id: product.id,
      price_date: `${toMonthString(cursor)}-01`,
      price: 1000 + Number(product.kamis_item_code.slice(-2)) * 20 + index * 25,
      unit: product.default_unit,
      county_code: countyCode,
      county_name: countyLabel(countyCode),
      market_name: "monthly",
      product_cls_code: TODAY_PRODUCT_CLASS,
      product_cls_name: "monthly_sales",
      source: "KAMIS",
      source_action: "mock",
      source_payload: { mock: true, requestedAction: "monthlySalesList" },
      data_status: "mock",
      is_mock: true,
      sync_job_id: jobId,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    index += 1;
  }

  return {
    records,
    summary: {
      action: "monthlySalesList",
      productId: product.id,
      countyCode,
      status: "success",
      recordCount: records.length,
    },
  };
}

function dedupePriceRecords(records: PriceRecord[]): PriceRecord[] {
  const byKey = new Map<string, PriceRecord>();

  for (const record of records) {
    const key = [
      record.product_id,
      record.price_date,
      record.county_code,
      record.product_cls_code,
      record.market_name ?? "",
      record.source,
    ].join("|");

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, record);
      continue;
    }

    byKey.set(key, {
      ...existing,
      price: averageNullable(existing.price, record.price),
      source_payload: {
        ...existing.source_payload,
        duplicatePayloads: [
          ...((existing.source_payload.duplicatePayloads as unknown[] | undefined) ?? []),
          record.source_payload,
        ],
      },
      data_status: existing.data_status === "valid" || record.data_status === "valid" ? "valid" : existing.data_status,
    });
  }

  return Array.from(byKey.values());
}

function averageNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.round(((a + b) / 2) * 100) / 100;
}

async function finishJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("data_sync_jobs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error("Failed to finish sync job", error.message);
  }
}

function normalizeRows(
  value: unknown,
  parentInfo: Record<string, unknown> = {},
): Array<Record<string, unknown>> {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeRows(item, parentInfo));
  }

  if (isObjectRecord(value)) {
    const currentMeta = {
      ...parentInfo,
      productclscode: value.productclscode ?? parentInfo.productclscode,
      caption: value.caption ?? parentInfo.caption,
      itemcode: value.itemcode ?? value.item_code ?? parentInfo.itemcode,
    };

    for (const key of ["item", "data", "price", "info"]) {
      const nested = value[key];
      if (Array.isArray(nested) || isObjectRecord(nested)) {
        return normalizeRows(nested, currentMeta);
      }
    }

    return [{ ...currentMeta, ...value }];
  }

  return [];
}

function filterRowsByProductNo(rows: Array<Record<string, unknown>>, productCode: string) {
  return rows.filter((row) => {
    const rowProductNo = asString(row.productno ?? row.itemcode ?? row.item_code);
    return !rowProductNo || rowProductNo === productCode;
  });
}

function isRegionalAverageRow(row: Record<string, unknown>) {
  const countyName = asString(row.countyname ?? row.county_name).trim();
  const marketName = asString(row.marketname ?? row.market_name).trim();
  return countyName === "평균" || marketName === "평균" || (!countyName && !marketName);
}

function parsePrice(value: unknown): number | null {
  const text = asString(value).replaceAll(",", "").trim();
  if (!text || text === "-" || text.includes("품절") || text.includes("조사 안함")) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKamisDate(value: string, yearHint?: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(text)) return text.replaceAll(".", "-");
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) return text.replaceAll("/", "-");
  if (/^\d{2}-\d{2}$/.test(text) && /^\d{4}$/.test(yearHint ?? "")) return `${yearHint}-${text}`;
  if (/^\d{2}\.\d{2}$/.test(text) && /^\d{4}$/.test(yearHint ?? "")) return `${yearHint}-${text.replaceAll(".", "-")}`;
  if (/^\d{2}\/\d{2}$/.test(text) && /^\d{4}$/.test(yearHint ?? "")) return `${yearHint}-${text.replaceAll("/", "-")}`;
  return null;
}

function normalizeProductClass(value: unknown): "01" | "02" {
  return asString(value) === "02" ? "02" : "01";
}

function monthlyRankCandidates(rankCode: string | null): string[] {
  const candidates = [
    rankCode ?? "",
    rankCode === "04" ? "2" : "",
    rankCode === "05" ? "1" : "",
    "2",
    "1",
    "",
  ];
  return Array.from(new Set(candidates.map((value) => value.trim())));
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.map((item) => String(item).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeDateInput(value: unknown): string | null {
  const text = asString(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function countyLabel(countyCode: string) {
  return TARGET_COUNTY_LABELS[countyCode] ?? "전국";
}

function stripSensitivePayload(row: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(["p_cert_key", "p_cert_id", "cert_key", "cert_id"]);
  return Object.fromEntries(Object.entries(row).filter(([key]) => !blocked.has(key)));
}

function nullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text ? text : null;
}

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shiftDate(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

function shiftMonths(dateString: string, months: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toDateString(date);
}

function monthStart(dateString: string): string {
  return dateString.slice(0, 7);
}

function toMonthString(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
