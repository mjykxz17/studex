import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const DEFAULT_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const DEFAULT_CHEAP_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_CHEAP_ANTHROPIC_MODEL = "claude-haiku-4-5";

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

type Deadline = {
  title: string;
  due_date: string;
  weight: string;
};

type DeadlinesResult = {
  deadlines: Deadline[];
};

type FileClassification = {
  file_type: "lecture" | "tutorial" | "assignment" | "other";
  week_number: number | null;
  reasoning: string;
};

type AIConfigInput =
  | string
  | {
      model?: string;
      provider?: AIProvider;
      auth?: Partial<Pick<AIAuthConfig, "authMode">> & {
        credentials?: AICredentials;
      };
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

export function getDefaultAIConfig(): AIConfig {
  return resolveAIConfig();
}

function getOpenAIClient(auth: AIAuthConfig) {
  if (auth.authMode !== "apiKey") {
    throw new Error(`OpenAI auth mode ${auth.authMode} is not implemented yet.`);
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
    throw new Error(`Anthropic auth mode ${auth.authMode} is not implemented yet.`);
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

function parseJson<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (fencedMatch) {
      return JSON.parse(fencedMatch[1]) as T;
    }

    throw new Error(`Failed to parse JSON from model response: ${raw}`);
  }
}

function getCheapModel(config?: AIConfigInput) {
  const resolved = resolveAIConfig(config);
  return resolved.provider === "anthropic" ? DEFAULT_CHEAP_ANTHROPIC_MODEL : DEFAULT_CHEAP_OPENAI_MODEL;
}

export async function callAI(prompt: string, config?: AIConfigInput): Promise<string> {
  const resolved = resolveAIConfig(config);

  if (resolved.provider === "openai") {
    const client = getOpenAIClient(resolved.auth);
    const response = await client.chat.completions.create({
      model: resolved.model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("OpenAI did not return any text.");
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
    throw new Error("Anthropic did not return any text.");
  }

  return content;
}

export async function extractDeadlines(text: string, config?: AIConfigInput): Promise<DeadlinesResult> {
  const prompt = [
    "Extract all deadlines from the text below.",
    'Return ONLY valid JSON, with no markdown and no explanation, in exactly this shape:',
    '{"deadlines":[{"title":"string","due_date":"YYYY-MM-DD","weight":"string"}]}',
    'If no deadlines are found, return {"deadlines":[]}.',
    "Use an empty string for weight when it is not stated.",
    "Only include due_date values when a specific calendar date is present or can be inferred with high confidence.",
    "Text:",
    text,
  ].join("\n\n");

  const result = parseJson<DeadlinesResult>(await callAI(prompt, getCheapModel(config)));

  return {
    deadlines: Array.isArray(result.deadlines)
      ? result.deadlines.map((deadline) => ({
          title: String(deadline.title ?? "").trim(),
          due_date: String(deadline.due_date ?? "").trim(),
          weight: String(deadline.weight ?? "").trim(),
        }))
      : [],
  };
}

export async function classifyFile(filename: string, text: string, config?: AIConfigInput): Promise<FileClassification> {
  const preview = text.trim().slice(0, 4000);
  const prompt = [
    "Classify this study file.",
    'Return ONLY valid JSON, with no markdown and no explanation, in exactly this shape:',
    '{"file_type":"lecture|tutorial|assignment|other","week_number":number|null,"reasoning":"string"}',
    "Rules:",
    "- file_type must be one of lecture, tutorial, assignment, other.",
    "- week_number must be an integer if clearly stated, otherwise null.",
    "- reasoning must be brief and based only on the filename and text.",
    `Filename: ${filename}`,
    "Text:",
    preview,
  ].join("\n\n");

  const result = parseJson<FileClassification>(await callAI(prompt, getCheapModel(config)));
  const allowedTypes = new Set(["lecture", "tutorial", "assignment", "other"]);
  const normalizedType = allowedTypes.has(result.file_type) ? result.file_type : "other";
  const normalizedWeekNumber =
    typeof result.week_number === "number" && Number.isInteger(result.week_number)
      ? result.week_number
      : null;

  return {
    file_type: normalizedType,
    week_number: normalizedWeekNumber,
    reasoning: String(result.reasoning ?? "").trim(),
  };
}
