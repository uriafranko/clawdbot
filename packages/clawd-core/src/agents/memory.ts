/**
 * Daily memory log system.
 * Reads memory/YYYY-MM-DD.md files from the workspace on session start.
 */

import fs from "node:fs";
import path from "node:path";

export const MEMORY_DIR_NAME = "memory";

/**
 * Format a date as YYYY-MM-DD for memory log filenames.
 */
export function formatDateForMemory(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get memory log file path for a specific date.
 */
export function getMemoryLogPath(workspaceDir: string, date: Date): string {
  const filename = `${formatDateForMemory(date)}.md`;
  return path.join(workspaceDir, MEMORY_DIR_NAME, filename);
}

/**
 * Read a memory log file if it exists.
 * Returns undefined if the file doesn't exist.
 */
export async function readMemoryLog(
  workspaceDir: string,
  date: Date,
): Promise<string | undefined> {
  const logPath = getMemoryLogPath(workspaceDir, date);
  try {
    const content = await fs.promises.readFile(logPath, "utf-8");
    return content.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write content to a memory log file.
 * Creates the memory directory if it doesn't exist.
 */
export async function writeMemoryLog(
  workspaceDir: string,
  date: Date,
  content: string,
): Promise<void> {
  const memoryDir = path.join(workspaceDir, MEMORY_DIR_NAME);
  await fs.promises.mkdir(memoryDir, { recursive: true });
  const logPath = getMemoryLogPath(workspaceDir, date);
  await fs.promises.writeFile(logPath, content, "utf-8");
}

/**
 * Append content to a memory log file.
 * Creates the file and directory if they don't exist.
 */
export async function appendMemoryLog(
  workspaceDir: string,
  date: Date,
  content: string,
): Promise<void> {
  const memoryDir = path.join(workspaceDir, MEMORY_DIR_NAME);
  await fs.promises.mkdir(memoryDir, { recursive: true });
  const logPath = getMemoryLogPath(workspaceDir, date);

  let existing = "";
  try {
    existing = await fs.promises.readFile(logPath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const newContent = existing ? `${existing.trimEnd()}\n\n${content}` : content;

  await fs.promises.writeFile(logPath, newContent, "utf-8");
}

export type DailyMemoryLogs = {
  /** Today's memory log content */
  today?: string;
  /** Yesterday's memory log content */
  yesterday?: string;
  /** Combined content for context injection */
  combined: string;
  /** Paths that were checked */
  paths: {
    today: string;
    yesterday: string;
  };
};

/**
 * Load daily memory logs (today + yesterday) from workspace.
 * This should be called on session start to provide context to the agent.
 */
export async function loadDailyMemoryLogs(
  workspaceDir: string,
  nowFn: () => Date = () => new Date(),
): Promise<DailyMemoryLogs> {
  const now = nowFn();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const todayPath = getMemoryLogPath(workspaceDir, now);
  const yesterdayPath = getMemoryLogPath(workspaceDir, yesterday);

  const [todayContent, yesterdayContent] = await Promise.all([
    readMemoryLog(workspaceDir, now),
    readMemoryLog(workspaceDir, yesterday),
  ]);

  const parts: string[] = [];

  if (yesterdayContent) {
    parts.push(
      `## Yesterday's Memory (${formatDateForMemory(yesterday)})\n${yesterdayContent}`,
    );
  }

  if (todayContent) {
    parts.push(
      `## Today's Memory (${formatDateForMemory(now)})\n${todayContent}`,
    );
  }

  return {
    today: todayContent,
    yesterday: yesterdayContent,
    combined: parts.length > 0 ? parts.join("\n\n") : "",
    paths: {
      today: todayPath,
      yesterday: yesterdayPath,
    },
  };
}

/**
 * List all memory log files in the workspace.
 * Returns dates in descending order (newest first).
 */
export async function listMemoryLogs(
  workspaceDir: string,
): Promise<Array<{ date: string; path: string }>> {
  const memoryDir = path.join(workspaceDir, MEMORY_DIR_NAME);

  try {
    const files = await fs.promises.readdir(memoryDir);
    const logs = files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => ({
        date: f.replace(".md", ""),
        path: path.join(memoryDir, f),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return logs;
  } catch {
    return [];
  }
}

/**
 * Build context files for memory logs.
 * Returns an array suitable for contextFiles parameter.
 */
export function buildMemoryContextFiles(
  logs: DailyMemoryLogs,
): Array<{ path: string; content: string }> {
  if (!logs.combined) return [];

  return [
    {
      path: "DAILY_MEMORY.md",
      content: `# Daily Memory Logs\n\n${logs.combined}`,
    },
  ];
}
