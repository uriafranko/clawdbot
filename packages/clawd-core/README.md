# Clawd Core

Standalone AI agent core extracted from Clawdbot. Includes:

- **Agent runner** with full conversation loop
- **Session management** and persistence
- **Workspace system** with bootstrap files (IDENTITY.md, SOUL.md, etc.)
- **Skills system** for extending agent capabilities
- **Core tools** (bash, file operations)

## Installation

```bash
npm install clawd-core
# or
pnpm add clawd-core
```

## Quick Start

### CLI Usage

```bash
# Initialize workspace (creates ~/clawd with bootstrap files)
clawd init

# Start interactive chat
clawd chat

# Send a single message
clawd agent -m "Hello, who are you?"

# List sessions
clawd sessions

# Reset current session
clawd reset
```

### Programmatic Usage

```typescript
import { runClawdAgent, loadConfig } from "clawd-core";

const config = loadConfig();

const result = await runClawdAgent({
  message: "Hello! Who are you?",
  config,
  onTextChunk: (text) => process.stdout.write(text),
  onToolUse: (name, input) => console.log(`[tool: ${name}]`),
});

console.log("Response:", result.response);
console.log("Session:", result.sessionKey);
```

## Workspace Files

The workspace (default: `~/clawd`) contains:

| File | Purpose |
|------|---------|
| `AGENTS.md` | Main workspace instructions |
| `IDENTITY.md` | Agent's name, creature type, vibe, emoji |
| `USER.md` | User's name, pronouns, timezone |
| `SOUL.md` | Persona, tone, boundaries |
| `TOOLS.md` | User notes about external tools |
| `HEARTBEAT.md` | Checklist for heartbeat runs |
| `BOOTSTRAP.md` | First-run ritual (deleted after onboarding) |

## Skills

Skills are markdown files that extend agent capabilities. Place them in:

- `~/clawd/skills/` (workspace skills)
- `~/.clawd/skills/` (managed skills)

Example skill (`~/clawd/skills/weather.md`):

```markdown
---
name: weather
description: Check weather for a location
---

# Weather Skill

You can check weather using the `curl` command:

\`\`\`bash
curl "wttr.in/London?format=3"
\`\`\`

Use this to answer weather-related questions.
```

## Configuration

Create `~/.clawd/clawd.json`:

```json
{
  "agent": {
    "workspace": "~/clawd",
    "model": {
      "provider": "anthropic",
      "model": "claude-sonnet-4-20250514"
    },
    "thinking": "medium",
    "bash": {
      "backgroundMs": 10000,
      "timeoutSec": 300
    }
  },
  "session": {
    "scope": "per-sender"
  }
}
```

## Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key
- `OPENAI_API_KEY` - OpenAI API key (if using OpenAI models)
- `CLAWD_STATE_DIR` - Override state directory (default: `~/.clawd`)
- `CLAWD_CONFIG_PATH` - Override config file path

## API Reference

### `runClawdAgent(params)`

Run the agent with a message.

```typescript
interface AgentRunnerParams {
  message: string;
  sessionKey?: string;
  config?: ClawdConfig;
  thinkingLevel?: "off" | "low" | "medium" | "high";
  onTextChunk?: (text: string) => void;
  onToolUse?: (name: string, input: unknown) => void;
  onToolResult?: (name: string, result: unknown) => void;
  signal?: AbortSignal;
}

interface AgentRunnerResult {
  response: string;
  sessionId: string;
  sessionKey: string;
  model?: string;
}
```

### `resetSession(params)`

Reset a session (clear history).

```typescript
await resetSession({ sessionKey: "my-session", config });
```

### `listSessions(params)`

List all sessions.

```typescript
const sessions = listSessions({ config });
// [{ sessionKey, sessionId, updatedAt }]
```

### `ensureAgentWorkspace(params)`

Initialize the workspace with bootstrap files.

```typescript
await ensureAgentWorkspace({
  dir: "~/clawd",
  ensureBootstrapFiles: true,
});
```

## License

MIT
