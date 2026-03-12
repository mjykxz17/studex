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
 * Processes in batches of 8 for better throughput.
 */
export async function generateEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const extractor = await getPipeline();
  const BATCH_SIZE = 8;
  const results: number[][] = [];

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (input) => {
        const output = await extractor(input, { pooling: "mean", normalize: true });
        return Array.from(output.data) as number[];
      })
    );
    results.push(...batchResults);
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
