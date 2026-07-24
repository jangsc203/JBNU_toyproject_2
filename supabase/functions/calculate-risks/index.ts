import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type RiskRequest = {
  productIds?: string[];
  countyCodes?: string[];
  startDate?: string;
  endDate?: string;
  scoreVersion?: string;
};

type Product = {
  id: string;
  display_name: string;
};

type PriceRecord = {
  product_id: string;
  price_date: string;
  price: number | null;
  market_name: string | null;
  data_status: string;
  is_mock: boolean;
};

type RiskGrade = "high" | "watch" | "stable" | "insufficient_data";

type RiskResult = {
  product_id: string;
  period_start: string;
  period_end: string;
  county_code: string;
  risk_score: number | null;
  risk_grade: RiskGrade;
  score_version: string;
  evidence: Record<string, unknown>;
  data_quality: Record<string, unknown>;
  source_price_count: number;
  sync_job_id: string;
  is_latest: boolean;
};

const DEFAULT_COUNTY_CODES = ["3613"];
const DEFAULT_SCORE_VERSION = "v1";
const MIN_VALID_PRICE_COUNT = 5;
const MAX_MISSING_RATIO = 0.5;
const RISK_HISTORY_MONTHS = 18;

const WEIGHTS = {
  periodChange: 35,
  recentChange: 20,
  volatility: 25,
  dataQuality: 20,
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const dateRange = normalizeDateRange(body.startDate, body.endDate);
    const countyCodes = normalizeStringArray(body.countyCodes, DEFAULT_COUNTY_CODES);
    const scoreVersion = body.scoreVersion?.trim() || DEFAULT_SCORE_VERSION;
    const supabase = createServiceClient();

    const { data: job, error: jobError } = await supabase
      .from("data_sync_jobs")
      .insert({
        job_type: "risk_analysis",
        status: "running",
        triggered_by: "manual",
        period_start: dateRange.startDate,
        period_end: dateRange.endDate,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError) throw new Error(`Failed to create risk job: ${jobError.message}`);

    const jobId = job.id as string;

    try {
      const products = await loadProducts(supabase, body.productIds);
      await supabase
        .from("data_sync_jobs")
        .update({
          target_product_ids: products.map((product) => product.id),
          total_count: products.length * countyCodes.length,
        })
        .eq("id", jobId);

      const results: RiskResult[] = [];
      const itemResults: Array<Record<string, unknown>> = [];

      for (const product of products) {
        for (const countyCode of countyCodes) {
          const records = await loadRiskPriceRecords(
            supabase,
            product.id,
            countyCode,
            dateRange.startDate,
            dateRange.endDate,
          );
          const risk = calculateRisk(product, countyCode, records, dateRange.startDate, dateRange.endDate, scoreVersion, jobId);
          results.push(risk);
          itemResults.push({
            productId: product.id,
            productName: product.display_name,
            countyCode,
            status: risk.risk_grade === "insufficient_data" ? "skipped" : "success",
            riskGrade: risk.risk_grade,
            riskScore: risk.risk_score,
            sourcePriceCount: risk.source_price_count,
          });
        }
      }

      for (const result of results) {
        await supabase
          .from("risk_results")
          .update({ is_latest: false })
          .eq("product_id", result.product_id)
          .eq("county_code", result.county_code)
          .eq("score_version", scoreVersion);
      }

      const { error: upsertError } = await supabase
        .from("risk_results")
        .upsert(results, {
          onConflict: "product_id,county_code,period_start,period_end,score_version",
        });

      if (upsertError) throw new Error(`Failed to upsert risk results: ${upsertError.message}`);

      const skippedCount = itemResults.filter((item) => item.status === "skipped").length;
      const status = skippedCount === itemResults.length ? "skipped" : skippedCount > 0 ? "partial_success" : "success";

      await finishJob(supabase, jobId, {
        status,
        total_count: itemResults.length,
        success_count: itemResults.length - skippedCount,
        skipped_count: skippedCount,
        failed_count: 0,
        error_summary: skippedCount > 0 ? "일부 품목은 데이터 부족으로 위험 점수를 계산하지 않았습니다." : null,
        error_detail: { itemResults },
      });

      return jsonResponse({
        jobId,
        scoreVersion,
        periodStart: dateRange.startDate,
        periodEnd: dateRange.endDate,
        countyCodes,
        productCount: products.length,
        resultCount: results.length,
        status,
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

async function readRequestBody(req: Request): Promise<RiskRequest> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as RiskRequest;
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
    .select("id, display_name")
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

async function loadRiskPriceRecords(
  supabase: ReturnType<typeof createServiceClient>,
  productId: string,
  countyCode: string,
  startDate: string,
  endDate: string,
): Promise<PriceRecord[]> {
  const historyStartDate = shiftMonths(endDate, -(RISK_HISTORY_MONTHS - 1));
  const { data, error } = await supabase
    .from("price_records")
    .select("product_id, price_date, price, market_name, data_status, is_mock")
    .eq("product_id", productId)
    .eq("county_code", countyCode)
    .gte("price_date", historyStartDate)
    .lte("price_date", endDate)
    .order("price_date", { ascending: true });

  if (error) throw new Error(`Failed to load price records: ${error.message}`);
  const records = (data ?? []) as PriceRecord[];
  return mergePriceRecords(records, startDate, endDate);
}

function mergePriceRecords(records: PriceRecord[], startDate: string, endDate: string): PriceRecord[] {
  const filtered = records.filter((record) => record.price_date >= startDate && record.price_date <= endDate || record.market_name === "monthly");
  const dailyPriority = (marketName: string | null) => {
    if (marketName === "today_price" || marketName === "recent_30d") return 2;
    if (marketName === "monthly") return 1;
    return 0;
  };

  const byDate = new Map<string, PriceRecord>();
  for (const record of filtered) {
    const current = byDate.get(record.price_date);
    if (!current || dailyPriority(record.market_name) > dailyPriority(current.market_name)) {
      byDate.set(record.price_date, record);
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.price_date.localeCompare(b.price_date));
}

function calculateRisk(
  product: Product,
  countyCode: string,
  records: PriceRecord[],
  startDate: string,
  endDate: string,
  scoreVersion: string,
  jobId: string,
): RiskResult {
  const validRecords = records
    .filter((record) => typeof record.price === "number" && Number.isFinite(record.price))
    .sort((a, b) => a.price_date.localeCompare(b.price_date));

  const missingCount = records.filter((record) => record.price === null || record.data_status === "missing" || record.data_status === "invalid").length;
  const missingRatio = records.length === 0 ? 1 : round(missingCount / records.length, 4);
  const latestRecord = validRecords.at(-1);
  const dataQuality = {
    validPriceCount: validRecords.length,
    totalRecordCount: records.length,
    missingCount,
    missingRatio,
    hasLatestPrice: Boolean(latestRecord),
    minValidPriceCount: MIN_VALID_PRICE_COUNT,
    maxMissingRatio: MAX_MISSING_RATIO,
  };

  if (validRecords.length < MIN_VALID_PRICE_COUNT || missingRatio > MAX_MISSING_RATIO || !latestRecord) {
    return {
      product_id: product.id,
      period_start: startDate,
      period_end: endDate,
      county_code: countyCode,
      risk_score: null,
      risk_grade: "insufficient_data",
      score_version: scoreVersion,
      evidence: {
        reason: "insufficient_data",
        productName: product.display_name,
        rules: {
          minValidPriceCount: MIN_VALID_PRICE_COUNT,
          maxMissingRatio: MAX_MISSING_RATIO,
        },
      },
      data_quality: dataQuality,
      source_price_count: validRecords.length,
      sync_job_id: jobId,
      is_latest: true,
    };
  }

  const firstPrice = validRecords[0].price!;
  const latestPrice = latestRecord.price!;
  const previousPrice = validRecords.length >= 2 ? validRecords.at(-2)!.price! : firstPrice;
  const prices = validRecords.map((record) => record.price!);
  const dailyReturns = toReturns(prices);

  const periodChangeRate = firstPrice === 0 ? 0 : (latestPrice - firstPrice) / firstPrice;
  const recentChangeRate = previousPrice === 0 ? 0 : (latestPrice - previousPrice) / previousPrice;
  const volatility = standardDeviation(dailyReturns);

  const componentScores = {
    periodChange: round(scoreByAbsRate(periodChangeRate, 0.4, WEIGHTS.periodChange), 2),
    recentChange: round(scoreByAbsRate(recentChangeRate, 0.15, WEIGHTS.recentChange), 2),
    volatility: round(scoreByAbsRate(volatility, 0.08, WEIGHTS.volatility), 2),
    dataQuality: round(Math.min(missingRatio / MAX_MISSING_RATIO, 1) * WEIGHTS.dataQuality, 2),
  };

  const riskScore = round(
    componentScores.periodChange +
      componentScores.recentChange +
      componentScores.volatility +
      componentScores.dataQuality,
    2,
  );

  return {
    product_id: product.id,
    period_start: startDate,
    period_end: endDate,
    county_code: countyCode,
    risk_score: riskScore,
    risk_grade: gradeFromScore(riskScore),
    score_version: scoreVersion,
    evidence: {
      productName: product.display_name,
      weights: WEIGHTS,
      componentScores,
      metrics: {
        firstPrice,
        previousPrice,
        latestPrice,
        periodChangeRate: round(periodChangeRate, 4),
        recentChangeRate: round(recentChangeRate, 4),
        volatility: round(volatility, 4),
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        averagePrice: round(average(prices), 2),
      },
      gradeRule: {
        high: "risk_score >= 70",
        watch: "40 <= risk_score < 70",
        stable: "risk_score < 40",
      },
    },
    data_quality: dataQuality,
    source_price_count: validRecords.length,
    sync_job_id: jobId,
    is_latest: true,
  };
}

function gradeFromScore(score: number): RiskGrade {
  if (score >= 70) return "high";
  if (score >= 40) return "watch";
  return "stable";
}

function scoreByAbsRate(rate: number, threshold: number, weight: number): number {
  return Math.min(Math.abs(rate) / threshold, 1) * weight;
}

function toReturns(values: number[]): number[] {
  const returns: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    returns.push(previous === 0 ? 0 : (current - previous) / previous);
  }
  return returns;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function normalizeDateRange(startDate?: string, endDate?: string) {
  const today = toDateString(new Date());
  const defaultStart = addDays(today, -30);
  const normalizedStart = startDate ?? defaultStart;
  const normalizedEnd = endDate ?? today;

  const validationError = validateDateRange(normalizedStart, normalizedEnd);
  if (validationError) throw new Error(validationError);

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
  };
}

function validateDateRange(startDate: string, endDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return "startDate and endDate must use YYYY-MM-DD";
  }
  if (startDate > endDate) return "startDate must be before or equal to endDate";
  return null;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.map((item) => String(item).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
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
    console.error("Failed to finish risk job", error.message);
  }
}

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

function shiftMonths(dateString: string, months: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return toDateString(date);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
