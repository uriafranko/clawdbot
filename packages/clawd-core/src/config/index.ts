import fs from "node:fs";
import path from "node:path";
import JSON5 from "json5";
import { CONFIG_DIR, resolveUserPath } from "../utils/index.js";
import type { ClawdConfig } from "./types.js";

export * from "./types.js";

const CONFIG_FILENAME = "clawd.json";

export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.CLAWD_CONFIG_PATH?.trim();
  if (override) return resolveUserPath(override);
  return path.join(CONFIG_DIR, CONFIG_FILENAME);
}

export function loadConfig(configPath?: string): ClawdConfig {
  const resolved = configPath ?? resolveConfigPath();
  try {
    const raw = fs.readFileSync(resolved, "utf-8");
    const parsed = JSON5.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as ClawdConfig;
    }
  } catch {
    // Config doesn't exist or is invalid - return empty
  }
  return {};
}

export async function saveConfig(
  config: ClawdConfig,
  configPath?: string,
): Promise<void> {
  const resolved = configPath ?? resolveConfigPath();
  await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
  const json = JSON.stringify(config, null, 2);
  await fs.promises.writeFile(resolved, json, "utf-8");
}
