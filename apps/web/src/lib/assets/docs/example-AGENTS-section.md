## btca

When you need up-to-date information about technologies used in this project, use btca to query source repositories directly.

**Available resources**: svelte, effect, tailwindcss, myproject

### Usage

Ask a question about one or more resources:

```bash
btca ask -r <resource> -q "<question>"
```

Examples:

```bash
# Single resource
btca ask -r svelte -q "How do stores work in Svelte 5?"

# Multiple resources
btca ask -r svelte -r effect -q "How do I integrate Effect with Svelte?"

# Using @mentions in the question
btca ask -q "@svelte @tailwind How do I style components?"
```

### Interactive Mode

Start a chat session for deeper exploration:

```bash
btca chat -r svelte -r effect
```

Or use the TUI:

```bash
btca
```

Then use `@mentions` to reference resources (e.g., "@svelte How do I create a store?")

### Configuration

This project's btca resources are configured in `btca.config.jsonc` at the project root. To modify:

- Edit the config file directly, or
- Use `btca config resources add/remove` commands

Resources will be cloned to `~/.local/share/btca/resources/` on first use.
