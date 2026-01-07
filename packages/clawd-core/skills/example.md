---
name: example
description: Example skill demonstrating the skill format
---

# Example Skill

This is an example skill that demonstrates the Clawd skill format.

## How to Use

Skills are markdown files that extend the agent's knowledge and capabilities.
They are automatically loaded from:

- `~/clawd/skills/` (workspace skills)
- `~/.clawd/skills/` (managed skills)

## Skill Frontmatter

The YAML frontmatter at the top defines:

- `name`: Unique skill identifier
- `description`: Brief description shown to the agent

## Creating Your Own Skills

1. Create a new `.md` file in your skills directory
2. Add frontmatter with `name` and `description`
3. Write instructions, examples, and context for the agent

Example skill for a project:

```markdown
---
name: my-project
description: Context for the My Project codebase
---

# My Project

## Structure
- `src/` - Source code
- `tests/` - Test files
- `docs/` - Documentation

## Key Commands
- `npm run dev` - Start development server
- `npm test` - Run tests

## Coding Conventions
- Use TypeScript strict mode
- Follow ESLint rules
- Write tests for new features
```

The agent will use this context when working on related tasks.
