import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    return path.resolve(trimmed.replace("~", os.homedir()));
  }
  return path.resolve(trimmed);
}

export function resolveConfigDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const override = env.CLAWD_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  return path.join(homedir(), ".clawd");
}

export function resolveHomeDir(): string | undefined {
  const envHome = process.env.HOME?.trim();
  if (envHome) return envHome;
  const envProfile = process.env.USERPROFILE?.trim();
  if (envProfile) return envProfile;
  try {
    const home = os.homedir();
    return home?.trim() ? home : undefined;
  } catch {
    return undefined;
  }
}

export function shortenHomePath(input: string): string {
  if (!input) return input;
  const home = resolveHomeDir();
  if (!home) return input;
  if (input === home) return "~";
  if (input.startsWith(`${home}/`)) return `~${input.slice(home.length)}`;
  return input;
}

export async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Configuration root; can be overridden via CLAWD_STATE_DIR.
export const CONFIG_DIR = resolveConfigDir();
