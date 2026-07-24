import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type GenerateDocumentsRequest = {
  riskResultIds?: string[];
  productIds?: string[];
  countyCodes?: string[];
  onlyLatest?: boolean;
  includeInsufficientData?: boolean;
};

type ProductInfo = {
  id: string;
  display_name: string;
  default_unit: string | null;
};

type RiskGrade = "high" | "watch" | "stable" | "insufficient_data";

type RiskResultRow = {
  id: string;
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
  is_latest: boolean;
  products?: ProductInfo | ProductInfo[] | null;
};

type ExistingDocument = {
  id: string;
  content_hash: string;
  version: number;
  vector_status: string;
};

const DOCUMENT_TYPE = "risk_summary";
const SOURCE_TABLE = "risk_results";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const supabase = createServiceClient();

    const { data: job, error: jobError } = await supabase
      .from("data_sync_jobs")
      .insert({
        job_type: "document_generation",
        status: "running",
        triggered_by: "manual",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (jobError) throw new Error(`Failed to create document generation job: ${jobError.message}`);
    const jobId = job.id as string;

    try {
      const riskResults = await loadRiskResults(supabase, body);
      await supabase
        .from("data_sync_jobs")
        .update({
          total_count: riskResults.length,
          target_product_ids: unique(riskResults.map((result) => result.product_id)),
          period_start: minDate(riskResults.map((result) => result.period_start)),
          period_end: maxDate(riskResults.map((result) => result.period_end)),
        })
        .eq("id", jobId);

      const itemResults: Array<Record<string, unknown>> = [];

      for (const riskResult of riskResults) {
        const generated = await generateDocumentForRiskResult(supabase, riskResult);
        itemResults.push(generated);
      }

      const successCount = itemResults.filter((item) => item.status === "created").length;
      const skippedCount = itemResults.filter((item) => item.status === "skipped").length;
      const failedCount = itemResults.filter((item) => item.status === "failed").length;
      const status = resolveJobStatus(successCount, skippedCount, failedCount, itemResults.length);

      await finishJob(supabase, jobId, {
        status,
        total_count: itemResults.length,
        success_count: successCount,
        skipped_count: skippedCount,
        failed_count: failedCount,
        error_summary: failedCount > 0 ? "Some analysis documents failed to generate." : null,
        error_detail: { itemResults },
      });

      return jsonResponse({
        jobId,
        status,
        totalCount: itemResults.length,
        successCount,
        skippedCount,
        failedCount,
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

async function readRequestBody(req: Request): Promise<GenerateDocumentsRequest> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as GenerateDocumentsRequest;
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

async function loadRiskResults(
  supabase: ReturnType<typeof createServiceClient>,
  request: GenerateDocumentsRequest,
): Promise<RiskResultRow[]> {
  let query = supabase
    .from("risk_results")
    .select(`
      id,
      product_id,
      period_start,
      period_end,
      county_code,
      risk_score,
      risk_grade,
      score_version,
      evidence,
      data_quality,
      source_price_count,
      is_latest,
      products (
        id,
        display_name,
        default_unit
      )
    `)
    .order("period_end", { ascending: false });

  if (request.riskResultIds && request.riskResultIds.length > 0) {
    query = query.in("id", request.riskResultIds);
  }

  if (request.productIds && request.productIds.length > 0) {
    query = query.in("product_id", request.productIds);
  }

  if (request.countyCodes && request.countyCodes.length > 0) {
    query = query.in("county_code", request.countyCodes);
  }

  if (request.onlyLatest ?? true) {
    query = query.eq("is_latest", true);
  }

  if (!(request.includeInsufficientData ?? true)) {
    query = query.neq("risk_grade", "insufficient_data");
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load risk results: ${error.message}`);
  return (data ?? []) as RiskResultRow[];
}

async function generateDocumentForRiskResult(
  supabase: ReturnType<typeof createServiceClient>,
  riskResult: RiskResultRow,
): Promise<Record<string, unknown>> {
  try {
    const product = normalizeProduct(riskResult.products);
    const document = buildRiskSummaryDocument(riskResult, product);
    const contentHash = await sha256Hash(JSON.stringify({
      title: document.title,
      content: document.content,
      metadata: document.metadata,
    }));
    const existing = await loadLatestDocument(supabase, riskResult.id);

    if (existing && existing.content_hash === contentHash) {
      return {
        status: "skipped",
        reason: "same_content_hash",
        riskResultId: riskResult.id,
        analysisDocumentId: existing.id,
        version: existing.version,
        vectorStatus: existing.vector_status,
      };
    }

    const version = existing ? existing.version + 1 : 1;
    const { data, error } = await supabase
      .from("analysis_documents")
      .insert({
        document_type: DOCUMENT_TYPE,
        source_table: SOURCE_TABLE,
        source_id: riskResult.id,
        product_id: riskResult.product_id,
        risk_result_id: riskResult.id,
        period_start: riskResult.period_start,
        period_end: riskResult.period_end,
        title: document.title,
        content: document.content,
        content_hash: contentHash,
        version,
        metadata: document.metadata,
        vector_status: "pending",
        is_mock: document.metadata.is_mock,
      })
      .select("id")
      .single();

    if (error) throw new Error(`Failed to insert analysis document: ${error.message}`);

    return {
      status: "created",
      riskResultId: riskResult.id,
      analysisDocumentId: data.id,
      version,
      contentHash,
    };
  } catch (error) {
    return {
      status: "failed",
      riskResultId: riskResult.id,
      error: toSafeErrorMessage(error),
    };
  }
}

async function loadLatestDocument(
  supabase: ReturnType<typeof createServiceClient>,
  riskResultId: string,
): Promise<ExistingDocument | null> {
  const { data, error } = await supabase
    .from("analysis_documents")
    .select("id, content_hash, version, vector_status")
    .eq("source_table", SOURCE_TABLE)
    .eq("source_id", riskResultId)
    .eq("document_type", DOCUMENT_TYPE)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load existing analysis document: ${error.message}`);
  return data as ExistingDocument | null;
}

function buildRiskSummaryDocument(riskResult: RiskResultRow, product: ProductInfo | null) {
  const productName = product?.display_name ?? String(riskResult.evidence.productName ?? "Unknown product");
  const title = `${productName} ${riskResult.county_code} risk summary (${riskResult.period_start} to ${riskResult.period_end})`;
  const metrics = asRecord(riskResult.evidence.metrics);
  const componentScores = asRecord(riskResult.evidence.componentScores);
  const weights = asRecord(riskResult.evidence.weights);
  const dataQuality = riskResult.data_quality;
  const limitations = buildLimitations(riskResult);

  const content = [
    `# ${title}`,
    "",
    "## Target",
    `- Product: ${productName}`,
    `- County code: ${riskResult.county_code}`,
    `- Period: ${riskResult.period_start} to ${riskResult.period_end}`,
    `- Score version: ${riskResult.score_version}`,
    "",
    "## Risk grade",
    `- Risk grade: ${riskResult.risk_grade}`,
    `- Risk score: ${formatNullableNumber(riskResult.risk_score)}`,
    `- Source price count: ${riskResult.source_price_count}`,
    "",
    "## Key price metrics",
    `- First price: ${formatPrice(metrics.firstPrice, product?.default_unit)}`,
    `- Previous price: ${formatPrice(metrics.previousPrice, product?.default_unit)}`,
    `- Latest price: ${formatPrice(metrics.latestPrice, product?.default_unit)}`,
    `- Period change rate: ${formatPercent(metrics.periodChangeRate)}`,
    `- Recent change rate: ${formatPercent(metrics.recentChangeRate)}`,
    `- Volatility: ${formatPercent(metrics.volatility)}`,
    `- Minimum price: ${formatPrice(metrics.minPrice, product?.default_unit)}`,
    `- Maximum price: ${formatPrice(metrics.maxPrice, product?.default_unit)}`,
    `- Average price: ${formatPrice(metrics.averagePrice, product?.default_unit)}`,
    "",
    "## Risk evidence",
    `- Period change score: ${formatComponent(componentScores.periodChange, weights.periodChange)}`,
    `- Recent change score: ${formatComponent(componentScores.recentChange, weights.recentChange)}`,
    `- Volatility score: ${formatComponent(componentScores.volatility, weights.volatility)}`,
    `- Data quality score: ${formatComponent(componentScores.dataQuality, weights.dataQuality)}`,
    "",
    "## Data quality",
    `- Valid price count: ${formatNullableNumber(dataQuality.validPriceCount)}`,
    `- Total record count: ${formatNullableNumber(dataQuality.totalRecordCount)}`,
    `- Missing count: ${formatNullableNumber(dataQuality.missingCount)}`,
    `- Missing ratio: ${formatPercent(dataQuality.missingRatio)}`,
    `- Has latest price: ${dataQuality.hasLatestPrice === true ? "yes" : "no"}`,
    "",
    "## Data limitations",
    ...limitations.map((item) => `- ${item}`),
    "",
    "This document is search evidence based on historical collected prices and rule-based risk scoring. It is not a future price forecast or trading instruction.",
  ].join("\n");

  return {
    title,
    content,
    metadata: {
      source_table: SOURCE_TABLE,
      source_id: riskResult.id,
      risk_result_id: riskResult.id,
      document_type: DOCUMENT_TYPE,
      product_id: riskResult.product_id,
      product_name: productName,
      county_code: riskResult.county_code,
      period_start: riskResult.period_start,
      period_end: riskResult.period_end,
      risk_grade: riskResult.risk_grade,
      risk_score: riskResult.risk_score,
      score_version: riskResult.score_version,
      source_price_count: riskResult.source_price_count,
      is_latest: riskResult.is_latest,
      is_mock: false,
      limitations,
    },
  };
}

function normalizeProduct(value: ProductInfo | ProductInfo[] | null | undefined): ProductInfo | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function buildLimitations(riskResult: RiskResultRow): string[] {
  const dataQuality = riskResult.data_quality;
  const limitations: string[] = [];

  if (riskResult.risk_grade === "insufficient_data") {
    limitations.push("The risk score could not be calculated because valid price data is insufficient.");
  }

  if (Number(dataQuality.validPriceCount ?? 0) < Number(dataQuality.minValidPriceCount ?? 5)) {
    limitations.push("The valid price count is below the minimum threshold.");
  }

  if (Number(dataQuality.missingRatio ?? 0) > Number(dataQuality.maxMissingRatio ?? 0.5)) {
    limitations.push("The missing data ratio is above the allowed threshold.");
  }

  if (dataQuality.hasLatestPrice === false) {
    limitations.push("The latest price for the analysis end date is unavailable.");
  }

  if (limitations.length === 0) {
    limitations.push("The analysis uses KAMIS price data and does not directly include weather, logistics, inventory, or policy variables.");
  }

  limitations.push("The service provides historical risk signals only and does not provide future price prediction.");
  return limitations;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatPrice(value: unknown, unit?: string | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "no data";
  const formatted = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${formatted} KRW/${unit}` : `${formatted} KRW`;
}

function formatPercent(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "no data";
  return `${round(value * 100, 2)}%`;
}

function formatComponent(value: unknown, weight: unknown): string {
  const score = formatNullableNumber(value);
  if (typeof weight !== "number" || !Number.isFinite(weight)) return score;
  return `${score} / ${weight}`;
}

function formatNullableNumber(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "no data";
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

async function sha256Hash(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function resolveJobStatus(successCount: number, skippedCount: number, failedCount: number, totalCount: number): string {
  if (totalCount === 0) return "skipped";
  if (failedCount === totalCount) return "failed";
  if (failedCount > 0) return "partial_success";
  if (successCount === 0 && skippedCount > 0) return "skipped";
  return "success";
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
    console.error("Failed to finish document generation job", error.message);
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function minDate(values: string[]): string | null {
  return values.length > 0 ? values.reduce((min, value) => value < min ? value : min) : null;
}

function maxDate(values: string[]): string | null {
  return values.length > 0 ? values.reduce((max, value) => value > max ? value : max) : null;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
