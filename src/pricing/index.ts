// Fetches and caches model pricing from models.dev (zai provider)
// Costs in the TOML are per 1M tokens in USD

const GITHUB_RAW =
  "https://raw.githubusercontent.com/sst/models.dev/refs/heads/dev/providers/zai/models";
const MODEL_LIST_API =
  "https://api.github.com/repos/sst/models.dev/contents/providers/zai/models";

export interface ModelPricing {
  name: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
  cacheWritePerMillion: number;
}

const cache = new Map<string, ModelPricing>();
let lastFetch = 0;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function parseToml(raw: string): Record<string, any> {
  const result: Record<string, any> = {};
  let currentSection: string | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch?.[1]) {
      currentSection = sectionMatch[1];
      result[currentSection] = result[currentSection] || {};
      continue;
    }

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch?.[1] && kvMatch[2]) {
      const key = kvMatch[1];
      let value: any = kvMatch[2].trim();

      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (value.startsWith('"') && value.endsWith('"'))
        value = value.slice(1, -1);
      else if (value.startsWith("[")) {
        value = value
          .slice(1, -1)
          .split(",")
          .map((v: string) => v.trim().replace(/"/g, ""))
          .filter(Boolean);
      } else {
        const num = Number(value.replace(/_/g, ""));
        if (!isNaN(num)) value = num;
      }

      if (currentSection) {
        result[currentSection][key] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

async function fetchModelList(): Promise<string[]> {
  const resp = await fetch(MODEL_LIST_API, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
        : {}),
    },
  });

  if (!resp.ok) {
    console.error(`Failed to fetch model list: ${resp.status}`);
    return [];
  }

  const items = (await resp.json()) as { name: string }[];
  return items
    .filter((i) => i.name.endsWith(".toml"))
    .map((i) => i.name.replace(".toml", ""));
}

async function fetchModelPricing(modelId: string): Promise<ModelPricing | null> {
  const resp = await fetch(`${GITHUB_RAW}/${modelId}.toml`);
  if (!resp.ok) return null;

  const raw = await resp.text();
  const parsed = parseToml(raw);

  if (!parsed.cost) return null;

  return {
    name: parsed.name || modelId,
    inputPerMillion: parsed.cost.input ?? 0,
    outputPerMillion: parsed.cost.output ?? 0,
    cacheReadPerMillion: parsed.cost.cache_read ?? 0,
    cacheWritePerMillion: parsed.cost.cache_write ?? 0,
  };
}

export async function refreshPricing(): Promise<void> {
  const modelIds = await fetchModelList();
  const results = await Promise.allSettled(
    modelIds.map((id) => fetchModelPricing(id).then((p) => [id, p] as const))
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value[1]) {
      cache.set(result.value[0], result.value[1]);
    }
  }

  lastFetch = Date.now();
  console.log(`Pricing cache loaded: ${cache.size} models`);
}

export async function ensurePricing(): Promise<void> {
  if (Date.now() - lastFetch > CACHE_TTL || cache.size === 0) {
    await refreshPricing();
  }
}

export function getModelPricing(modelId: string): ModelPricing | null {
  return cache.get(modelId) || null;
}

// 4-tier cost calculation matching closedrouter's approach:
// cache tokens are subtracted from input to avoid double-billing
export function calculateCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): number {
  const pricing = cache.get(modelId);
  if (!pricing) {
    // fallback: assume $10/1M in, $30/1M out (expensive default to be safe)
    const inputCost = (inputTokens / 1_000_000) * 10;
    const outputCost = (outputTokens / 1_000_000) * 30;
    return Math.ceil((inputCost + outputCost) * 100);
  }

  const uncachedInput = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const inputCost = (uncachedInput / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
  const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;

  return Math.ceil((inputCost + outputCost + cacheReadCost + cacheWriteCost) * 100);
}

export function listModels(): Map<string, ModelPricing> {
  return cache;
}
