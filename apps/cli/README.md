# @btca/cli

CLI tool for asking questions about technologies using the btca server.

## Installation

### From npm (Recommended)

```bash
bun add -g @btca/cli
```

### From source

```bash
git clone https://github.com/davis7dotsh/better-context.git
cd better-context
bun install
bun run --filter=@btca/cli build
```

## Usage

### Interactive TUI (Default)

Launch the interactive terminal UI:

```bash
btca
```

Use `@mentions` to reference resources:

- Type `@svelte How do I create a store?` to ask about Svelte
- Use multiple mentions: `@react @typescript How do I type props?`

### One-shot Question

Ask a single question and exit:

```bash
btca ask -r svelte -q "How do I create a reactive store?"
```

Options:

- `-r, --resource <name...>` - Resources to search (can specify multiple)
- `-q, --question <text>` - Question to ask (required)

Examples:

```bash
# Single resource
btca ask -r svelte -q "How do signals work?"

# Multiple resources
btca ask -r react -r typescript -q "How do I type useState?"

# Using @mentions in question
btca ask -q "@svelte @tailwind How do I style components?"
```

### OpenCode TUI Session

Start an interactive OpenCode session with resource context:

```bash
btca chat -r svelte -r effect
```

## Configuration

btca uses a config file at `~/.config/btca/btca.config.jsonc`. Manage configuration via CLI commands.

### Set Model

```bash
btca config model -p opencode -m claude-haiku-4-5
```

### List Resources

```bash
btca config resources list
```

### Add Resource

```bash
# Add a git repository
btca config resources add -n effect -t git -u https://github.com/Effect-TS/effect -b main

# Add with search path (focus on specific subdirectory)
btca config resources add -n svelte -t git -u https://github.com/sveltejs/svelte.dev -b main --search-path apps/svelte.dev

# Add a local directory
btca config resources add -n myproject -t local --path /path/to/project
```

### Remove Resource

```bash
btca config resources remove -n effect
```

### Clear Cached Resources

Clear all locally cloned git repositories:

```bash
btca clear
```

### Server Options

```bash
# Use an existing btca server
btca --server http://localhost:3000

# Specify port for auto-started server
btca --port 3001
```

## TUI Commands

In the interactive TUI, use `/` to access commands:

- `/clear` - Clear chat history
- `/model` - Select from recommended models
- `/add` - Add a new resource

## Keyboard Shortcuts

- `Enter` - Send message
- `Escape` - Cancel streaming response (press twice to confirm)
- `Ctrl+C` - Clear input or quit
- `Ctrl+Q` - Quit
- `Tab` - Autocomplete commands/mentions
- `Up/Down` - Navigate palettes

## Requirements

- [Bun](https://bun.sh) >= 1.1.0
- A running btca server (auto-started by default)

## License

MIT
