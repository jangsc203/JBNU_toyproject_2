import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type SyncVectorsRequest = {
  analysisDocumentIds?: string[];
  productIds?: string[];
  documentTypes?: string[];
  namespace?: string;
  onlyPending?: boolean;
  force?: boolean;
  limit?: number;
};

type ProductInfo = {
  id: string;
  display_name: string;
  default_unit: string | null;
};

type AnalysisDocumentRow = {
  id: string;
  document_type: string;
  source_table: string;
  source_id: string;
  product_id: string | null;
  risk_result_id: string | null;
  report_id: string | null;
  period_start: string | null;
  period_end: string | null;
  title: string;
  content: string;
  content_hash: string;
  version: number;
  metadata: Record<string, unknown>;
  vector_status: string;
  is_mock: boolean;
  products?: ProductInfo | ProductInfo[] | null;
};

type VectorJobRow = {
  id: string;
  status: string;
  content_hash: string;
  pinecone_vector_id: string | null;
  pinecone_index_name: string;
  pinecone_namespace: string;
};

const DEFAULT_NAMESPACE = "jeonnam-agri-analysis";
const DEFAULT_INDEX_NAME = "toy-project-2";
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-2";
const DEFAULT_EMBEDDING_DIMENSION = 1024;

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
    const config = resolveConfig(body);
    const documents = await loadDocuments(supabase, body, config.namespace);

    if (documents.length === 0) {
      return jsonResponse({
        status: "skipped",
        totalCount: 0,
        successCount: 0,
        skippedCount: 0,
        failedCount: 0,
        namespace: config.namespace,
      });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const document of documents) {
      const result = await syncDocument(supabase, document, config);
      results.push(result);
    }

    const successCount = results.filter((item) => item.status === "success").length;
    const skippedCount = results.filter((item) => item.status === "skipped").length;
    const failedCount = results.filter((item) => item.status === "failed").length;

    return jsonResponse({
      status: resolveStatus(successCount, skippedCount, failedCount, results.length),
      namespace: config.namespace,
      totalCount: results.length,
      successCount,
      skippedCount,
      failedCount,
      results,
    });
  } catch (error) {
    return jsonResponse({ error: toSafeErrorMessage(error) }, 500);
  }
});

async function readRequestBody(req: Request): Promise<SyncVectorsRequest> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as SyncVectorsRequest;
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

function resolveConfig(body: SyncVectorsRequest) {
  return {
    indexName: Deno.env.get("PINECONE_INDEX_NAME")?.trim() || DEFAULT_INDEX_NAME,
    namespace: body.namespace?.trim() || Deno.env.get("PINECONE_NAMESPACE")?.trim() || DEFAULT_NAMESPACE,
    embeddingModel: Deno.env.get("GEMINI_EMBEDDING_MODEL")?.trim() || DEFAULT_EMBEDDING_MODEL,
    embeddingDimension: resolveDimension(Deno.env.get("PINECONE_DIMENSION")),
    limit: normalizeLimit(body.limit),
    onlyPending: body.onlyPending ?? true,
    force: body.force ?? false,
  };
}

function resolveDimension(value: string | undefined | null): number {
  if (!value) return DEFAULT_EMBEDDING_DIMENSION;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : DEFAULT_EMBEDDING_DIMENSION;
}

function normalizeLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 100;
  return Math.min(Math.max(Math.trunc(value ?? 100), 1), 500);
}

async function loadDocuments(
  supabase: ReturnType<typeof createServiceClient>,
  body: SyncVectorsRequest,
): Promise<AnalysisDocumentRow[]> {
  let query = supabase
    .from("analysis_documents")
    .select(`
      id,
      document_type,
      source_table,
      source_id,
      product_id,
      risk_result_id,
      report_id,
      period_start,
      period_end,
      title,
      content,
      content_hash,
      version,
      metadata,
      vector_status,
      is_mock,
      products (
        id,
        display_name,
        default_unit
      )
    `)
    .order("updated_at", { ascending: true });

  if (body.analysisDocumentIds && body.analysisDocumentIds.length > 0) {
    query = query.in("id", body.analysisDocumentIds);
  }

  if (body.productIds && body.productIds.length > 0) {
    query = query.in("product_id", body.productIds);
  }

  if (body.documentTypes && body.documentTypes.length > 0) {
    query = query.in("document_type", body.documentTypes);
  }

  if ((body.onlyPending ?? true) && !body.force) {
    query = query.in("vector_status", ["pending", "failed"]);
  }

  const { data, error } = await query.limit(normalizeLimit(body.limit));
  if (error) throw new Error(`Failed to load analysis documents: ${error.message}`);

  const documents = (data ?? []) as AnalysisDocumentRow[];
  return documents;
}

async function syncDocument(
  supabase: ReturnType<typeof createServiceClient>,
  document: AnalysisDocumentRow,
  config: ReturnType<typeof resolveConfig>,
): Promise<Record<string, unknown>> {
  const vectorId = buildVectorId(document.id, document.version);
  const existingJob = await loadExistingVectorJob(supabase, document.id, document.content_hash, config.indexName, config.namespace);

  if (!config.force && existingJob?.status === "success" && existingJob.pinecone_vector_id === vectorId) {
    return {
      status: "skipped",
      analysisDocumentId: document.id,
      reason: "already_synced",
      vectorId,
    };
  }

  const jobId = await upsertVectorJob(supabase, {
    analysis_document_id: document.id,
    status: "running",
    pinecone_index_name: config.indexName,
    pinecone_namespace: config.namespace,
    pinecone_vector_id: vectorId,
    embedding_model: config.embeddingModel,
    embedding_dimension: config.embeddingDimension,
    content_hash: document.content_hash,
    started_at: new Date().toISOString(),
    error_summary: null,
    error_detail: {},
  });

  try {
    const embedding = await embedDocument(document, config.embeddingModel, config.embeddingDimension);
    if (embedding.length !== config.embeddingDimension) {
      throw new Error(`Embedding dimension mismatch: expected ${config.embeddingDimension}, got ${embedding.length}`);
    }

    await upsertPineconeVector(document, vectorId, embedding, config);
    await updateVectorJob(supabase, jobId, {
      status: "success",
      finished_at: new Date().toISOString(),
    });
    await updateAnalysisDocumentStatus(supabase, document.id, "synced");

    return {
      status: "success",
      analysisDocumentId: document.id,
      vectorId,
      embeddingDimension: embedding.length,
    };
  } catch (error) {
    await updateVectorJob(supabase, jobId, {
      status: "failed",
      error_summary: toSafeErrorMessage(error),
      error_detail: { message: toSafeErrorMessage(error) },
      finished_at: new Date().toISOString(),
    });
    await updateAnalysisDocumentStatus(supabase, document.id, "failed");

    return {
      status: "failed",
      analysisDocumentId: document.id,
      vectorId,
      error: toSafeErrorMessage(error),
    };
  }
}

async function loadExistingVectorJob(
  supabase: ReturnType<typeof createServiceClient>,
  analysisDocumentId: string,
  contentHash: string,
  indexName: string,
  namespace: string,
): Promise<VectorJobRow | null> {
  const { data, error } = await supabase
    .from("vector_sync_jobs")
    .select("id, status, content_hash, pinecone_vector_id, pinecone_index_name, pinecone_namespace")
    .eq("analysis_document_id", analysisDocumentId)
    .eq("content_hash", contentHash)
    .eq("pinecone_index_name", indexName)
    .eq("pinecone_namespace", namespace)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load vector sync job: ${error.message}`);
  return data as VectorJobRow | null;
}

async function upsertVectorJob(
  supabase: ReturnType<typeof createServiceClient>,
  row: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase
    .from("vector_sync_jobs")
    .upsert(row, {
      onConflict: "analysis_document_id,content_hash,pinecone_index_name,pinecone_namespace",
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create vector sync job: ${error.message}`);
  return data.id as string;
}

async function updateVectorJob(
  supabase: ReturnType<typeof createServiceClient>,
  jobId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("vector_sync_jobs")
    .update(patch)
    .eq("id", jobId);

  if (error) throw new Error(`Failed to update vector sync job: ${error.message}`);
}

async function updateAnalysisDocumentStatus(
  supabase: ReturnType<typeof createServiceClient>,
  documentId: string,
  status: string,
) {
  const { error } = await supabase
    .from("analysis_documents")
    .update({ vector_status: status })
    .eq("id", documentId);

  if (error) throw new Error(`Failed to update analysis document status: ${error.message}`);
}

async function embedDocument(
  document: AnalysisDocumentRow,
  model: string,
  dimension: number,
): Promise<number[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(apiKey)}`;
  const text = [document.title, document.content].join("\n\n");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] },
      outputDimensionality: dimension,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini embedding failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as { embedding?: { values?: number[] } };
  const values = payload.embedding?.values ?? [];

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Gemini embedding response did not include vector values");
  }

  return values;
}

async function upsertPineconeVector(
  document: AnalysisDocumentRow,
  vectorId: string,
  values: number[],
  config: ReturnType<typeof resolveConfig>,
) {
  const host = normalizePineconeHost(Deno.env.get("PINECONE_HOST"));
  const apiKey = Deno.env.get("PINECONE_API_KEY");

  if (!host || !apiKey) {
    throw new Error("Missing PINECONE_HOST or PINECONE_API_KEY");
  }

  const response = await fetch(`https://${host}/vectors/upsert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Api-Key": apiKey,
      "X-Pinecone-Api-Key": apiKey,
    },
    body: JSON.stringify({
      namespace: config.namespace,
      vectors: [
        {
          id: vectorId,
          values,
          metadata: buildPineconeMetadata(document),
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinecone upsert failed: ${response.status} ${errorText}`);
  }
}

function buildVectorId(documentId: string, version: number): string {
  return `analysis_document:${documentId}:v${version}`;
}

function buildPineconeMetadata(document: AnalysisDocumentRow): Record<string, unknown> {
  const product = normalizeProduct(document.products);
  const metadata = document.metadata ?? {};

  return {
    source_table: document.source_table,
    analysis_document_id: document.id,
    source_id: document.source_id,
    document_type: document.document_type,
    risk_result_id: document.risk_result_id,
    report_id: document.report_id,
    product_id: document.product_id,
    product_name: product?.display_name ?? metadata.product_name ?? null,
    county_code: metadata.county_code ?? null,
    period_start: document.period_start,
    period_end: document.period_end,
    risk_grade: metadata.risk_grade ?? null,
    risk_score: metadata.risk_score ?? null,
    score_version: metadata.score_version ?? null,
    content_hash: document.content_hash,
    version: document.version,
    is_mock: document.is_mock,
  };
}

function normalizeProduct(value: ProductInfo | ProductInfo[] | null | undefined): ProductInfo | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizePineconeHost(value: string | undefined | null): string | null {
  if (!value) return null;
  return value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function resolveStatus(successCount: number, skippedCount: number, failedCount: number, totalCount: number): string {
  if (totalCount === 0) return "skipped";
  if (failedCount === totalCount) return "failed";
  if (failedCount > 0) return "partial_success";
  if (successCount === 0 && skippedCount > 0) return "skipped";
  return "success";
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
