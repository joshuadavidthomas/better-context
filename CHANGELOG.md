# Changelog

## Unreleased

### Features

- **Input History**: Navigate through previous inputs using up/down arrows in the TUI, just like standard terminal history. History persists across sessions. (#108)

- **REPL Mode (`--no-tui`)**: New `btca --no-tui` flag launches a simple REPL mode instead of the full TUI. Useful for Windows users or minimal terminal environments. (#105, #89)

- **`btca init` Command**: New command to initialize project configuration with optional `--local` flag for project-specific `.btca` directories. Automatically updates `.gitignore` when needed. (#81)

### Fixes

- **Gateway Provider Model Validation**: Fixed model validation failing for gateway providers like `opencode` that route to other providers' models (e.g., `claude-haiku-4-5`). (#109)

- **searchPath Validation**: Invalid `searchPath` configurations now fail fast with helpful error messages instead of silently falling back to incorrect directories. (#76)

- **Code Block Scrolling**: Fixed horizontal overflow on code blocks on the website - they now show scrollbars instead of truncating content. (#96)

- **OpenCode Instance Cleanup**: Added instance lifecycle management with tracking, cleanup endpoints, and proper resource management to prevent orphaned processes. (#99)
