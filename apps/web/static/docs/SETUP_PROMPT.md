# btca Setup Prompt

## Quick Copy-Paste Version

```
Set up btca for this project: scan package.json for major dependencies (frameworks, libraries, tools), suggest adding each as a btca resource with sensible defaults, then create a btca.config.jsonc file in the project root and update AGENTS.md with usage instructions. Ask me to confirm each resource before adding. Present defaults for repo URLs, branches, and search paths based on common patterns.
```

## Detailed Instructions

If your agent needs more context, use this expanded version:

---

Set up btca (Better Context) for this project by following these steps:

## Step 1: Scan Dependencies

Check package.json (or equivalent package manager files) and identify libraries/frameworks that would benefit from btca integration. Look for:

- **Frameworks**: Svelte, React, Vue, Next.js, Nuxt, SvelteKit, Remix, Astro
- **Backend**: Effect, Hono, Express, Fastify, tRPC
- **Styling**: Tailwind CSS, UnoCSS
- **Tooling**: TypeScript, Vite, esbuild, Bun
- **Syntax**: Shiki, Prism
- **Other major libraries**: Drizzle, Prisma, Zod, etc.

## Step 2: Suggest Resources

For each significant dependency you find, ask me one at a time:

> "I found [library name] in your dependencies. Would you like to add it as a btca resource? This would let you query [brief description of what you'd get - e.g., 'the official docs and source code' or 'API documentation and examples']."

Wait for my response before moving to the next one.

## Step 3: Gather Resource Details

For each resource I approve, you need the following information. **Suggest sensible defaults** based on common repository structures:

- **name**: Short identifier (e.g., "svelte", "effect", "tailwind")
- **type**: "git" (for remote repos) or "local" (for local directories)
- **url**: GitHub repository URL (required for git type)
  - Suggest the official docs repo or main repo
  - Examples:
    - Svelte: `https://github.com/sveltejs/svelte.dev`
    - Effect: `https://github.com/Effect-TS/effect`
    - Tailwind: `https://github.com/tailwindlabs/tailwindcss.com`
- **branch**: Git branch (default: "main", but some use "canary" like Next.js)
- **searchPath** (optional): Subdirectory to focus on
  - Examples: "docs", "apps/svelte.dev", "packages/core", "src/docs"
- **specialNotes** (optional): Special notes for the AI about the resource
  - Example: "This is the docs website repo. Focus on markdown files in the content directory."

**Present suggested defaults and let me confirm or modify them.**

## Step 4: Create Config File

Create a `btca.config.jsonc` file in the project root with this structure:

```jsonc
{
  "$schema": "https://btca.dev/btca.schema.json",
  "resources": [
    {
      "name": "svelte",
      "type": "git",
      "url": "https://github.com/sveltejs/svelte.dev",
      "branch": "main",
      "searchPath": "apps/svelte.dev",
      "specialNotes": "Svelte docs website. Focus on content directory for markdown docs."
    }
    // Add all approved resources here
  ],
  "model": "claude-haiku-4-5",
  "provider": "opencode"
}
```

**Important**: Only include approved resources. Each resource should be a complete object in the `resources` array.

## Step 5: Update AGENTS.md

Check if an `AGENTS.md` file exists in the project root:

- **If it exists**: Look for an existing `## btca` section and update it
- **If it doesn't exist**: Create `AGENTS.md` with the btca section

Add or update this section:

```markdown
## btca

When you need up-to-date information about technologies used in this project, use btca to query source repositories directly.

**Available resources**: [comma-separated list of all resource names from config]

### Usage

Ask a question about one or more resources:

\`\`\`bash
btca ask -r <resource> -q "<question>"
\`\`\`

Examples:

\`\`\`bash
# Single resource
btca ask -r svelte -q "How do stores work in Svelte 5?"

# Multiple resources  
btca ask -r svelte -r effect -q "How do I integrate Effect with Svelte?"

# Using @mentions in the question
btca ask -q "@svelte @tailwind How do I style components?"
\`\`\`

### Interactive Mode

Start a chat session for deeper exploration:

\`\`\`bash
btca chat -r svelte -r effect
\`\`\`

Or use the TUI:

\`\`\`bash
btca
\`\`\`

Then use `@mentions` to reference resources (e.g., "@svelte How do I create a store?")
```

## Step 6: Provide Summary

After completing the setup, show me:

1. **Configured resources** (list with name, type, and URL/path)
2. **Config file location** (absolute path)
3. **AGENTS.md status** (created or updated)
4. **Example commands** specific to my project's resources
5. **Next steps**:
   - "Run `btca config resources list` to verify your global btca config"
   - "Resources will be cloned to `~/.local/share/btca/resources/` on first use"
   - "Use `btca clear` to remove cached git repositories if needed"

---

## Instructions for Agent

**Behavior Guidelines**:

- Be conversational and interactive - don't assume what I want
- Present suggestions with sensible defaults, but always ask for confirmation
- Show me what you're about to write before writing it (especially the config)
- If I say "add [library]", ask for the details rather than guessing
- Don't add resources I haven't explicitly approved
- If `AGENTS.md` exists with a btca section, update it cleanly without duplication

**Technical Requirements**:

- Config file: `btca.config.jsonc` in project root
- Format: Valid JSON with comments (JSONC)
- Schema: Include the `$schema` field for validation
- Resources: Only include those I've approved
- Model defaults: `"claude-haiku-4-5"` with provider `"opencode"`

**Common Resource Patterns**:

| Library | Suggested URL | Branch | Search Path | Notes |
|---------|---------------|--------|-------------|-------|
| Svelte | github.com/sveltejs/svelte.dev | main | apps/svelte.dev | Docs website |
| Effect | github.com/Effect-TS/effect | main | - | Main repo |
| Tailwind | github.com/tailwindlabs/tailwindcss.com | main | src/docs | Docs website |
| Next.js | github.com/vercel/next.js | canary | docs | Next.js docs |
| Hono | github.com/honojs/hono | main | - | Main repo |

Use these as starting points, but always confirm with me first.
