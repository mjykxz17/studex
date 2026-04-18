import crypto from "node:crypto";

import { pipeline } from "@huggingface/transformers";

type EmbeddingOutput = { data: ArrayLike<number> };
type EmbeddingExtractor = (input: string, options: { pooling: "mean"; normalize: boolean }) => Promise<EmbeddingOutput>;

let embeddingPipeline: EmbeddingExtractor | null = null;
let pipelineUnavailable = false;

export const EMBEDDING_DIMENSIONS = 384;
const DEFAULT_BATCH_SIZE = 8;
const createFeatureExtractionPipeline = pipeline as unknown as (
  task: "feature-extraction",
  model: string,
) => Promise<EmbeddingExtractor>;

async function getPipeline() {
  if (pipelineUnavailable) {
    return null;
  }

  if (!embeddingPipeline) {
    try {
      embeddingPipeline = await createFeatureExtractionPipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    } catch {
      pipelineUnavailable = true;
      embeddingPipeline = null;
    }
  }

  return embeddingPipeline;
}

export function resetEmbeddingPipelineForTests() {
  embeddingPipeline = null;
  pipelineUnavailable = false;
}

export function buildFallbackEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const normalized = text.trim().toLowerCase();

  if (!normalized) {
    return vector;
  }

  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    const hash = crypto.createHash("sha256").update(token).digest();
    const index = hash.readUInt16BE(0) % EMBEDDING_DIMENSIONS;
    const magnitude = ((hash[2] / 255) * 2 - 1) * (1 + token.length / 12);
    vector[index] += magnitude;
  }

  const l2 = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (l2 === 0) {
    return vector;
  }

  return vector.map((value) => value / l2);
}

export function chunkText(text: string, size = 240, overlap = 40): string[] {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [];
  }

  const safeSize = Math.max(1, size);
  const safeOverlap = Math.min(Math.max(0, overlap), safeSize - 1);
  const step = safeSize - safeOverlap;
  const chunks: string[] = [];

  for (let index = 0; index < words.length; index += step) {
    const chunk = words.slice(index, index + safeSize).join(" ").trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (index + safeSize >= words.length) {
      break;
    }
  }

  return chunks;
}

export async function generateEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  const extractor = await getPipeline();

  if (!extractor) {
    return inputs.map((input) => buildFallbackEmbedding(input));
  }

  const results: number[][] = [];

  for (let index = 0; index < inputs.length; index += DEFAULT_BATCH_SIZE) {
    const batch = inputs.slice(index, index + DEFAULT_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (input) => {
        try {
          const output = await extractor(input, { pooling: "mean", normalize: true });
          return Array.from(output.data);
        } catch {
          return buildFallbackEmbedding(input);
        }
      }),
    );

    results.push(...batchResults);
  }

  return results;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}
