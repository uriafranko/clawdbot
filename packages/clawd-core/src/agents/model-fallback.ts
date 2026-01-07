/**
 * Model fallback system for graceful degradation across multiple models.
 */

import type { ClawdConfig } from "../config/types.js";

export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export type ModelCandidate = {
  provider: string;
  model: string;
};

export type FallbackAttempt = {
  provider: string;
  model: string;
  error: string;
};

/**
 * Check if an error is an abort error (should not trigger fallback).
 */
function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError") return true;
  const message =
    "message" in err && typeof err.message === "string"
      ? err.message.toLowerCase()
      : "";
  return message.includes("aborted");
}

/**
 * Parse a model reference string like "anthropic/claude-3-opus" or just "claude-3-opus".
 */
export function parseModelRef(
  raw: string,
  defaultProvider: string,
): ModelCandidate | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("/")) {
    const [provider, model] = trimmed.split("/", 2);
    if (provider && model) {
      return { provider: provider.trim(), model: model.trim() };
    }
  }

  return { provider: defaultProvider, model: trimmed };
}

/**
 * Create a unique key for a model candidate.
 */
export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

/**
 * Build model alias index from config.
 */
export function buildModelAliasIndex(params: {
  cfg: ClawdConfig;
  defaultProvider: string;
}): Map<string, ModelCandidate> {
  const index = new Map<string, ModelCandidate>();
  const models = params.cfg.agent?.models ?? {};

  for (const [key, value] of Object.entries(models)) {
    const alias = value?.alias;
    if (!alias) continue;

    const parsed = parseModelRef(alias, params.defaultProvider);
    if (parsed) {
      index.set(key.toLowerCase(), parsed);
    }
  }

  return index;
}

/**
 * Resolve a model reference, checking aliases first.
 */
export function resolveModelRef(params: {
  raw: string;
  defaultProvider: string;
  aliasIndex?: Map<string, ModelCandidate>;
}): { ref: ModelCandidate; fromAlias: boolean } | null {
  const trimmed = params.raw.trim().toLowerCase();
  if (!trimmed) return null;

  // Check alias first
  const alias = params.aliasIndex?.get(trimmed);
  if (alias) {
    return { ref: alias, fromAlias: true };
  }

  // Parse as direct reference
  const parsed = parseModelRef(params.raw, params.defaultProvider);
  if (parsed) {
    return { ref: parsed, fromAlias: false };
  }

  return null;
}

/**
 * Build list of allowed model keys from config.
 */
function buildAllowedModelKeys(
  cfg: ClawdConfig | undefined,
  defaultProvider: string,
): Set<string> | null {
  const modelMap = cfg?.agent?.models ?? {};
  const rawAllowlist = Object.keys(modelMap);
  if (rawAllowlist.length === 0) return null;

  const keys = new Set<string>();
  for (const raw of rawAllowlist) {
    const parsed = parseModelRef(String(raw ?? ""), defaultProvider);
    if (!parsed) continue;
    keys.add(modelKey(parsed.provider, parsed.model));
  }

  return keys.size > 0 ? keys : null;
}

/**
 * Resolve fallback candidates from config.
 */
export function resolveFallbackCandidates(params: {
  cfg: ClawdConfig | undefined;
  provider: string;
  model: string;
}): ModelCandidate[] {
  const provider = params.provider.trim() || DEFAULT_PROVIDER;
  const model = params.model.trim() || DEFAULT_MODEL;
  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg ?? {},
    defaultProvider: DEFAULT_PROVIDER,
  });
  const allowlist = buildAllowedModelKeys(params.cfg, DEFAULT_PROVIDER);
  const seen = new Set<string>();
  const candidates: ModelCandidate[] = [];

  const addCandidate = (
    candidate: ModelCandidate,
    enforceAllowlist: boolean,
  ) => {
    if (!candidate.provider || !candidate.model) return;
    const key = modelKey(candidate.provider, candidate.model);
    if (seen.has(key)) return;
    if (enforceAllowlist && allowlist && !allowlist.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  // Add primary model first
  addCandidate({ provider, model }, false);

  // Add fallbacks from config
  const modelConfig = params.cfg?.agent?.model;
  const fallbacks =
    modelConfig && typeof modelConfig === "object" && "fallbacks" in modelConfig
      ? ((modelConfig as { fallbacks?: string[] }).fallbacks ?? [])
      : [];

  for (const raw of fallbacks) {
    const resolved = resolveModelRef({
      raw: String(raw ?? ""),
      defaultProvider: DEFAULT_PROVIDER,
      aliasIndex,
    });
    if (!resolved) continue;
    addCandidate(resolved.ref, true);
  }

  return candidates;
}

/**
 * Run an operation with model fallback support.
 * Tries primary model first, then falls back to alternatives on failure.
 */
export async function runWithModelFallback<T>(params: {
  cfg: ClawdConfig | undefined;
  provider: string;
  model: string;
  run: (provider: string, model: string) => Promise<T>;
  onError?: (attempt: {
    provider: string;
    model: string;
    error: unknown;
    attempt: number;
    total: number;
  }) => void | Promise<void>;
}): Promise<{
  result: T;
  provider: string;
  model: string;
  attempts: FallbackAttempt[];
}> {
  const candidates = resolveFallbackCandidates(params);
  const attempts: FallbackAttempt[] = [];
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i] as ModelCandidate;
    try {
      const result = await params.run(candidate.provider, candidate.model);
      return {
        result,
        provider: candidate.provider,
        model: candidate.model,
        attempts,
      };
    } catch (err) {
      // Don't fall back on abort errors
      if (isAbortError(err)) throw err;

      lastError = err;
      attempts.push({
        provider: candidate.provider,
        model: candidate.model,
        error: err instanceof Error ? err.message : String(err),
      });

      await params.onError?.({
        provider: candidate.provider,
        model: candidate.model,
        error: err,
        attempt: i + 1,
        total: candidates.length,
      });
    }
  }

  // If only one attempt and it failed, throw original error
  if (attempts.length <= 1 && lastError) throw lastError;

  // Multiple failures - throw aggregated error
  const summary =
    attempts.length > 0
      ? attempts
          .map(
            (attempt) =>
              `${attempt.provider}/${attempt.model}: ${attempt.error}`,
          )
          .join(" | ")
      : "unknown";

  throw new Error(
    `All models failed (${attempts.length || candidates.length}): ${summary}`,
    { cause: lastError instanceof Error ? lastError : undefined },
  );
}

/**
 * Get the primary model from config or use defaults.
 */
export function resolvePrimaryModel(
  cfg: ClawdConfig | undefined,
): ModelCandidate {
  const modelConfig = cfg?.agent?.model;

  if (typeof modelConfig === "string") {
    const parsed = parseModelRef(modelConfig, DEFAULT_PROVIDER);
    if (parsed) return parsed;
  }

  if (modelConfig && typeof modelConfig === "object") {
    const provider = (modelConfig as { provider?: string }).provider;
    const model = (modelConfig as { model?: string }).model;
    if (model) {
      return {
        provider: provider?.trim() || DEFAULT_PROVIDER,
        model: model.trim(),
      };
    }
  }

  return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
}
