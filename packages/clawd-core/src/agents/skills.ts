import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatSkillsForPrompt,
  loadSkillsFromDir,
  type Skill,
} from "@mariozechner/pi-coding-agent";
import type { ClawdConfig, SkillConfig } from "../config/types.js";
import { CONFIG_DIR, resolveUserPath } from "../utils/index.js";

export type SkillInstallSpec = {
  id?: string;
  kind: "brew" | "node" | "go" | "uv";
  label?: string;
  bins?: string[];
  formula?: string;
  package?: string;
  module?: string;
};

export type ClawdSkillMetadata = {
  always?: boolean;
  skillKey?: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  os?: string[];
  requires?: {
    bins?: string[];
    anyBins?: string[];
    env?: string[];
    config?: string[];
  };
  install?: SkillInstallSpec[];
};

type ParsedSkillFrontmatter = Record<string, string>;

export type SkillEntry = {
  skill: Skill;
  frontmatter: ParsedSkillFrontmatter;
  clawd?: ClawdSkillMetadata;
};

export type SkillSnapshot = {
  prompt: string;
  skills: Array<{ name: string; primaryEnv?: string }>;
  resolvedSkills?: Skill[];
};

function resolveBundledSkillsDir(): string | undefined {
  const override = process.env.CLAWD_BUNDLED_SKILLS_DIR?.trim();
  if (override) return override;

  try {
    const execDir = path.dirname(process.execPath);
    const sibling = path.join(execDir, "skills");
    if (fs.existsSync(sibling)) return sibling;
  } catch {
    // ignore
  }

  try {
    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    const root = path.resolve(moduleDir, "..", "..");
    const candidate = path.join(root, "skills");
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // ignore
  }

  return undefined;
}

function getFrontmatterValue(
  frontmatter: ParsedSkillFrontmatter,
  key: string,
): string | undefined {
  const raw = frontmatter[key];
  return typeof raw === "string" ? raw : undefined;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseFrontmatter(content: string): ParsedSkillFrontmatter {
  const frontmatter: ParsedSkillFrontmatter = {};
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---")) return frontmatter;
  const endIndex = normalized.indexOf("\n---", 3);
  if (endIndex === -1) return frontmatter;
  const block = normalized.slice(4, endIndex);
  for (const line of block.split("\n")) {
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const value = stripQuotes(match[2].trim());
    if (!key || !value) continue;
    frontmatter[key] = value;
  }
  return frontmatter;
}

function normalizeStringList(input: unknown): string[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

export function hasBinary(bin: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  for (const part of parts) {
    const candidate = path.join(part, bin);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      // keep scanning
    }
  }
  return false;
}

function resolveClawdMetadata(
  frontmatter: ParsedSkillFrontmatter,
): ClawdSkillMetadata | undefined {
  const raw = getFrontmatterValue(frontmatter, "metadata");
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { clawd?: unknown };
    if (!parsed || typeof parsed !== "object") return undefined;
    const clawd = (parsed as { clawd?: unknown }).clawd;
    if (!clawd || typeof clawd !== "object") return undefined;
    const clawdObj = clawd as Record<string, unknown>;
    const osRaw = normalizeStringList(clawdObj.os);
    return {
      always:
        typeof clawdObj.always === "boolean" ? clawdObj.always : undefined,
      emoji: typeof clawdObj.emoji === "string" ? clawdObj.emoji : undefined,
      homepage:
        typeof clawdObj.homepage === "string" ? clawdObj.homepage : undefined,
      skillKey:
        typeof clawdObj.skillKey === "string" ? clawdObj.skillKey : undefined,
      primaryEnv:
        typeof clawdObj.primaryEnv === "string"
          ? clawdObj.primaryEnv
          : undefined,
      os: osRaw.length > 0 ? osRaw : undefined,
    };
  } catch {
    return undefined;
  }
}

function resolveSkillKey(skill: Skill, entry?: SkillEntry): string {
  return entry?.clawd?.skillKey ?? skill.name;
}

export function resolveSkillConfig(
  config: ClawdConfig | undefined,
  skillKey: string,
): SkillConfig | undefined {
  const skills = config?.skills?.entries;
  if (!skills || typeof skills !== "object") return undefined;
  const entry = (skills as Record<string, SkillConfig | undefined>)[skillKey];
  if (!entry || typeof entry !== "object") return undefined;
  return entry;
}

function shouldIncludeSkill(params: {
  entry: SkillEntry;
  config?: ClawdConfig;
}): boolean {
  const { entry, config } = params;
  const skillKey = resolveSkillKey(entry.skill, entry);
  const skillConfig = resolveSkillConfig(config, skillKey);
  const osList = entry.clawd?.os ?? [];

  if (skillConfig?.enabled === false) return false;
  if (osList.length > 0 && !osList.includes(process.platform)) {
    return false;
  }
  if (entry.clawd?.always === true) {
    return true;
  }

  const requiredBins = entry.clawd?.requires?.bins ?? [];
  if (requiredBins.length > 0) {
    for (const bin of requiredBins) {
      if (!hasBinary(bin)) return false;
    }
  }

  const requiredEnv = entry.clawd?.requires?.env ?? [];
  if (requiredEnv.length > 0) {
    for (const envName of requiredEnv) {
      if (process.env[envName]) continue;
      if (skillConfig?.env?.[envName]) continue;
      if (skillConfig?.apiKey && entry.clawd?.primaryEnv === envName) {
        continue;
      }
      return false;
    }
  }

  return true;
}

function filterSkillEntries(
  entries: SkillEntry[],
  config?: ClawdConfig,
): SkillEntry[] {
  return entries.filter((entry) => shouldIncludeSkill({ entry, config }));
}

export function applySkillEnvOverrides(params: {
  skills: SkillEntry[];
  config?: ClawdConfig;
}) {
  const { skills, config } = params;
  const updates: Array<{ key: string; prev: string | undefined }> = [];

  for (const entry of skills) {
    const skillKey = resolveSkillKey(entry.skill, entry);
    const skillConfig = resolveSkillConfig(config, skillKey);
    if (!skillConfig) continue;

    if (skillConfig.env) {
      for (const [envKey, envValue] of Object.entries(skillConfig.env)) {
        if (!envValue || process.env[envKey]) continue;
        updates.push({ key: envKey, prev: process.env[envKey] });
        process.env[envKey] = envValue;
      }
    }

    const primaryEnv = entry.clawd?.primaryEnv;
    if (primaryEnv && skillConfig.apiKey && !process.env[primaryEnv]) {
      updates.push({ key: primaryEnv, prev: process.env[primaryEnv] });
      process.env[primaryEnv] = skillConfig.apiKey;
    }
  }

  return () => {
    for (const update of updates) {
      if (update.prev === undefined) delete process.env[update.key];
      else process.env[update.key] = update.prev;
    }
  };
}

function loadSkillEntries(
  workspaceDir: string,
  opts?: {
    config?: ClawdConfig;
    managedSkillsDir?: string;
    bundledSkillsDir?: string;
  },
): SkillEntry[] {
  const loadSkills = (params: { dir: string; source: string }): Skill[] => {
    const loaded = loadSkillsFromDir(params);
    if (Array.isArray(loaded)) return loaded;
    if (
      loaded &&
      typeof loaded === "object" &&
      "skills" in loaded &&
      Array.isArray((loaded as { skills?: unknown }).skills)
    ) {
      return (loaded as { skills: Skill[] }).skills;
    }
    return [];
  };

  const managedSkillsDir =
    opts?.managedSkillsDir ?? path.join(CONFIG_DIR, "skills");
  const workspaceSkillsDir = path.join(workspaceDir, "skills");
  const bundledSkillsDir = opts?.bundledSkillsDir ?? resolveBundledSkillsDir();
  const extraDirsRaw = opts?.config?.skills?.load?.extraDirs ?? [];
  const extraDirs = extraDirsRaw
    .map((d) => (typeof d === "string" ? d.trim() : ""))
    .filter(Boolean);

  const bundledSkills = bundledSkillsDir
    ? loadSkills({
        dir: bundledSkillsDir,
        source: "clawd-bundled",
      })
    : [];
  const extraSkills = extraDirs.flatMap((dir) => {
    const resolved = resolveUserPath(dir);
    return loadSkills({
      dir: resolved,
      source: "clawd-extra",
    });
  });
  const managedSkills = loadSkills({
    dir: managedSkillsDir,
    source: "clawd-managed",
  });
  const workspaceSkills = loadSkills({
    dir: workspaceSkillsDir,
    source: "clawd-workspace",
  });

  const merged = new Map<string, Skill>();
  for (const skill of extraSkills) merged.set(skill.name, skill);
  for (const skill of bundledSkills) merged.set(skill.name, skill);
  for (const skill of managedSkills) merged.set(skill.name, skill);
  for (const skill of workspaceSkills) merged.set(skill.name, skill);

  const skillEntries: SkillEntry[] = Array.from(merged.values()).map(
    (skill) => {
      let frontmatter: ParsedSkillFrontmatter = {};
      try {
        const raw = fs.readFileSync(skill.filePath, "utf-8");
        frontmatter = parseFrontmatter(raw);
      } catch {
        // ignore malformed skills
      }
      return {
        skill,
        frontmatter,
        clawd: resolveClawdMetadata(frontmatter),
      };
    },
  );
  return skillEntries;
}

export function buildWorkspaceSkillSnapshot(
  workspaceDir: string,
  opts?: {
    config?: ClawdConfig;
    managedSkillsDir?: string;
    bundledSkillsDir?: string;
    entries?: SkillEntry[];
  },
): SkillSnapshot {
  const skillEntries = opts?.entries ?? loadSkillEntries(workspaceDir, opts);
  const eligible = filterSkillEntries(skillEntries, opts?.config);
  const resolvedSkills = eligible.map((entry) => entry.skill);
  return {
    prompt: formatSkillsForPrompt(resolvedSkills),
    skills: eligible.map((entry) => ({
      name: entry.skill.name,
      primaryEnv: entry.clawd?.primaryEnv,
    })),
    resolvedSkills,
  };
}

export function loadWorkspaceSkillEntries(
  workspaceDir: string,
  opts?: {
    config?: ClawdConfig;
    managedSkillsDir?: string;
    bundledSkillsDir?: string;
  },
): SkillEntry[] {
  return loadSkillEntries(workspaceDir, opts);
}
