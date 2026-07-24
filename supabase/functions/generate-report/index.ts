import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type GenerateReportRequest = {
  summary?: Record<string, unknown>;
};

type GeneratedReport = {
  title: string;
  summary: string;
  content: string;
  highRiskSummary: string[];
  marketWatch: string[];
  actionNotes: string[];
  dataQuality: string[];
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
    const summary = body.summary ?? {};

    const report = await generateReportFromGemini(summary);
    return jsonResponse({ report });
  } catch (error) {
    return jsonResponse({ error: toSafeErrorMessage(error) }, 500);
  }
});

async function readRequestBody(req: Request): Promise<GenerateReportRequest> {
  const text = await req.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as GenerateReportRequest;
}

async function generateReportFromGemini(summary: Record<string, unknown>): Promise<GeneratedReport> {
  const model = Deno.env.get("GEMINI_MODEL")?.trim() || DEFAULT_MODEL;
  const apiKey = Deno.env.get("GEMINI_API_KEY");

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const prompt = buildPrompt(summary);
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
        temperature: 0.25,
        topP: 0.9,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini report generation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = extractText(payload);
  if (!text) {
    throw new Error("Gemini report response did not include text");
  }

  return normalizeGeneratedReport(parseJsonObject(text));
}

function buildPrompt(summary: Record<string, unknown>): string {
  return [
    "You are a Korean agricultural market analyst writing a public-facing report for a Jeolla province price dashboard.",
    "Write in Korean only.",
    "Use only the supplied structured summary below.",
    "Do not invent numbers, dates, or causal claims that are not supported by the summary.",
    "Do not write a forecast or trading instruction.",
    "Focus on practical interpretation for visitors of the dashboard.",
    "Return STRICT JSON only, with these keys:",
    `{
  "title": string,
  "summary": string,
  "content": string,
  "highRiskSummary": string[],
  "marketWatch": string[],
  "actionNotes": string[],
  "dataQuality": string[]
}`,
    "Rules for the JSON values:",
    "- title: concise and formal.",
    "- summary: 1 to 2 sentences.",
    "- content: markdown text with sections for 분석 대상, 고위험 품목 요약, 시장 관찰, 대응 참고 사항, 데이터 품질 안내.",
    "- highRiskSummary: 2 to 5 bullet-style sentences.",
    "- marketWatch: 2 to 5 bullet-style sentences.",
    "- actionNotes: 2 to 5 practical next-step sentences.",
    "- dataQuality: 2 to 5 notes about coverage, mock data, or missing values.",
    "- If the summary is limited, say that clearly rather than padding with vague text.",
    "",
    "Structured summary:",
    JSON.stringify(summary, null, 2),
  ].join("\n");
}

function extractText(payload: {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}): string {
  return (
    payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim() ?? ""
  );
}

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = stripCodeFence(text).trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Gemini report response is not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  const jsonText = cleaned.slice(start, end + 1);
  const value = JSON.parse(jsonText) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gemini report response JSON must be an object");
  }

  return value as Record<string, unknown>;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;

  const withoutFenceStart = trimmed.replace(/^```(?:json)?\s*/i, "");
  return withoutFenceStart.replace(/```$/i, "").trim();
}

function normalizeGeneratedReport(value: Record<string, unknown>): GeneratedReport {
  return {
    title: normalizeText(value.title) || "전라도 농수산물 AI 보고서",
    summary: normalizeText(value.summary) || "구조화된 시세 요약을 바탕으로 생성한 보고서입니다.",
    content: normalizeText(value.content) || defaultContent(value),
    highRiskSummary: normalizeList(value.highRiskSummary),
    marketWatch: normalizeList(value.marketWatch),
    actionNotes: normalizeList(value.actionNotes),
    dataQuality: normalizeList(value.dataQuality),
  };
}

function defaultContent(value: Record<string, unknown>): string {
  const title = normalizeText(value.title) || "전라도 농수산물 AI 보고서";
  const summary = normalizeText(value.summary) || "구조화된 시세 요약을 바탕으로 생성한 보고서입니다.";
  const bullets = [
    "## 분석 대상",
    "- 제공된 요약 데이터를 바탕으로 생성되었습니다.",
    "",
    "## 고위험 품목 요약",
    "- 고위험 항목은 생성 결과 배열을 참고해 해석합니다.",
    "",
    "## 시장 관찰",
    "- 최근 가격 흐름과 변동 방향을 중심으로 요약합니다.",
    "",
    "## 대응 참고 사항",
    "- 실제 의사결정 전에는 최신 KAMIS 원본 값과 함께 확인합니다.",
    "",
    "## 데이터 품질 안내",
    "- 결측과 mock 여부를 확인하고 해석합니다.",
  ].join("\n");

  return `# ${title}\n\n${summary}\n\n${bullets}`;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function toSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
