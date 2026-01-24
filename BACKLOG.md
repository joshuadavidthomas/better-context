# Better Context (btca) - Issue Backlog

This document contains issues that are deferred for future development.

---

## Issue #91: Sub-agent mode filtering

**GitHub Issue:** https://github.com/davis7dotsh/better-context/issues/91

**Problem Summary:**
When btca is used as a sub-agent in an agentic workflow, the LLM's reasoning traces and tool calls pollute the primary agent's context, increasing token costs and making outputs harder to parse.

**Impact:** Medium - Important for agentic workflows

**High-Level Solution:**

1. Add CLI flags: `--hide-reasoning`, `--hide-tool-calls`, or `--subagent-mode`
2. Filter stream events before output based on flags
3. Use existing `packages/shared/src/stream-filter.ts` utilities
4. Default: show everything; subagent mode: final answer only

**Estimated Effort:** Medium (4-8 hours)

**Key Files:**

- `apps/cli/src/commands/ask.ts`
- `packages/shared/src/stream-filter.ts`
- `apps/server/src/agent/service.ts` (event handling)

---

## Issue #63: Session resume

**GitHub Issue:** https://github.com/davis7dotsh/better-context/issues/63

**Problem Summary:**
Users cannot list or resume previous `btca chat` sessions. Each session is ephemeral and lost when the CLI exits.

**Impact:** Medium - Quality of life improvement

**High-Level Solution:**

1. Add session persistence to `~/.local/share/btca/sessions/`
2. Store: session ID, messages, resources, timestamps
3. Add commands: `btca sessions list`, `btca sessions resume <id>`
4. Port schema concepts from web app's Convex implementation

**Estimated Effort:** Medium-Large (8-16 hours)

**Key Files:**

- `apps/cli/src/tui/context/messages-context.tsx`
- `apps/cli/src/commands/` (new sessions command)
- `apps/web/src/convex/threads.ts` (reference implementation)

---

## Issue #94, #97, #93: OpenCode Integration Features

**GitHub Issues:**

- https://github.com/davis7dotsh/better-context/issues/94 (btca opencode tool/plugin)
- https://github.com/davis7dotsh/better-context/issues/97 (custom tool configuration)
- https://github.com/davis7dotsh/better-context/issues/93 (external file read allowlist)

**Problem Summary:**
These three issues relate to deeper OpenCode integration:

- #94: Create official btca tool for OpenCode agents
- #97: Allow users to enable/disable custom tools in btca's OpenCode instance
- #93: Allow btca to read files outside the collection (e.g., config files)

**Impact:** Medium - Power user features

**High-Level Solutions:**

**#94 - btca OpenCode tool:**

1. Create tool script template at `.config/opencode/tools/btca.ts`
2. Implement actions: list, ask, add
3. Document integration patterns

**#97 - Custom tool configuration:**

1. Add `opencode.tools` and `opencode.permission` to config schema
2. Merge user config into `buildOpenCodeConfig()`
3. Add CLI flags for ephemeral overrides

**#93 - External file allowlist:**

1. Add `externalReadAllowlist` config option
2. Modify permission handling in agent config
3. Default deny, explicit allowlist for security

**Estimated Effort:** Medium (4-8 hours each)

**Key Files:**

- `apps/server/src/agent/service.ts`
- `apps/server/src/config/index.ts`
- Config schema files

---

## Issue #101: Missing linux-arm64 binary

**GitHub Issue:** https://github.com/davis7dotsh/better-context/issues/101

**Problem Summary:**
btca fails to run in Alpine Linux ARM64 Docker containers because the `btca-linux-arm64` binary is not included in the distribution.

**Impact:** Medium - Blocks containerized deployments on ARM64

**High-Level Solution:**

1. Update build scripts to include ARM64 Linux target
2. Or: Document that Alpine (musl) is not supported, recommend glibc-based images
3. Or: Provide instructions for building from source in containers

**Estimated Effort:** Small (1-2 hours if just build config)

**Key Files:**

- `package.json` (build scripts)
- Build/release configuration

---

## Issue #90: Windows local file paths

**GitHub Issue:** https://github.com/davis7dotsh/better-context/issues/90

**Problem Summary:**
Local file paths don't work correctly on Windows (e.g., `E:\GitHub\...`).

**Impact:** Medium - Blocks Windows users with local resources

**High-Level Solution:**

1. Normalize paths using `path.normalize()` and `path.resolve()`
2. Handle Windows drive letters and backslashes
3. Test local resource configuration on Windows

**Estimated Effort:** Small-Medium (2-4 hours)

**Key Files:**

- `apps/server/src/config/index.ts`
- `apps/server/src/resources/impls/local.ts`

---

## Priority Matrix

| Issue                   | Effort      | Impact | Priority Score |
| ----------------------- | ----------- | ------ | -------------- |
| #91 (sub-agent)         | Medium      | Medium | Medium         |
| #63 (sessions)          | Large       | Medium | Medium         |
| #94/97/93 (OC features) | Medium each | Medium | Medium         |
| #101 (linux-arm64)      | Small       | Medium | Medium         |
| #90 (Windows paths)     | Small       | Medium | Medium         |

---

## Completed Issues

The following issues have been addressed:

- **#99**: OpenCode instance cleanup - ✅ DONE
- **#76**: searchPath validation - ✅ DONE
- **#81**: .btca folder improvements / btca init - ✅ DONE
- **#96**: Code block scroll on website - ✅ DONE
- **#109**: Model validation for opencode gateway - ✅ DONE
- **#105/#89**: Windows TUI issues (--no-tui flag) - ✅ DONE
- **#108**: Input history - ✅ DONE
