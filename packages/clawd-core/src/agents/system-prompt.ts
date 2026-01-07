import type { ThinkLevel } from "../config/types.js";

export function buildAgentSystemPromptAppend(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  extraSystemPrompt?: string;
  toolNames?: string[];
  userTimezone?: string;
  userTime?: string;
  runtimeInfo?: {
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
  };
}) {
  const toolSummaries: Record<string, string> = {
    read: "Read file contents",
    write: "Create or overwrite files",
    edit: "Make precise edits to files",
    grep: "Search file contents for patterns",
    find: "Find files by glob pattern",
    ls: "List directory contents",
    bash: "Run shell commands",
    process: "Manage background bash sessions",
  };

  const toolOrder = [
    "read",
    "write",
    "edit",
    "grep",
    "find",
    "ls",
    "bash",
    "process",
  ];

  const normalizedTools = (params.toolNames ?? [])
    .map((tool) => tool.trim().toLowerCase())
    .filter(Boolean);
  const availableTools = new Set(normalizedTools);
  const extraTools = Array.from(
    new Set(normalizedTools.filter((tool) => !toolOrder.includes(tool))),
  );
  const enabledTools = toolOrder.filter((tool) => availableTools.has(tool));
  const disabledTools = toolOrder.filter((tool) => !availableTools.has(tool));
  const toolLines = enabledTools.map((tool) => {
    const summary = toolSummaries[tool];
    return summary ? `- ${tool}: ${summary}` : `- ${tool}`;
  });
  for (const tool of extraTools.sort()) {
    toolLines.push(`- ${tool}`);
  }

  const thinkHint =
    params.defaultThinkLevel && params.defaultThinkLevel !== "off"
      ? `Default thinking level: ${params.defaultThinkLevel}.`
      : "Default thinking level: off.";

  const extraSystemPrompt = params.extraSystemPrompt?.trim();
  const userTimezone = params.userTimezone?.trim();
  const userTime = params.userTime?.trim();
  const runtimeInfo = params.runtimeInfo;
  const runtimeLines: string[] = [];
  if (runtimeInfo?.host) runtimeLines.push(`Host: ${runtimeInfo.host}`);
  if (runtimeInfo?.os) {
    const archSuffix = runtimeInfo.arch ? ` (${runtimeInfo.arch})` : "";
    runtimeLines.push(`OS: ${runtimeInfo.os}${archSuffix}`);
  } else if (runtimeInfo?.arch) {
    runtimeLines.push(`Arch: ${runtimeInfo.arch}`);
  }
  if (runtimeInfo?.node) runtimeLines.push(`Node: ${runtimeInfo.node}`);
  if (runtimeInfo?.model) runtimeLines.push(`Model: ${runtimeInfo.model}`);

  const lines = [
    "You are Clawd, a personal AI assistant.",
    "",
    "## Tooling",
    "Tool availability:",
    toolLines.length > 0
      ? toolLines.join("\n")
      : [
          "Standard tools are available:",
          "- read: read file contents",
          "- write: create or overwrite files",
          "- edit: make precise edits to files",
          "- grep: search file contents for patterns",
          "- find: find files by glob pattern",
          "- ls: list directory contents",
          "- bash: run shell commands (supports background via yieldMs/background)",
          "- process: manage background bash sessions",
        ].join("\n"),
    disabledTools.length > 0
      ? `Unavailable tools (do not call): ${disabledTools.join(", ")}`
      : "",
    "",
    "## Workspace",
    `Your working directory is: ${params.workspaceDir}`,
    "Treat this directory as the workspace for file operations unless explicitly instructed otherwise.",
    "",
    "## Workspace Files (injected)",
    "These user-editable files are loaded and included below in Project Context:",
    "- AGENTS.md: Main workspace instructions",
    "- IDENTITY.md: Your agent identity",
    "- USER.md: User profile",
    "- SOUL.md: Persona and boundaries",
    "- TOOLS.md: User notes about tools",
    "",
    userTimezone || userTime ? "## Time" : "",
    userTimezone ? `User timezone: ${userTimezone}` : "",
    userTime ? `Current user time: ${userTime}` : "",
    userTimezone || userTime ? "" : "",
  ];

  if (extraSystemPrompt) {
    lines.push("## Additional Context", extraSystemPrompt, "");
  }

  lines.push("## Runtime", ...runtimeLines, thinkHint);

  return lines.filter(Boolean).join("\n");
}
