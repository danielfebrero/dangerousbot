# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DangerousBot is an autonomous, self-evolving AI assistant with a React TypeScript web interface. It can modify its own code, version changes via git, compile, and restart itself. Supports multiple AI providers (Claude Opus 4.5, Kimi, Mistral).

## Build & Run Commands

```bash
npm install          # Install dependencies
npm run build        # Build server + React client
npm run build:server # Build server only
npm run build:client # Build React client only
npm run dev          # Development mode (tsx)
npm run dev:client   # Watch mode for React client
npm start            # Production mode (runs dist/dangerousbot.js)
npm run start:daemon # Production daemon via start.sh
npm run setup        # Configure desktop shortcut or auto-start

# SearxNG web search (requires Docker)
npm run searxng:start   # Start SearxNG container
npm run searxng:stop    # Stop SearxNG container
npm run searxng:status  # Check status
npm run searxng:logs    # View logs
```

## Architecture

```
src/
├── main.ts              # Entry point - server startup, API key management
├── server/
│   ├── index.ts         # Express server + WebSocket integration
│   ├── routes.ts        # REST API endpoints (/api/*)
│   └── websocket.ts     # Real-time communication with frontend
├── core/
│   ├── brain.ts         # Claude API interface (Opus 4.5)
│   ├── memory.ts        # SQLite database (conversations, knowledge, embeddings)
│   ├── executor.ts      # Code execution (VM sandbox, shell, file ops)
│   ├── tools.ts         # Tool definitions and executor
│   ├── versioning.ts    # Git auto-commit on self-modification
│   ├── lifecycle.ts     # Single instance lock, restart, signal handlers
│   └── types.ts         # TypeScript interfaces
├── web/                 # React TypeScript frontend
│   ├── index.html       # HTML entry point
│   ├── index.tsx        # React entry point
│   ├── App.tsx          # Main React component
│   ├── types.ts         # Frontend types
│   ├── hooks/
│   │   └── useWebSocket.ts  # WebSocket hook
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx
│   │   ├── MessageInput.tsx
│   │   └── TypingIndicator.tsx
│   └── styles/
│       └── global.css
└── cli/
    └── setup.ts         # Desktop shortcut / auto-start configuration
```

## Key Concepts

### Self-Modification Flow
1. Bot uses `self_update` tool to edit source files
2. Changes are auto-committed via `versioning.ts`
3. Project is recompiled (`npm run build`) - both server AND client
4. Server restarts via `lifecycle.ts`

### Single Instance
- Lockfile at `~/.dangerousbot/dangerousbot.lock`
- New instance kills existing one before starting

### Memory (SQLite)

- Location: `data/dangerousbot.db` (project root)
- Tables: `conversations`, `embeddings`, `knowledge`, `config`, `code_embeddings`

### API Key Storage

- Priority: env var > `~/.dangerousbot/secrets/<provider>_api_key`
- Supported: `ANTHROPIC_API_KEY`, `KIMI_API_KEY`, `MISTRAL_API_KEY`

### Self-Update with Rollback

- `self_update` validates TypeScript, builds, commits, and triggers restart
- Automatic rollback on build failure via `RollbackManager`
- Backups stored in `.backups/` directory

### Code Embeddings (RAG)

- Uses Mistral embeddings for semantic code search
- `retrieve_code` tool queries the indexed codebase
- Automatic re-indexing after self-update

## AI Providers

| Provider | Model | Use Case |
| -------- | ----- | -------- |
| Claude (default) | Opus 4.5 | Primary brain |
| Kimi | Moonshot AI | Alternative with native web search |
| Mistral | Various | Consultation and code embeddings |

Switch providers at runtime via `switch_provider` tool.

## Development vs Production

| Aspect | Dev (`npm run dev`) | Prod (`npm start`) |
| ------ | ------------------- | ------------------ |
| Server restart on code change | Manual | Auto via lifecycle.ts |
| Client rebuild | Use `npm run dev:client` | Included in full build |
| Source | TypeScript (tsx) | Bundled JS (esbuild) |
| NODE_ENV | development | production |

## Available Tools

**File Operations:** `read_file`, `write_file`, `edit_file`, `list_files`, `delete_file`

**Execution:** `execute_code` (JS sandbox), `shell` (system commands)

**Memory:** `remember`, `recall` (long-term knowledge storage)

**Self-Evolution:** `self_update` (build + restart with rollback), `restart_server`

**AI Providers:** `switch_provider`, `consult_mistral`, `get_kimi_balance`

**Search:** `searxng_search` (self-hosted web search), `retrieve_code` (semantic codebase search)

**Task Management:** `todo` (projects and tasks with `create_project`, `create_task`, `complete_task`, etc.)

## WebSocket Protocol

Messages are JSON with `type` and `payload`:
- `user_message` - User sends text
- `bot_message` - Bot response
- `bot_typing` - Typing indicator
- `tool_use` / `tool_result` - Tool execution
- `system` / `error` - Status messages

## Build Output

```text
dist/
├── dangerousbot.js      # Bundled server
├── identity/            # Copied identity files
└── web/
    ├── index.html       # HTML entry
    ├── bundle.js        # Bundled React app
    └── styles/
        └── global.css
```
