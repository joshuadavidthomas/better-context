# btca init + btca add Refactor Plan

Date: 2026-01-25

## Goals

- Update `btca init` to offer two setup paths:
  - **MCP (cloud hosted resources)**
  - **CLI (local resources)**
- For **MCP**, do **not** create `btca.config.jsonc` for now.
- For **CLI**, create `btca.config.jsonc`, update `AGENTS.md`, and update `.gitignore`.
- Provide next-step instructions tailored to the chosen path:
  - **MCP:** point user to the MCP dashboard.
  - **CLI:** confirm setup is complete and suggest next actions.
- Add a new top-level `btca add` command that:
  - Accepts a **GitHub URL only** (e.g. `btca add https://github.com/owner/repo`).
  - Prefills fields inferred from GitHub metadata.
  - Uses an interactive terminal wizard so the user can confirm/edit each field.
  - Writes to **project config** by default, or **global config** with `-g`.

## Scope Overview

- **CLI:** `apps/cli`
- No changes to server APIs required (use existing config/resources plumbing).
- `btca init` becomes a guided setup; `btca add` becomes a guided resource wizard.

---

## 1) `btca init` Refactor

### UX Flow

1. User runs `btca init` (no flags).
2. Prompt:
   - “Choose setup type:”
     - `1) MCP (cloud hosted resources)`
     - `2) CLI (local resources)`
3. Based on selection:

#### MCP Path (cloud hosted resources)

- **Do not** create `btca.config.jsonc` for now.
- Update `AGENTS.md` to include the MCP instructions section.
- Update `.gitignore` (only if needed; no `.btca` for MCP).
- Print next steps:
  - “Get your MCP API key from the dashboard: https://btca.dev/app/settings/mcp/”
  - “Configure your MCP client with the Better Context endpoint.”

#### CLI Path (local resources)

- Create `btca.config.jsonc` with default model/provider + empty `resources`.
- Update `AGENTS.md` with the CLI instructions section (existing btca section or insert).
- Update `.gitignore` if `.btca` local data dir is used (current behavior).
- Print next steps:
  - “btca config resources add …”
  - “btca ask -r <resource> -q …”
  - Confirm setup is complete.

### Implementation Notes

- **Command file:** `apps/cli/src/commands/init.ts`
- Replace the current `--local` flow with an interactive selection.
- Keep `--force` behavior for config overwrite (CLI path only).
- For MCP path, `--force` should not be necessary (no config file created).
- If a config file already exists:
  - CLI path: warn and require `--force` to overwrite.
  - MCP path: do not overwrite; still update `AGENTS.md` and show next steps.

### Output Text

- Ensure output uses explicit next steps and the MCP dashboard link.
- Add a short “Setup complete” confirmation message for CLI path.

---

## 2) `btca add` Wizard (new command)

### UX Flow

Command:

```
btca add https://github.com/owner/repo
```

Optional global:

```
btca add -g https://github.com/owner/repo
```

Wizard Steps (prompts should allow edit/confirm):

1. **URL** (prefilled from arg)
2. **Name** (default = repo name, e.g. `repo`)
3. **Branch** (default = repo default branch; fallback to `main` if unknown)
4. **Search paths** (optional; allow empty)
5. **Notes** (optional)
6. **Confirm summary** → write to config

### Behavior

- Accept only GitHub URLs for now; validate and error clearly otherwise.
- Use GitHub URL parsing to infer `owner/repo` and default name.
- Attempt to resolve default branch if possible (if not, default `main`).
- Use existing “add resource” plumbing (current `btca config resources add` flow).
- `-g` writes to `~/.config/btca/btca.config.jsonc` (global) instead of project config.

### Implementation Notes

- **New command file:** `apps/cli/src/commands/add.ts` (or inline in `apps/cli/src/index.ts`)
- **Config writing path:** reuse existing config helpers (if present) or create new helper to write config for project/global.
- **Prompting:** use Node readline or existing prompt utilities if available.
- **Validation:** GitHub URL parser should handle:
  - `https://github.com/owner/repo`
  - `https://github.com/owner/repo.git`

---

## 3) AGENTS.md Updates

### MCP Section (to insert when MCP path chosen)

```
## Better Context MCP

Use Better Context MCP for documentation/resource questions when you need source‑first answers.

**Required workflow**
1. Call `listResources` first to see available resources.
2. Call `ask` with your question and the exact resource `name` values from step 1.

**Rules**
- Always call `listResources` before `ask`.
- `ask` requires at least one resource in the `resources` array.
- Use only resource names returned by `listResources`.
- Include only resources relevant to the question.

**Common errors**
- “Invalid resources” → re-run `listResources` and use exact names.
- “Instance is provisioning / error state” → wait or retry after a minute.
- “Missing or invalid Authorization header” → MCP auth is invalid; fix it in `https://btca.dev/app/settings/mcp/`.
```

### CLI Section

- Use existing CLI section content (current `AGENTS.md` btca section) or template from `apps/web/src/lib/assets/docs/example-AGENTS-section.md`.
- Ensure it documents `btca ask` usage and where the config lives.

---

## 4) Questions / Follow-ups

- Should the CLI setup path still support `--local` to use `.btca` data directory, or should it default to global data always?
- For `btca add`, do we want to support multiple search paths via repeated prompt entries or comma-separated input?
- Should `btca add` automatically call `btca init` if no config exists in project path?

