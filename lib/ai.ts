import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const DEFAULT_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const DEFAULT_CHEAP_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_CHEAP_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";

type AIProvider = "openai" | "anthropic";

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

let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;

function getProvider(model: string): AIProvider {
  const normalized = model.toLowerCase();

  if (normalized.startsWith("gpt") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4")) {
    return "openai";
  }

  if (normalized.startsWith("claude")) {
    return "anthropic";
  }

  throw new Error(`Unsupported AI model: ${model}`);
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  anthropicClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
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

function getCheapModel() {
  const provider = getProvider(DEFAULT_MODEL);
  return provider === "anthropic" ? DEFAULT_CHEAP_ANTHROPIC_MODEL : DEFAULT_CHEAP_OPENAI_MODEL;
}

export async function callAI(prompt: string, model = DEFAULT_MODEL): Promise<string> {
  const provider = getProvider(model);

  if (provider === "openai") {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("OpenAI did not return any text.");
    }

    return content;
  }

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model,
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

export async function extractDeadlines(text: string): Promise<DeadlinesResult> {
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

  const result = parseJson<DeadlinesResult>(await callAI(prompt, getCheapModel()));

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

export async function classifyFile(filename: string, text: string): Promise<FileClassification> {
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

  const result = parseJson<FileClassification>(await callAI(prompt, getCheapModel()));
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
