import { pipeline } from "@huggingface/transformers";

let embeddingPipeline: any = null;

async function getPipeline() {
  if (!embeddingPipeline) {
    embeddingPipeline = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embeddingPipeline;
}

/**
 * Split text into overlapping chunks for RAG.
 */
export function chunkText(text: string, size = 500, overlap = 50): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += size - overlap) {
    const chunk = words.slice(i, i + size).join(" ");
    if (chunk.trim()) {
      chunks.push(chunk);
    }
    if (i + size >= words.length) break;
  }

  return chunks;
}

/**
 * Generate vector embeddings locally using Transformers.js.
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */
export async function generateEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const extractor = await getPipeline();
  const results: number[][] = [];

  for (const input of inputs) {
    const output = await extractor(input, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data));
  }

  return results;
}

/**
 * Legacy wrapper for single embedding.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const results = await generateEmbeddings([text]);
  return results[0];
}
