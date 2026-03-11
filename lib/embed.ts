import OpenAI from "openai";

const EMBED_MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  openaiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function tokenizeApprox(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();

  if (!cleaned) {
    return [];
  }

  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0.");
  }

  if (overlap < 0) {
    throw new Error("overlap cannot be negative.");
  }

  if (overlap >= chunkSize) {
    throw new Error("overlap must be smaller than chunkSize.");
  }

  const tokens = tokenizeApprox(cleaned);

  if (tokens.length === 0) {
    return [];
  }

  const step = chunkSize - overlap;
  const chunks: string[] = [];

  for (let start = 0; start < tokens.length; start += step) {
    const chunkTokens = tokens.slice(start, start + chunkSize);

    if (chunkTokens.length === 0) {
      break;
    }

    chunks.push(chunkTokens.join(" "));

    if (start + chunkSize >= tokens.length) {
      break;
    }
  }

  return chunks;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const input = text.trim();

  if (!input) {
    throw new Error("Cannot generate an embedding for empty text.");
  }

  const client = getOpenAIClient();
  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input,
  });

  const embedding = response.data[0]?.embedding;

  if (!embedding) {
    throw new Error("OpenAI did not return an embedding.");
  }

  if (embedding.length !== 1536 && EMBED_MODEL === "text-embedding-3-small") {
    throw new Error(
      `Expected a 1536-dimensional embedding from ${EMBED_MODEL}, received ${embedding.length}.`,
    );
  }

  return embedding;
}
