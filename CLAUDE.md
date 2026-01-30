# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DangerousBot is an autonomous, self-evolving AI assistant powered by the Claude API. It can modify its own code, execute shell commands, manage files, and restart itself after modifications. Written in TypeScript/Node.js.

## Build & Run Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Development mode (CLI via ts-node)
npm start            # Production mode (build + run CLI)
npm run launcher     # Start with auto-repair on errors
npm run launcher:dev # Launcher in development mode
npm run capsule      # Electron GUI mode
```

## Architecture

### Core Modules (`src/core/`)

- **brain.ts** - Claude API interface. Manages conversation history, tool calling, and memory export/import. Uses `claude-opus-4-5-20251101` model.
- **executor.ts** - Code execution engine:
  - `executeInMemory()` - Sandboxed JS via Node's `vm` module (30s timeout)
  - `executeFile()` - Runs code via temp file in `/tmp` (auto-cleanup)
  - `shell()` - Shell command execution
  - File operations (read/write/list/copy/move/delete)
- **system.ts** - System environment analysis (OS info, available tools, disk space, network status)
- **secrets-manager.ts** - API key management stored in `~/.dangerousbot/secrets/`
- **error-analyzer.ts** - Uses Claude Sonnet to diagnose startup errors and propose auto-repairs
- **types.ts** - TypeScript interfaces for all core types

### Entry Points

- **start.ts** - CLI interactive mode with readline interface
- **launcher.ts** - Wrapper that auto-repairs startup errors (max 3 attempts)
- **app/main.ts** - Electron main process for GUI mode

### Data & Identity

- `identity/instructions.md` - Bot personality and behavioral instructions (system prompt)
- `data/memory.json` - Persistent conversation history
- `~/.dangerousbot/secrets/anthropic_api_key` - Stored API key

## API Key Configuration

Priority order:
1. `ANTHROPIC_API_KEY` environment variable
2. File at `~/.dangerousbot/secrets/anthropic_api_key`
3. Interactive prompt on first run

## Available Tools (in bot runtime)

The bot has access to: `execute_code`, `shell_command`, `read_file`, `write_file`, `edit_file`, `list_files`, `ask_user`, `get_config`, `restart`

## Key Patterns

- All file paths in Executor resolve relative to home directory or accept absolute paths
- Memory is saved after each tool execution and user interaction
- The bot can restart itself after code modifications via the `restart` tool
- ErrorAnalyzer returns JSON-formatted repair instructions with file changes
