import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type SaveReportRequest = {
  title?: string;
  summary?: string;
  content?: string;
  productId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await readRequestBody(req);
    const title = body.title?.trim();
    const content = body.content?.trim();

    if (!title) return jsonResponse({ error: "title is required" }, 400);
    if (!content) return jsonResponse({ error: "content is required" }, 400);

    const supabase = createServiceClient();
    const user = await resolveAuthUser(supabase, extractBearerToken(req.headers.get("Authorization")));

    const { data, error } = await supabase
      .from("reports")
      .insert({
        product_id: body.productId || null,
        period_start: normalizeDate(body.periodStart),
        period_end: normalizeDate(body.periodEnd),
        title,
        summary: body.summary?.trim() || null,
        content,
        model_name: "frontend-report-generator",
        created_by: user?.id ?? null,
        visibility: "public",
      })
      .select("id, title, summary, period_start, period_end, created_at")
      .single();

    if (error) throw new Error(`Failed to save report: ${error.message}`);

    return jsonResponse({ report: data });
  } catch (error) {
    return jsonResponse({ error: toSafeErrorMessage(error) }, 500);
  }
});

async function readRequestBody(req: Request): Promise<SaveReportRequest> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as SaveReportRequest;
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

function extractBearerToken(header: string | null) {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

async function resolveAuthUser(
  supabase: ReturnType<typeof createServiceClient>,
  authToken: string | null,
) {
  if (!authToken) return null;

  const { data, error } = await supabase.auth.getUser(authToken);
  if (error) return null;
  return data.user;
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
