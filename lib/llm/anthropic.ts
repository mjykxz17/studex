// lib/llm/anthropic.ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/lib/env";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";

export function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: env.anthropicApiKey });
}
