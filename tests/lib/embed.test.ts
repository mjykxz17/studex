import { buildFallbackEmbedding, chunkText, EMBEDDING_DIMENSIONS } from "@/lib/embed";

describe("lib/embed", () => {
  it("creates fixed-size fallback embeddings", () => {
    const embedding = buildFallbackEmbedding("canvas announcements exam deadline");
    expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("chunks text with overlap-friendly defaults", () => {
    const text = Array.from({ length: 600 }, (_, index) => `word-${index}`).join(" ");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toContain("word-0");
    expect(chunks[1]).toContain("word-200");
  });
});
