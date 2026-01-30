# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DangerousBot is an autonomous, self-evolving AI assistant with a React TypeScript web interface. It can modify its own code, version changes via git, compile, and restart itself. Powered by Claude Opus 4.5.

## Build & Run Commands

```bash
npm install          # Install dependencies
npm run build        # Build server + React client
npm run build:server # Build server only
npm run build:client # Build React client only
npm run dev          # Development mode (nodemon + ts-node)
npm run dev:client   # Watch mode for React client
npm start            # Production mode (runs dist/dangerousbot.js)
npm run setup        # Configure desktop shortcut or auto-start
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
- Location: `~/.dangerousbot/data/dangerousbot.db`
- Tables: `conversations`, `embeddings` (prepared for future), `knowledge`, `config`

### API Key Storage
- Priority: `ANTHROPIC_API_KEY` env var > `~/.dangerousbot/secrets/anthropic_api_key`

## Development vs Production

| Aspect | Dev (`npm run dev`) | Prod (`npm start`) |
|--------|---------------------|-------------------|
| Server restart on code change | Manual (nodemon) | Auto via lifecycle.ts |
| Client rebuild | Use `npm run dev:client` | Included in full build |
| Source | TypeScript (ts-node) | Bundled JS (esbuild) |
| NODE_ENV | development | production |

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
