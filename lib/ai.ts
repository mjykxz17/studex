import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const DEFAULT_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const DEFAULT_CHEAP_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_CHEAP_ANTHROPIC_MODEL = "claude-haiku-4-5";
const MAX_AI_RETRIES = 2;

export type AIProvider = "openai" | "anthropic";
export type AIAuthMode = "apiKey" | "oauth";

export type AICredentials = {
  apiKey?: string | null;
  accessToken?: string | null;
};

export type AIAuthConfig = {
  provider: AIProvider;
  authMode: AIAuthMode;
  credentials: AICredentials;
};

export type AIConfig = {
  provider: AIProvider;
  model: string;
  auth: AIAuthConfig;
};

export type AIConfigInput =
  | string
  | {
      model?: string;
      provider?: AIProvider;
      auth?: Partial<Pick<AIAuthConfig, "authMode">> & {
        credentials?: AICredentials;
      };
    };

export type Deadline = {
  title: string;
  due_date: string;
  weight: string;
};

type DeadlineResult = {
  deadlines: Deadline[];
};

export type FileClassification = {
  file_type: "lecture" | "tutorial" | "assignment" | "other";
  week_number: number | null;
  reasoning: string;
};

type SummaryResult = {
  summary_points?: string[];
};

type AnnouncementSummaryResult = SummaryResult & {
  importance?: "high" | "normal" | "low";
};

const openaiClientCache = new Map<string, OpenAI>();
const anthropicClientCache = new Map<string, Anthropic>();

export function getProvider(model: string): AIProvider {
  const normalized = model.toLowerCase();

  if (normalized.startsWith("gpt") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
    return "openai";
  }

  if (normalized.startsWith("claude")) {
    return "anthropic";
  }

  throw new Error(`Unsupported AI model: ${model}`);
}

function getEnvApiKey(provider: AIProvider): string | undefined {
  return provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
}

function getDefaultAuthConfig(provider: AIProvider): AIAuthConfig {
  return {
    provider,
    authMode: "apiKey",
    credentials: {
      apiKey: getEnvApiKey(provider),
    },
  };
}

export function resolveAIConfig(input?: AIConfigInput): AIConfig {
  const model = typeof input === "string" ? input : input?.model?.trim() || DEFAULT_MODEL;
  const provider = (typeof input === "object" && input?.provider) || getProvider(model);
  const defaultAuth = getDefaultAuthConfig(provider);

  return {
    provider,
    model,
    auth: {
      provider,
      authMode: input && typeof input === "object" ? input.auth?.authMode ?? defaultAuth.authMode : defaultAuth.authMode,
      credentials: {
        apiKey:
          input && typeof input === "object" && input.auth?.credentials?.apiKey !== undefined
            ? input.auth.credentials.apiKey
            : defaultAuth.credentials.apiKey,
        accessToken:
          input && typeof input === "object" && input.auth?.credentials?.accessToken !== undefined
            ? input.auth.credentials.accessToken
            : defaultAuth.credentials.accessToken,
      },
    },
  };
}

function getOpenAIClient(auth: AIAuthConfig) {
  if (auth.authMode !== "apiKey") {
    throw new Error(`OpenAI auth mode ${auth.authMode} is not implemented.`);
  }

  const apiKey = auth.credentials.apiKey?.trim();

  if (!apiKey) {
    throw new Error("OpenAI API key is not configured.");
  }

  const cacheKey = `${auth.provider}:${auth.authMode}:${apiKey}`;
  const existing = openaiClientCache.get(cacheKey);

  if (existing) {
    return existing;
  }

  const client = new OpenAI({ apiKey });
  openaiClientCache.set(cacheKey, client);
  return client;
}

function getAnthropicClient(auth: AIAuthConfig) {
  if (auth.authMode !== "apiKey") {
    throw new Error(`Anthropic auth mode ${auth.authMode} is not implemented.`);
  }

  const apiKey = auth.credentials.apiKey?.trim();

  if (!apiKey) {
    throw new Error("Anthropic API key is not configured.");
  }

  const cacheKey = `${auth.provider}:${auth.authMode}:${apiKey}`;
  const existing = anthropicClientCache.get(cacheKey);

  if (existing) {
    return existing;
  }

  const client = new Anthropic({ apiKey });
  anthropicClientCache.set(cacheKey, client);
  return client;
}

function extractTextFromAnthropicBlocks(blocks: Anthropic.Messages.Message["content"]): string {
  return blocks
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const text = error.message.toLowerCase();
  return ["timeout", "429", "500", "502", "503", "504", "overloaded", "rate limit"].some((pattern) => text.includes(pattern));
}

async function withRetries<T>(fn: () => Promise<T>) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_AI_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === MAX_AI_RETRIES || !isRetryableError(error)) {
        break;
      }

      await sleep(250 * 2 ** attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown AI provider error.";
  throw new Error(`AI request failed: ${message}`);
}

function toJsonCandidate(raw: string) {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function parseJsonResponse<T>(raw: string): T {
  return JSON.parse(toJsonCandidate(raw)) as T;
}

function getCheapAIConfig(config?: AIConfigInput): AIConfigInput {
  const resolved = resolveAIConfig(config);

  return {
    provider: resolved.provider,
    model: resolved.provider === "anthropic" ? DEFAULT_CHEAP_ANTHROPIC_MODEL : DEFAULT_CHEAP_OPENAI_MODEL,
    auth: {
      authMode: resolved.auth.authMode,
      credentials: resolved.auth.credentials,
    },
  };
}

export async function callAIText(prompt: string, config?: AIConfigInput): Promise<string> {
  const resolved = resolveAIConfig(config);

  return withRetries(async () => {
    if (resolved.provider === "openai") {
      const client = getOpenAIClient(resolved.auth);
      const response = await client.chat.completions.create({
        model: resolved.model,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.choices[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("OpenAI returned an empty response.");
      }

      return content;
    }

    const client = getAnthropicClient(resolved.auth);
    const response = await client.messages.create({
      model: resolved.model,
      max_tokens: 1024,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const content = extractTextFromAnthropicBlocks(response.content);

    if (!content) {
      throw new Error("Anthropic returned an empty response.");
    }

    return content;
  });
}

export async function callAIJson<T>(prompt: string, config?: AIConfigInput): Promise<T> {
  const raw = await callAIText(prompt, config);

  try {
    return parseJsonResponse<T>(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse JSON";
    throw new Error(`AI returned invalid JSON: ${message}`);
  }
}

export const callAI = callAIText;

function sanitizeLines(lines: string[]) {
  return lines
    .map((line) => line.replace(/^\s*[-*]\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function formatBulletSummary(lines: string[]) {
  const normalized = sanitizeLines(lines);

  if (normalized.length === 0) {
    return null;
  }

  return normalized.map((line) => `- ${line}`).join("\n");
}

export function buildFallbackBulletSummary(text: string, maxLines = 3) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .map((sentence) => sentence.slice(0, 180));

  return formatBulletSummary(sentences);
}

export async function summarizeAnnouncement(
  title: string,
  bodyText: string,
  config?: AIConfigInput,
): Promise<{ summary: string | null; importance: "high" | "normal" | "low" }> {
  const text = bodyText.trim();

  if (!text) {
    return { summary: null, importance: "low" };
  }

  const prompt = [
    "Summarize this Canvas announcement for a student.",
    "Return ONLY valid JSON in this shape:",
    '{"summary_points":["string"],"importance":"high|normal|low"}',
    "Rules:",
    "- summary_points must contain 1 to 3 concise, high-signal bullets.",
    "- Focus on deadlines, deliverables, exam hints, policy changes, and required actions.",
    "- Use plain language, not markdown.",
    `Title: ${title}`,
    "Body:",
    text.slice(0, 6000),
  ].join("\n\n");

  try {
    const parsed = await callAIJson<AnnouncementSummaryResult>(prompt, getCheapAIConfig(config));

    return {
      summary: formatBulletSummary(parsed.summary_points ?? []),
      importance: parsed.importance === "high" || parsed.importance === "low" ? parsed.importance : "normal",
    };
  } catch {
    return {
      summary: buildFallbackBulletSummary(text),
      importance: "normal",
    };
  }
}

export async function summarizeFile(filename: string, text: string, config?: AIConfigInput): Promise<string | null> {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  const prompt = [
    "Summarize this academic course file for a student.",
    "Return ONLY valid JSON in this shape:",
    '{"summary_points":["string"]}',
    "Rules:",
    "- summary_points must contain 1 to 3 concise bullets.",
    "- Focus on concepts, required work, deadlines, and revision value.",
    `Filename: ${filename}`,
    "Content:",
    trimmed.slice(0, 6000),
  ].join("\n\n");

  try {
    const parsed = await callAIJson<SummaryResult>(prompt, getCheapAIConfig(config));
    return formatBulletSummary(parsed.summary_points ?? []);
  } catch {
    return buildFallbackBulletSummary(trimmed);
  }
}

export async function extractDeadlines(text: string, config?: AIConfigInput): Promise<DeadlineResult> {
  const prompt = [
    "Extract all deadlines from the text below.",
    "Return ONLY valid JSON in this shape:",
    '{"deadlines":[{"title":"string","due_date":"YYYY-MM-DD","weight":"string"}]}',
    "If no deadlines are present, return {\"deadlines\":[]}.",
    "Only include due_date when a specific date can be inferred with high confidence.",
    "Use an empty string for weight if not stated.",
    "Text:",
    text.slice(0, 8000),
  ].join("\n\n");

  try {
    const result = await callAIJson<DeadlineResult>(prompt, getCheapAIConfig(config));

    return {
      deadlines: Array.isArray(result.deadlines)
        ? result.deadlines
            .map((deadline) => ({
              title: String(deadline.title ?? "").trim(),
              due_date: String(deadline.due_date ?? "").trim(),
              weight: String(deadline.weight ?? "").trim(),
            }))
            .filter((deadline) => Boolean(deadline.title))
        : [],
    };
  } catch {
    return { deadlines: [] };
  }
}

export async function classifyFile(filename: string, text: string, config?: AIConfigInput): Promise<FileClassification> {
  const prompt = [
    "Classify this study file.",
    "Return ONLY valid JSON in this shape:",
    '{"file_type":"lecture|tutorial|assignment|other","week_number":number|null,"reasoning":"string"}',
    "Rules:",
    "- file_type must be one of lecture, tutorial, assignment, or other.",
    "- week_number must be an integer if clearly stated, otherwise null.",
    "- reasoning must be brief.",
    `Filename: ${filename}`,
    "Preview:",
    text.trim().slice(0, 4000),
  ].join("\n\n");

  try {
    const result = await callAIJson<FileClassification>(prompt, getCheapAIConfig(config));
    const fileType = new Set(["lecture", "tutorial", "assignment", "other"]).has(result.file_type)
      ? result.file_type
      : "other";

    return {
      file_type: fileType,
      week_number: Number.isInteger(result.week_number) ? result.week_number : null,
      reasoning: String(result.reasoning ?? "").trim(),
    };
  } catch {
    const lowered = `${filename}\n${text.slice(0, 500)}`.toLowerCase();
    const weekMatch = lowered.match(/\b(?:week|wk)\s*(\d{1,2})\b/);

    return {
      file_type: lowered.includes("tutorial")
        ? "tutorial"
        : lowered.includes("assignment")
          ? "assignment"
          : lowered.includes("lecture") || lowered.includes("slides")
            ? "lecture"
            : "other",
      week_number: weekMatch ? Number.parseInt(weekMatch[1], 10) : null,
      reasoning: "Fallback filename/text heuristic.",
    };
  }
}
