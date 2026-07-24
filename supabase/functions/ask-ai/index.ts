import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type AskAiRequest = {
  question: string;
  conversationId?: string;
  productIds?: string[];
  countyCodes?: string[];
  startDate?: string;
  endDate?: string;
  topK?: number;
  routeHint?: "numeric" | "semantic" | "hybrid" | "auto";
};

type ProductInfo = {
  id: string;
  display_name: string;
  default_unit: string | null;
};

type PriceRecordRow = {
  product_id: string;
  price_date: string;
  price: number | null;
  county_code: string;
  county_name: string | null;
  unit: string | null;
  data_status: string;
  is_mock: boolean;
};

type RiskResultRow = {
  id: string;
  product_id: string;
  county_code: string;
  period_start: string;
  period_end: string;
  risk_score: number | null;
  risk_grade: string;
  score_version: string;
  source_price_count: number;
  evidence: Record<string, unknown>;
  data_quality: Record<string, unknown>;
  products?: ProductInfo | ProductInfo[] | null;
};

type SearchMatch = {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
};

type AuthUser = {
  id: string;
  email?: string | null;
};

const DEFAULT_COUNTY_CODES = ["3511", "3613", "2401"];
const DEFAULT_TOP_K = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    if (!body.question || !body.question.trim()) {
      return jsonResponse({ error: "question is required" }, 400);
    }

    const supabase = createServiceClient();
    const authUser = await resolveAuthUser(supabase, extractBearerToken(req.headers.get("Authorization")));
    if (!authUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (!isMeaningfulQuestion(body.question)) {
      const filter = resolveFilter(body);
      return jsonResponse({
        route: "ambiguous",
        intent: {
          routeHint: "auto",
          numericScore: 0,
          semanticScore: 0,
          reasons: ["unreadable_or_too_short_question"],
        },
        filter: {
          ...filter,
          countyCodes: filter.countyCodes.length > 0 ? filter.countyCodes : DEFAULT_COUNTY_CODES,
        },
        clarificationNeeded: true,
        nextStep: "generate_answer",
        numericEvidence: { priceSummaries: [], riskSummaries: [] },
        semanticEvidence: { matches: [], documents: [] },
      });
    }

    const filter = resolveFilter(body);
    const intent = classifyQuestion(body.question, body.routeHint);
    const resolvedRoute = resolveRoute(intent, body.routeHint);
    const products = await loadProducts(supabase, filter.productIds);
    const inferredProductIds = inferProductIds(body.question, products);
    const inferredCountyCodes = inferCountyCodes(body.question);
    const resolvedFilter = {
      ...filter,
      productIds: filter.productIds.length > 0 ? filter.productIds : inferredProductIds.length > 0 ? inferredProductIds : products.map((item) => item.id),
      countyCodes: filter.countyCodes.length > 0 ? filter.countyCodes : inferredCountyCodes.length > 0 ? inferredCountyCodes : DEFAULT_COUNTY_CODES,
    };

    const numericEvidence = resolvedRoute !== "semantic"
      ? await loadNumericEvidence(supabase, products, resolvedFilter)
      : { priceSummaries: [], riskSummaries: [] };

    const semanticEvidence = resolvedRoute !== "numeric"
      ? await loadSemanticEvidence(supabase, body.question, resolvedFilter, body.topK)
      : { matches: [], documents: [] };

    return jsonResponse({
      route: resolvedRoute,
      intent,
      filter: resolvedFilter,
      clarificationNeeded: resolvedRoute === "ambiguous",
      nextStep: "generate_answer",
      numericEvidence,
      semanticEvidence,
    });
  } catch (error) {
    return jsonResponse({ error: toSafeErrorMessage(error) }, 500);
  }
});

async function readRequestBody(req: Request): Promise<AskAiRequest> {
  const text = await req.text();
  if (!text.trim()) return { question: "" };
  return JSON.parse(text) as AskAiRequest;
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

async function resolveAuthUser(
  supabase: ReturnType<typeof createServiceClient>,
  authToken: string | null,
): Promise<AuthUser | null> {
  if (!authToken) return null;

  const { data, error } = await supabase.auth.getUser(authToken);
  if (error) return null;
  const user = data.user;
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
  };
}

function extractBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function resolveFilter(body: AskAiRequest) {
  return {
    productIds: normalizeArray(body.productIds),
    countyCodes: normalizeArray(body.countyCodes),
    startDate: normalizeDate(body.startDate),
    endDate: normalizeDate(body.endDate),
    topK: normalizeTopK(body.topK),
  };
}

function classifyQuestion(question: string, routeHint?: AskAiRequest["routeHint"]) {
  if (routeHint && routeHint !== "auto") {
    return {
      routeHint,
      numericScore: routeHint === "numeric" ? 1 : routeHint === "hybrid" ? 1 : 0,
      semanticScore: routeHint === "semantic" ? 1 : routeHint === "hybrid" ? 1 : 0,
      reasons: [`routeHint=${routeHint}`],
    };
  }

  const text = question.toLowerCase();
  const numericKeywords = [
    "가격",
    "시세",
    "평균",
    "최고",
    "최저",
    "현재",
    "얼마",
    "증감",
    "변동",
    "price",
    "average",
    "highest",
    "lowest",
    "current",
    "trend",
    "market",
    "quote",
    "rate",
    "volatility",
    "change",
    "flow",
    "시황",
    "시세",
    "가격",
    "변동",
    "흐름",
    "추이",
    "수치",
    "통계",
    "평균",
  ];
  const semanticKeywords = [
    "이유",
    "원인",
    "해석",
    "설명",
    "비슷",
    "유사",
    "사례",
    "영향",
    "why",
    "reason",
    "explain",
    "similar",
    "case",
    "impact",
    "supply",
    "demand",
    "market watch",
    "cause",
    "factor",
    "outlook",
    "왜",
    "원인",
    "이유",
    "수급",
    "영향",
    "전망",
    "관찰",
    "대응",
    "설명",
  ];

  const numericScore = numericKeywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
  const semanticScore = semanticKeywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
  const inferredTopics = buildInferredTopics(text);

  return {
    routeHint: "auto",
    numericScore,
    semanticScore,
    reasons: inferredTopics,
  };
}

function resolveRoute(
  intent: { numericScore: number; semanticScore: number },
  routeHint?: AskAiRequest["routeHint"],
): "numeric" | "semantic" | "hybrid" | "ambiguous" {
  if (routeHint === "numeric" || routeHint === "semantic" || routeHint === "hybrid") {
    return routeHint;
  }

  if (intent.numericScore === 0 && intent.semanticScore === 0) {
    return "ambiguous";
  }

  if (intent.numericScore > 0 && intent.semanticScore > 0) {
    return "hybrid";
  }

  if (intent.numericScore > 1 && intent.semanticScore === 0) {
    return "numeric";
  }

  if (intent.semanticScore > 1 && intent.numericScore === 0) {
    return "semantic";
  }

  return "hybrid";
}

function isMeaningfulQuestion(question: string): boolean {
  const normalized = question.trim().replace(/\s+/g, " ");
  if (normalized.length < 2) return false;

  const letters = normalized.match(/[\p{L}]/gu) ?? [];
  if (letters.length < 2) return false;

  return /[\p{Script=Hangul}a-zA-Z]{2,}/u.test(normalized);
}

async function loadProducts(
  supabase: ReturnType<typeof createServiceClient>,
  productIds: string[],
): Promise<ProductInfo[]> {
  let query = supabase
    .from("products")
    .select("id, display_name, default_unit")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (productIds.length > 0) {
    query = query.in("id", productIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load products: ${error.message}`);
  return (data ?? []) as ProductInfo[];
}

async function loadNumericEvidence(
  supabase: ReturnType<typeof createServiceClient>,
  products: ProductInfo[],
  filter: ReturnType<typeof resolveFilter>,
) {
  const productIds = filter.productIds.length > 0 ? filter.productIds : products.map((item) => item.id);
  const countyCodes = filter.countyCodes.length > 0 ? filter.countyCodes : DEFAULT_COUNTY_CODES;
  const { startDate, endDate } = resolveDateWindow(filter.startDate, filter.endDate);

  const [priceRecords, riskResults] = await Promise.all([
    loadPriceRecords(supabase, productIds, countyCodes, startDate, endDate),
    loadRiskResults(supabase, productIds, countyCodes),
  ]);

  return {
    priceSummaries: summarizePriceRecords(priceRecords, products),
    riskSummaries: summarizeRiskResults(riskResults, products),
    resolvedWindow: { startDate, endDate },
  };
}

async function loadPriceRecords(
  supabase: ReturnType<typeof createServiceClient>,
  productIds: string[],
  countyCodes: string[],
  startDate: string,
  endDate: string,
): Promise<PriceRecordRow[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await supabase
    .from("price_records")
    .select("product_id, price_date, price, county_code, county_name, unit, data_status, is_mock")
    .in("product_id", productIds)
    .in("county_code", countyCodes)
    .gte("price_date", startDate)
    .lte("price_date", endDate)
    .order("price_date", { ascending: true });

  if (error) throw new Error(`Failed to load price records: ${error.message}`);
  return (data ?? []) as PriceRecordRow[];
}

async function loadRiskResults(
  supabase: ReturnType<typeof createServiceClient>,
  productIds: string[],
  countyCodes: string[],
): Promise<RiskResultRow[]> {
  if (productIds.length === 0) return [];

  const { data, error } = await supabase
    .from("risk_results")
    .select(`
      id,
      product_id,
      county_code,
      period_start,
      period_end,
      risk_score,
      risk_grade,
      score_version,
      source_price_count,
      evidence,
      data_quality,
      products (
        id,
        display_name,
        default_unit
      )
    `)
    .eq("is_latest", true)
    .in("product_id", productIds)
    .in("county_code", countyCodes);

  if (error) throw new Error(`Failed to load risk results: ${error.message}`);
  return (data ?? []) as RiskResultRow[];
}

function summarizePriceRecords(records: PriceRecordRow[], products: ProductInfo[]) {
  const groups = new Map<string, PriceRecordRow[]>();
  for (const record of records) {
    const key = `${record.product_id}::${record.county_code}`;
    const existing = groups.get(key) ?? [];
    existing.push(record);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).map(([key, items]) => {
    const [productId, countyCode] = key.split("::");
    const product = products.find((item) => item.id === productId);
    const validPrices = items
      .filter((item) => typeof item.price === "number" && Number.isFinite(item.price))
      .sort((a, b) => a.price_date.localeCompare(b.price_date));
    const latest = validPrices.at(-1) ?? null;
    const previous = validPrices.length >= 2 ? validPrices.at(-2) ?? null : null;
    const prices = validPrices.map((item) => item.price as number);

    return {
      productId,
      countyCode,
      productName: product?.display_name ?? null,
      unit: product?.default_unit ?? latest?.unit ?? null,
      recordCount: items.length,
      validCount: validPrices.length,
      latestPrice: latest?.price ?? null,
      latestDate: latest?.price_date ?? null,
      previousPrice: previous?.price ?? null,
      averagePrice: prices.length > 0 ? round(average(prices), 2) : null,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
      periodChangeRate: prices.length >= 2 && prices[0] ? round((prices[prices.length - 1] - prices[0]) / prices[0], 4) : null,
      recentChangeRate: latest && previous && previous.price ? round((latest.price! - previous.price!) / previous.price!, 4) : null,
      countyName: latest?.county_name ?? null,
    };
  });
}

function summarizeRiskResults(riskResults: RiskResultRow[], products: ProductInfo[]) {
  return riskResults.map((risk) => {
    const product = normalizeProduct(risk.products) ?? products.find((item) => item.id === risk.product_id) ?? null;
    return {
      riskResultId: risk.id,
      productId: risk.product_id,
      productName: product?.display_name ?? null,
      countyCode: risk.county_code,
      periodStart: risk.period_start,
      periodEnd: risk.period_end,
      riskScore: risk.risk_score,
      riskGrade: risk.risk_grade,
      sourcePriceCount: risk.source_price_count,
      evidence: risk.evidence,
      dataQuality: risk.data_quality,
    };
  });
}

async function loadSemanticEvidence(
  supabase: ReturnType<typeof createServiceClient>,
  question: string,
  filter: ReturnType<typeof resolveFilter>,
  topK?: number,
) {
  const queryVector = await embedQuestion(question);
  const matches = await queryPinecone(queryVector, filter, topK);
  const documents = await loadDocumentsByIds(supabase, matches.map((match) => match.id));

  return {
    matches,
    documents,
  };
}

async function embedQuestion(question: string): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  const model = Deno.env.get("GEMINI_EMBEDDING_MODEL")?.trim() || "gemini-embedding-2";

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: question }] },
      outputDimensionality: 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini question embedding failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as { embedding?: { values?: number[] } };
  const values = payload.embedding?.values ?? [];

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini question embedding did not return vector values");
  }

  return values;
}

async function queryPinecone(
  vector: number[],
  filter: ReturnType<typeof resolveFilter>,
  topK?: number,
): Promise<SearchMatch[]> {
  const host = normalizePineconeHost(Deno.env.get("PINECONE_HOST"));
  const apiKey = Deno.env.get("PINECONE_API_KEY");
  const namespace = Deno.env.get("PINECONE_NAMESPACE")?.trim() || "jeonnam-agri-analysis";

  if (!host || !apiKey) {
    throw new Error("Missing PINECONE_HOST or PINECONE_API_KEY");
  }

  const response = await fetch(`https://${host}/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
      "X-Pinecone-Api-Key": apiKey,
    },
    body: JSON.stringify({
      namespace,
      topK: normalizeTopK(topK),
      vector,
      includeMetadata: true,
      filter: buildPineconeFilter(filter),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinecone query failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as { matches?: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> };
  return (payload.matches ?? []).map((match) => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata ?? {},
  }));
}

function buildPineconeFilter(filter: ReturnType<typeof resolveFilter>) {
  const pineconeFilter: Record<string, unknown> = {};
  if (filter.productIds.length > 0) pineconeFilter.product_id = { $in: filter.productIds };
  if (filter.countyCodes.length > 0) pineconeFilter.county_code = { $in: filter.countyCodes };
  if (filter.startDate) pineconeFilter.period_end = { $gte: filter.startDate };
  if (filter.endDate) pineconeFilter.period_start = { $lte: filter.endDate };
  return pineconeFilter;
}

async function loadDocumentsByIds(
  supabase: ReturnType<typeof createServiceClient>,
  documentIds: string[],
) {
  if (documentIds.length === 0) return [];

  const { data, error } = await supabase
    .from("analysis_documents")
    .select("id, title, content, content_hash, version, period_start, period_end, document_type, source_table, metadata, product_id, risk_result_id, is_mock")
    .in("id", documentIds);

  if (error) throw new Error(`Failed to load analysis documents: ${error.message}`);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const byId = new Map(rows.map((row) => [String(row.id), row]));

  return documentIds.map((id) => {
    const row = byId.get(id);
    if (!row) return { id, missing: true };
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      contentHash: row.content_hash,
      version: row.version,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      documentType: row.document_type,
      sourceTable: row.source_table,
      metadata: row.metadata,
      productId: row.product_id,
      riskResultId: row.risk_result_id,
      isMock: row.is_mock,
    };
  });
}

function buildInferredTopics(text: string): string[] {
  const topics: string[] = [];
  if (/(가격|시세|평균|최고|최저|변동|trend|price)/.test(text)) topics.push("numeric_price_question");
  if (/(이유|원인|해석|설명|비슷|유사|사례|why|reason|explain|similar)/.test(text)) topics.push("semantic_explanation_question");
  if (/(배추|무|양파|대파)/.test(text)) topics.push("product_hint_detected");
  if (/(전주|순천|광주|전남|전라도)/.test(text)) topics.push("county_hint_detected");
  return topics;
}

function inferProductIds(question: string, products: ProductInfo[]): string[] {
  const text = question.toLowerCase();
  return products
    .filter((product) => {
      const name = product.display_name.toLowerCase();
      return text.includes(name) || isProductKeywordMatched(text, name);
    })
    .map((product) => product.id);
}

function inferCountyCodes(question: string): string[] {
  const text = question.toLowerCase();
  const countyMap: Array<[string, string]> = [
    ["전주", "3511"],
    ["순천", "3613"],
    ["광주", "2401"],
  ];

  const matches = countyMap
    .filter(([name]) => text.includes(name))
    .map(([, code]) => code);

  return Array.from(new Set(matches));
}

function isProductKeywordMatched(text: string, productName: string): boolean {
  if (productName.includes("배추")) return text.includes("배추");
  if (productName.includes("무")) return text.includes("무");
  if (productName.includes("양파")) return text.includes("양파");
  if (productName.includes("대파")) return text.includes("대파");
  return false;
}

function resolveDateWindow(startDate?: string, endDate?: string) {
  const today = toDateString(new Date());
  const resolvedEnd = endDate ?? today;
  const resolvedStart = startDate ?? addDays(resolvedEnd, -30);
  validateDateRange(resolvedStart, resolvedEnd);
  return { startDate: resolvedStart, endDate: resolvedEnd };
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Dates must use YYYY-MM-DD");
  }
  return value;
}

function normalizeTopK(value?: number): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_TOP_K;
  return Math.min(Math.max(Math.trunc(value ?? DEFAULT_TOP_K), 1), 20);
}

function normalizeArray(values?: string[], fallback: string[] = []): string[] {
  if (!Array.isArray(values)) return fallback;
  return Array.from(new Set(values.map((value) => String(value).trim()).filter(Boolean)));
}

function normalizePineconeHost(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function validateDateRange(startDate: string, endDate: string) {
  if (startDate > endDate) {
    throw new Error("startDate must be before or equal to endDate");
  }
}

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeProduct(value: ProductInfo | ProductInfo[] | null | undefined): ProductInfo | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
