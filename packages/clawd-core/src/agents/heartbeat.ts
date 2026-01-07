/**
 * Heartbeat system for periodic agent check-ins.
 * Reads HEARTBEAT.md and runs agent periodically.
 */

import fs from "node:fs";
import path from "node:path";
import type { ClawdConfig, ThinkLevel } from "../config/types.js";
import { runClawdAgent } from "./runner.js";

export const DEFAULT_HEARTBEAT_PROMPT =
  "Read HEARTBEAT.md if it exists. Consider outstanding tasks. Check in briefly.";
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Token that agent can use to indicate no action needed.
 * If response contains only this token (+ optional short ack), heartbeat is considered silent.
 */
export const HEARTBEAT_TOKEN = "[HEARTBEAT_OK]";

export type HeartbeatConfig = {
  /** Enable heartbeat system */
  enabled?: boolean;
  /** Interval in milliseconds between heartbeats */
  intervalMs?: number;
  /** Custom heartbeat prompt */
  prompt?: string;
  /** Max chars for acknowledgment to be considered "silent" */
  ackMaxChars?: number;
  /** Thinking level for heartbeat runs */
  thinkingLevel?: ThinkLevel;
};

export type HeartbeatResult = {
  status: "ran" | "skipped" | "failed";
  reason?: string;
  response?: string;
  durationMs?: number;
  /** Whether the response should be delivered (not just an ack) */
  shouldDeliver?: boolean;
};

/**
 * Parse duration string like "30m", "1h", "60s" to milliseconds.
 */
export function parseDurationMs(
  raw: string,
  opts: { defaultUnit?: "s" | "m" | "h" } = {},
): number {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return 0;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([smh])?$/);
  if (!match) {
    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      const unit = opts.defaultUnit ?? "m";
      const multiplier = unit === "s" ? 1000 : unit === "h" ? 3600000 : 60000;
      return asNumber * multiplier;
    }
    throw new Error(`Invalid duration format: ${raw}`);
  }

  const value = Number.parseFloat(match[1] as string);
  const unit = (match[2] as "s" | "m" | "h") ?? opts.defaultUnit ?? "m";

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      return value * 60 * 1000;
  }
}

/**
 * Resolve heartbeat interval from config.
 */
export function resolveHeartbeatIntervalMs(
  heartbeatConfig?: HeartbeatConfig,
  overrideEvery?: string,
): number | null {
  if (heartbeatConfig?.enabled === false) return null;

  if (overrideEvery) {
    try {
      const ms = parseDurationMs(overrideEvery);
      return ms > 0 ? ms : null;
    } catch {
      return null;
    }
  }

  return heartbeatConfig?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
}

/**
 * Resolve heartbeat prompt from config.
 */
export function resolveHeartbeatPrompt(
  heartbeatConfig?: HeartbeatConfig,
): string {
  return heartbeatConfig?.prompt?.trim() || DEFAULT_HEARTBEAT_PROMPT;
}

/**
 * Strip heartbeat token from response and determine if it should be delivered.
 */
export function processHeartbeatResponse(
  response: string,
  opts: { ackMaxChars?: number } = {},
): { text: string; shouldDeliver: boolean } {
  const ackMaxChars = opts.ackMaxChars ?? 30;
  const trimmed = response.trim();

  if (!trimmed) {
    return { text: "", shouldDeliver: false };
  }

  if (!trimmed.includes(HEARTBEAT_TOKEN)) {
    return { text: trimmed, shouldDeliver: true };
  }

  // Strip token from edges
  let text = trimmed;
  let didStrip = false;

  while (text.startsWith(HEARTBEAT_TOKEN)) {
    text = text.slice(HEARTBEAT_TOKEN.length).trimStart();
    didStrip = true;
  }

  while (text.endsWith(HEARTBEAT_TOKEN)) {
    text = text.slice(0, -HEARTBEAT_TOKEN.length).trimEnd();
    didStrip = true;
  }

  if (!didStrip) {
    return { text: trimmed, shouldDeliver: true };
  }

  // If remaining text is just a short ack, don't deliver
  if (!text || text.length <= ackMaxChars) {
    return { text: "", shouldDeliver: false };
  }

  return { text, shouldDeliver: true };
}

/**
 * Read HEARTBEAT.md content from workspace if it exists.
 */
export async function readHeartbeatFile(
  workspaceDir: string,
): Promise<string | undefined> {
  const heartbeatPath = path.join(workspaceDir, "HEARTBEAT.md");
  try {
    const content = await fs.promises.readFile(heartbeatPath, "utf-8");
    return content.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Run a single heartbeat check-in.
 */
export async function runHeartbeat(params: {
  config?: ClawdConfig;
  heartbeatConfig?: HeartbeatConfig;
  onTextChunk?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<HeartbeatResult> {
  const { config, heartbeatConfig, signal } = params;
  const startedAt = Date.now();

  try {
    const prompt = resolveHeartbeatPrompt(heartbeatConfig);
    const thinkingLevel = heartbeatConfig?.thinkingLevel ?? "low";

    const result = await runClawdAgent({
      message: prompt,
      config,
      thinkingLevel,
      onTextChunk: params.onTextChunk,
      signal,
    });

    const processed = processHeartbeatResponse(result.response, {
      ackMaxChars: heartbeatConfig?.ackMaxChars,
    });

    return {
      status: "ran",
      response: processed.text,
      shouldDeliver: processed.shouldDeliver,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    };
  }
}

export type HeartbeatRunner = {
  /** Stop the heartbeat runner */
  stop: () => void;
  /** Trigger an immediate heartbeat */
  triggerNow: () => Promise<HeartbeatResult>;
  /** Check if runner is active */
  isActive: () => boolean;
};

/**
 * Start a heartbeat runner that periodically runs heartbeats.
 */
export function startHeartbeatRunner(params: {
  config?: ClawdConfig;
  heartbeatConfig?: HeartbeatConfig;
  /** Callback when a heartbeat runs */
  onHeartbeat?: (result: HeartbeatResult) => void | Promise<void>;
  /** Callback for streaming text during heartbeat */
  onTextChunk?: (text: string) => void;
  /** Abort signal to stop the runner */
  abortSignal?: AbortSignal;
}): HeartbeatRunner {
  const { config, heartbeatConfig, onHeartbeat, onTextChunk, abortSignal } =
    params;

  const intervalMs = resolveHeartbeatIntervalMs(heartbeatConfig);
  let timer: NodeJS.Timeout | null = null;
  let isRunning = false;
  let stopped = false;

  const runOnce = async (): Promise<HeartbeatResult> => {
    if (stopped) {
      return { status: "skipped", reason: "stopped" };
    }

    if (isRunning) {
      return { status: "skipped", reason: "already-running" };
    }

    isRunning = true;
    try {
      const result = await runHeartbeat({
        config,
        heartbeatConfig,
        onTextChunk,
        signal: abortSignal,
      });

      await onHeartbeat?.(result);
      return result;
    } finally {
      isRunning = false;
    }
  };

  // Start interval if enabled
  if (intervalMs && intervalMs > 0) {
    timer = setInterval(() => {
      runOnce().catch(() => {
        // Swallow errors in interval
      });
    }, intervalMs);
    timer.unref?.();
  }

  const stop = () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  // Handle abort signal
  abortSignal?.addEventListener("abort", stop, { once: true });

  return {
    stop,
    triggerNow: runOnce,
    isActive: () => !stopped && timer !== null,
  };
}
