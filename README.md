# OpenCode Memory

![OpenCode Memory Banner](.github/banner.png)

A persistent memory system for AI coding agents that enables long-term context retention across sessions using local vector database technology.

## Overview

OpenCode Memory provides AI coding agents with the ability to remember and recall information across conversations. It uses vector embeddings and SQLite for efficient storage and retrieval of contextual information.

## Key Features

- **Local Vector Database**: SQLite-based storage with sqlite-vec extension
- **Dual Memory Scopes**: Separate user-level and project-level memory contexts
- **Unified Timeline**: Browse memories and prompts together with linking support
- **Prompt-Memory Linking**: Bidirectional links between prompts and generated memories
- **User Learning System**: Analyzes user patterns and preferences from conversation history
- **Web Interface**: Full-featured UI for memory management and search
- **Auto-Capture System**: Intelligent prompt-based memory extraction
- **Multi-Provider AI**: Support for OpenAI, Anthropic, and OpenAI-compatible APIs
- **Flexible Embedding Models**: 12+ local models or OpenAI-compatible APIs
- **Smart Deduplication**: Prevents redundant memories using similarity detection
- **Privacy Protection**: Built-in content filtering for sensitive information

## Installation

Add the plugin to your OpenCode configuration:

**Location**: `~/.config/opencode/opencode.json` or `opencode.jsonc`

```jsonc
{
  "plugins": [
    "opencode-mem"
  ]
}
```

OpenCode will automatically download and install the plugin on next startup.

### Install from Source

```bash
git clone https://github.com/tickernelz/opencode-mem.git
cd opencode-mem
bun install
bun run build
```

## Quick Start

### Basic Usage

```typescript
memory({ mode: "add", content: "User prefers TypeScript", scope: "user" })
memory({ mode: "search", query: "coding preferences", scope: "user" })
memory({ mode: "profile" })
```

### Web Interface

Access at `http://127.0.0.1:4747` to browse memories, view prompt-memory links, and manage your memory database.

### Configuration

Configuration file: `~/.config/opencode/opencode-mem.jsonc`

```jsonc
{
  "storagePath": "~/.opencode-mem/data",
  "embeddingModel": "Xenova/nomic-embed-text-v1",
  "webServerEnabled": true,
  "webServerPort": 4747,
  "autoCaptureEnabled": true,
  "memoryProvider": "openai-chat",
  "memoryModel": "gpt-4",
  "memoryApiUrl": "https://api.openai.com/v1",
  "memoryApiKey": "sk-..."
}
```

## Breaking Changes (v2.0)

**Token-based auto-capture has been replaced with prompt-based system:**

- Removed: `autoCaptureTokenThreshold`, `autoCaptureMinTokens`, `autoCaptureMaxMemories`, `autoCaptureSummaryMaxLength`, `autoCaptureContextWindow`
- Added: `memoryProvider`, `userMemoryAnalysisInterval`, `autoCaptureMaxIterations`, `autoCaptureIterationTimeout`
- New behavior: Triggers on session idle, analyzes last uncaptured prompt
- Automatic skip logic for non-technical conversations
- Prompt-memory linking with cascade delete support

**Migration required**: Remove deprecated config options and add new ones.

## Documentation

For detailed documentation, see the [Wiki](https://github.com/tickernelz/opencode-mem/wiki):

- [Installation Guide](https://github.com/tickernelz/opencode-mem/wiki/Installation-Guide)
- [Quick Start](https://github.com/tickernelz/opencode-mem/wiki/Quick-Start)
- [Configuration Guide](https://github.com/tickernelz/opencode-mem/wiki/Configuration-Guide)
- [Memory Operations](https://github.com/tickernelz/opencode-mem/wiki/Memory-Operations)
- [Auto-Capture System](https://github.com/tickernelz/opencode-mem/wiki/Auto-Capture-System)
- [Web Interface](https://github.com/tickernelz/opencode-mem/wiki/Web-Interface)
- [Embedding Models](https://github.com/tickernelz/opencode-mem/wiki/Embedding-Models)
- [Performance Tuning](https://github.com/tickernelz/opencode-mem/wiki/Performance-Tuning)
- [Troubleshooting](https://github.com/tickernelz/opencode-mem/wiki/Troubleshooting)

## Features Overview

### Memory Scopes

- **User Scope**: Cross-project preferences, coding style, communication patterns
- **Project Scope**: Architecture decisions, technology stack, implementation details

### Auto-Capture System

Automatically extracts memories from conversations:

1. Triggers on session idle
2. Analyzes last uncaptured prompt and response
3. Links memory to source prompt
4. Skips non-technical conversations

### User Learning System

Analyzes batches of prompts to identify patterns (default: every 10 prompts):

- Coding style preferences
- Communication patterns
- Tool preferences
- Skill level indicators

### Web Interface

- Unified timeline of memories and prompts
- Visual prompt-memory link indicators
- Cascade delete for linked items
- Bulk operations
- Search and filters
- Maintenance tools (cleanup, deduplication)

## API Reference

### Memory Tool

```typescript
memory({ mode: "add", content: "...", scope: "user|project" })
memory({ mode: "search", query: "...", scope: "user|project" })
memory({ mode: "list", scope: "user|project", limit: 10 })
memory({ mode: "profile" })
memory({ mode: "forget", memoryId: "..." })
memory({ mode: "auto-capture-toggle" })
memory({ mode: "auto-capture-stats" })
memory({ mode: "capture-now" })
```

### REST API

- `GET /api/memories?scope=project&includePrompts=true` - List memories/prompts
- `POST /api/memories` - Create memory
- `PUT /api/memories/:id` - Update memory
- `DELETE /api/memories/:id?cascade=true` - Delete memory (and linked prompt)
- `DELETE /api/prompts/:id?cascade=true` - Delete prompt (and linked memory)
- `POST /api/search` - Vector search
- `POST /api/cleanup` - Run cleanup
- `POST /api/deduplicate` - Run deduplication

## Development

```bash
bun install
bun run dev
bun run build
bun run format
bun run typecheck
```

## License

MIT License - see LICENSE file for details

## Acknowledgments

Inspired by [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory)

## Links

- **Repository**: https://github.com/tickernelz/opencode-mem
- **Wiki**: https://github.com/tickernelz/opencode-mem/wiki
- **Issues**: https://github.com/tickernelz/opencode-mem/issues
- **OpenCode Platform**: https://opencode.ai
