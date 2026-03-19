// Usage extraction matching closedrouter's patterns:
// - Unified parseUsageBlock for OpenAI + Anthropic field names
// - Handles cache tokens (prompt_tokens_details, cache_read_input_tokens, etc.)
// - Two-pass SSE scanning: forward for response.completed, backward for last data line

export interface ParsedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  model: string;
}

interface UsageBlock {
  prompt_tokens?: number;
  completion_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  input_tokens_details?: { cached_tokens?: number };
  // anthropic native
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function parseUsageBlock(usage: UsageBlock): Omit<ParsedUsage, "model"> | null {
  const prompt = usage.prompt_tokens ?? usage.input_tokens;
  const completion = usage.completion_tokens ?? usage.output_tokens;
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;

  const cachedRead = Number(
    usage.prompt_tokens_details?.cached_tokens ??
    usage.input_tokens_details?.cached_tokens ??
    usage.cache_read_input_tokens ??
    0
  );
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);

  return {
    inputTokens: prompt!,
    outputTokens: completion!,
    cachedInputTokens: cachedRead,
    cacheWriteInputTokens: cacheWrite,
  };
}

export function extractUsage(raw: string): ParsedUsage | null {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  const model: string = payload?.model ?? payload?.response?.model ?? "unknown";

  // Responses API: { type: "response.completed", response: { usage: { ... } } }
  if (payload.response?.usage) {
    const result = parseUsageBlock(payload.response.usage);
    if (result) return { ...result, model };
  }

  // Chat Completions / Anthropic: { usage: { ... } }
  if (payload.usage) {
    const result = parseUsageBlock(payload.usage);
    if (result) return { ...result, model };
  }

  return null;
}

// Two-pass SSE extraction matching closedrouter:
// Pass 1: forward scan for `event: response.completed` (Responses API)
// Pass 2: backward scan for last `data:` line with usage (Chat Completions)
export function extractUsageFromSse(accumulated: string): ParsedUsage | null {
  const lines = accumulated.split("\n");

  // Pass 1: look for Responses API "response.completed" event
  let lastEventType = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("event:")) {
      lastEventType = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:") && lastEventType === "response.completed") {
      const payload = line.slice(5).trim();
      const result = extractUsage(payload);
      if (result) return result;
    }
  }

  // Pass 2: walk backwards for Chat Completions / Anthropic streams
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    const result = extractUsage(payload);
    if (result) return result;
  }

  return null;
}

export function roughTokenEstimate(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
