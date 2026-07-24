import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type GenerateRagAnswerRequest = {
  question: string;
  route: "numeric" | "semantic" | "hybrid" | "ambiguous";
  intent?: {
    numericScore: number;
    semanticScore: number;
    reasons?: string[];
  };
  filter?: {
    productIds?: string[];
    countyCodes?: string[];
    startDate?: string;
    endDate?: string;
    topK?: number;
  };
  numericEvidence?: {
    priceSummaries?: PriceSummary[];
    riskSummaries?: RiskSummary[];
    resolvedWindow?: {
      startDate?: string;
      endDate?: string;
    };
  };
  semanticEvidence?: {
    matches?: SearchMatch[];
    documents?: EvidenceDocument[];
  };
  conversationId?: string;
};

type PriceSummary = {
  productId: string;
  countyCode: string;
  productName: string | null;
  unit: string | null;
  recordCount: number;
  validCount: number;
  latestPrice: number | null;
  latestDate: string | null;
  previousPrice: number | null;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  periodChangeRate: number | null;
  recentChangeRate: number | null;
  countyName: string | null;
};

type RiskSummary = {
  riskResultId: string;
  productId: string;
  productName: string | null;
  countyCode: string;
  periodStart: string;
  periodEnd: string;
  riskScore: number | null;
  riskGrade: string;
  sourcePriceCount: number;
  evidence: Record<string, unknown>;
  dataQuality: Record<string, unknown>;
};

type SearchMatch = {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
};

type EvidenceDocument = {
  id: string;
  title?: string;
  content?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  productId?: string | null;
  riskResultId?: string | null;
  documentType?: string | null;
  sourceTable?: string | null;
  version?: number | null;
  contentHash?: string | null;
  isMock?: boolean | null;
  missing?: boolean;
};

type AuthUser = {
  id: string;
  email?: string | null;
};

const DEFAULT_MODEL = "gemini-3.5-flash";

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

    const authToken = extractBearerToken(req.headers.get("Authorization"));
    const supabase = createServiceClient();
    const authUser = await resolveAuthUser(supabase, authToken);
    if (!authUser) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const promptContext = buildPromptContext(body);
    const result = !isMeaningfulQuestion(body.question)
      ? buildClarificationResult(body.question, promptContext)
      : body.route === "ambiguous"
      ? buildClarificationResult(body.question, promptContext)
      : await generateAnswerFromGemini(body.question, promptContext);

    const saved = await persistConversationTurn(supabase, authUser, body, result.answer, result.status, promptContext);

    return jsonResponse({
      status: result.status,
      answer: result.answer,
      conversationId: saved?.conversationId ?? body.conversationId ?? null,
      userMessageId: saved?.userMessageId ?? null,
      assistantMessageId: saved?.assistantMessageId ?? null,
      evidenceDocumentIds: promptContext.evidenceDocumentIds,
      dataLimitations: promptContext.dataLimitations,
      persistenceStatus: "saved",
    });
  } catch (error) {
    return jsonResponse({ error: toSafeErrorMessage(error) }, 500);
  }
});

async function readRequestBody(req: Request): Promise<GenerateRagAnswerRequest> {
  const text = await req.text();
  if (!text.trim()) return { question: "", route: "ambiguous" };
  return JSON.parse(text) as GenerateRagAnswerRequest;
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

function buildPromptContext(body: GenerateRagAnswerRequest) {
  const numericEvidence = body.numericEvidence ?? { priceSummaries: [], riskSummaries: [] };
  const semanticEvidence = body.semanticEvidence ?? { matches: [], documents: [] };
  const documents = (semanticEvidence.documents ?? []).filter((doc) => !doc.missing) as EvidenceDocument[];
  const evidenceDocumentIds = documents.map((doc) => doc.id);
  const dataLimitations = collectDataLimitations(numericEvidence, documents, body.route);

  return {
    filter: body.filter ?? {},
    intent: body.intent ?? null,
    numericEvidence,
    semanticEvidence: {
      matches: semanticEvidence.matches ?? [],
      documents,
    },
    evidenceDocumentIds,
    dataLimitations,
  };
}

function collectDataLimitations(
  numericEvidence: GenerateRagAnswerRequest["numericEvidence"],
  documents: EvidenceDocument[],
  route: GenerateRagAnswerRequest["route"],
): string[] {
  const limitations = new Set<string>();

  if (route === "ambiguous") {
    limitations.add("The question intent is ambiguous and needs clarification.");
  }

  const riskSummaries = numericEvidence?.riskSummaries ?? [];
  for (const risk of riskSummaries) {
    if (risk.riskGrade === "insufficient_data") {
      limitations.add(`Insufficient data for ${risk.productName ?? risk.productId} in ${risk.countyCode}.`);
    }
    const validCount = Number((risk.dataQuality.validPriceCount as number | undefined) ?? 0);
    const minCount = Number((risk.dataQuality.minValidPriceCount as number | undefined) ?? 5);
    if (validCount < minCount) {
      limitations.add(`Valid price count is below threshold for ${risk.productName ?? risk.productId}.`);
    }
    const missingRatio = Number((risk.dataQuality.missingRatio as number | undefined) ?? 0);
    const maxMissing = Number((risk.dataQuality.maxMissingRatio as number | undefined) ?? 0.5);
    if (missingRatio > maxMissing) {
      limitations.add(`Missing ratio is above threshold for ${risk.productName ?? risk.productId}.`);
    }
  }

  if (route !== "numeric" && documents.length === 0) {
    limitations.add("No semantic evidence documents were returned.");
  }

  if (route !== "semantic" && (numericEvidence?.priceSummaries ?? []).length === 0 && (numericEvidence?.riskSummaries ?? []).length === 0) {
    limitations.add("No numeric evidence summaries were returned.");
  }

  limitations.add("The system uses historical data only and does not provide future price prediction.");

  return Array.from(limitations);
}

function buildClarificationResult(
  question: string,
  context: ReturnType<typeof buildPromptContext>,
): {
  status: "insufficient_evidence";
  answer: string;
  context: ReturnType<typeof buildPromptContext>;
} {
  const answer = [
    "질문 내용을 이해하기 어려워 바로 분석하기 어렵습니다.",
    `입력한 내용: ${question.trim()}`,
    "품목, 지역, 기간, 궁금한 내용을 포함해서 다시 질문해 주세요.",
    "예: 배추 최근 30일 가격 추세 알려줘",
  ].join("\n");

  return {
    status: "insufficient_evidence" as const,
    answer,
    context,
  };
}

function isMeaningfulQuestion(question: string): boolean {
  const normalized = question.trim().replace(/\s+/g, " ");
  if (normalized.length < 2) return false;

  const letters = normalized.match(/[\p{L}]/gu) ?? [];
  if (letters.length < 2) return false;

  return /[\p{Script=Hangul}a-zA-Z]{2,}/u.test(normalized);
}

async function generateAnswerFromGemini(
  question: string,
  context: ReturnType<typeof buildPromptContext>,
): Promise<{
  status: "success";
  answer: string;
  context: ReturnType<typeof buildPromptContext>;
}> {
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_MODEL;
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const prompt = buildPrompt(question, context);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini answer generation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const answer = extractText(payload);
  if (!answer) {
    throw new Error("Gemini answer response did not include text");
  }

  return {
    status: "success" as const,
    answer,
    context,
  };
}

function buildPrompt(question: string, context: ReturnType<typeof buildPromptContext>): string {
  const numericEvidence = stringifyEvidence(context.numericEvidence, 9000);
  const semanticEvidence = stringifyEvidence(context.semanticEvidence, 7000);

  return [
    "You are an agricultural price and supply-risk assistant for Jeolla agricultural and fishery products.",
    "Answer in Korean.",
    "Use only the evidence provided below.",
    "Do not invent numbers or make future price predictions.",
    "If the evidence is weak, say that clearly and ask for the missing details.",
    "Write a complete answer. Do not stop mid-sentence.",
    "Structure the answer with these sections:",
    "1. 핵심 답변",
    "2. 사용 기간",
    "3. 주요 근거",
    "4. 데이터 한계",
    "5. 다음 확인",
    "",
    `Question: ${question.trim()}`,
    "",
    "Filter:",
    JSON.stringify(context.filter, null, 2),
    "",
    "Intent:",
    JSON.stringify(context.intent, null, 2),
    "",
    "Data limitations:",
    JSON.stringify(context.dataLimitations, null, 2),
    "",
    "Numeric evidence:",
    numericEvidence,
    "",
    "Semantic evidence:",
    semanticEvidence,
  ].join("\n");
}
function stringifyEvidence(value: unknown, maxLength: number): string {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function extractText(payload: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}): string {
  const candidate = payload.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("").trim();
}

async function persistConversationTurn(
  supabase: ReturnType<typeof createServiceClient>,
  user: AuthUser,
  body: GenerateRagAnswerRequest,
  answer: string,
  status: "success" | "insufficient_evidence",
  context: ReturnType<typeof buildPromptContext>,
) {
  const conversationId = await resolveConversationId(supabase, user.id, body.conversationId, body.question);
  const title = buildConversationTitle(body.question);

  await supabase
    .from("conversations")
    .update({
      title,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  const userMessage = await insertMessage(supabase, {
    conversation_id: conversationId,
    user_id: user.id,
    role: "user",
    content: body.question.trim(),
    model_name: null,
    period_start: body.filter?.startDate ?? body.numericEvidence?.resolvedWindow?.startDate ?? null,
    period_end: body.filter?.endDate ?? body.numericEvidence?.resolvedWindow?.endDate ?? null,
    evidence_document_ids: [] as string[],
    data_limitations: {},
    status: "success",
    error_summary: null,
  });

  const assistantMessage = await insertMessage(supabase, {
    conversation_id: conversationId,
    user_id: user.id,
    role: "assistant",
    content: answer,
    model_name: Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_MODEL,
    period_start: body.filter?.startDate ?? body.numericEvidence?.resolvedWindow?.startDate ?? null,
    period_end: body.filter?.endDate ?? body.numericEvidence?.resolvedWindow?.endDate ?? null,
    evidence_document_ids: context.evidenceDocumentIds,
    data_limitations: context.dataLimitations,
    status,
    error_summary: null,
  });

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  return {
    conversationId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
  };
}

async function resolveConversationId(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  conversationId: string | undefined,
  question: string,
): Promise<string> {
  if (conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, user_id")
      .eq("id", conversationId)
      .single();

    if (error) throw new Error(`Failed to load conversation: ${error.message}`);
    if (!data || data.user_id !== userId) {
      throw new Error("Conversation not found or not owned by current user");
    }
    return data.id as string;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      title: buildConversationTitle(question),
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data.id as string;
}

async function insertMessage(
  supabase: ReturnType<typeof createServiceClient>,
  row: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("messages")
    .insert(row)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create message: ${error.message}`);
  return data as { id: string };
}

function buildConversationTitle(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
}

function extractBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function toSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
