/**
 * Inline directive extraction from user messages.
 * Supports /think, /t, /verbose, /v directives to control agent behavior per-message.
 */

import type { ThinkLevel, VerboseLevel } from "../config/types.js";

/**
 * Normalize user-provided thinking level strings to the canonical enum.
 */
export function normalizeThinkLevel(
  raw?: string | null,
): ThinkLevel | undefined {
  if (!raw) return undefined;
  const key = raw.toLowerCase();
  if (["off"].includes(key)) return "off";
  if (["min", "minimal"].includes(key)) return "minimal";
  if (["low", "thinkhard", "think-hard", "think_hard"].includes(key))
    return "low";
  if (
    ["mid", "med", "medium", "thinkharder", "think-harder", "harder"].includes(
      key,
    )
  )
    return "medium";
  if (
    [
      "high",
      "ultra",
      "ultrathink",
      "think-hard",
      "thinkhardest",
      "highest",
      "max",
    ].includes(key)
  )
    return "high";
  if (["think"].includes(key)) return "minimal";
  return undefined;
}

/**
 * Normalize verbose flags used to toggle agent verbosity.
 */
export function normalizeVerboseLevel(
  raw?: string | null,
): VerboseLevel | undefined {
  if (!raw) return undefined;
  const key = raw.toLowerCase();
  if (["off", "false", "no", "0"].includes(key)) return "off";
  if (["on", "full", "true", "yes", "1"].includes(key)) return "on";
  return undefined;
}

export type ExtractedDirective<T> = {
  cleaned: string;
  level?: T;
  rawLevel?: string;
  hasDirective: boolean;
};

/**
 * Extract /think or /t directive from message body.
 * @example "/think high how are you?" -> { cleaned: "how are you?", level: "high", hasDirective: true }
 */
export function extractThinkDirective(
  body?: string,
): ExtractedDirective<ThinkLevel> {
  if (!body) return { cleaned: "", hasDirective: false };
  // Match the longest keyword first to avoid partial captures (e.g. "/think:high")
  const match = body.match(
    /(?:^|\s)\/(?:thinking|think|t)\s*:?\s*([a-zA-Z-]+)\b/i,
  );
  const level = normalizeThinkLevel(match?.[1]);
  const cleaned = match
    ? body.replace(match[0], "").replace(/\s+/g, " ").trim()
    : body.trim();
  return {
    cleaned,
    level,
    rawLevel: match?.[1],
    hasDirective: !!match,
  };
}

/**
 * Extract /verbose or /v directive from message body.
 * @example "/v on what time is it?" -> { cleaned: "what time is it?", level: "on", hasDirective: true }
 */
export function extractVerboseDirective(
  body?: string,
): ExtractedDirective<VerboseLevel> {
  if (!body) return { cleaned: "", hasDirective: false };
  const match = body.match(
    /(?:^|\s)\/(?:verbose|v)(?=$|\s|:)\s*:?\s*([a-zA-Z-]+)\b/i,
  );
  const level = normalizeVerboseLevel(match?.[1]);
  const cleaned = match
    ? body.replace(match[0], "").replace(/\s+/g, " ").trim()
    : body.trim();
  return {
    cleaned,
    level,
    rawLevel: match?.[1],
    hasDirective: !!match,
  };
}

export type ExtractedDirectives = {
  /** Message with all directives removed */
  cleanedMessage: string;
  /** Extracted /think level */
  thinkLevel?: ThinkLevel;
  /** Extracted /verbose level */
  verboseLevel?: VerboseLevel;
  /** Whether any directives were found */
  hasDirectives: boolean;
};

/**
 * Extract all supported directives from a message.
 * Processes /think and /verbose directives, returning cleaned message and extracted levels.
 */
export function extractAllDirectives(message: string): ExtractedDirectives {
  let current = message;
  let hasDirectives = false;

  // Extract /think directive
  const thinkResult = extractThinkDirective(current);
  if (thinkResult.hasDirective) {
    current = thinkResult.cleaned;
    hasDirectives = true;
  }

  // Extract /verbose directive
  const verboseResult = extractVerboseDirective(current);
  if (verboseResult.hasDirective) {
    current = verboseResult.cleaned;
    hasDirectives = true;
  }

  return {
    cleanedMessage: current.trim(),
    thinkLevel: thinkResult.level,
    verboseLevel: verboseResult.level,
    hasDirectives,
  };
}
