# DangerousBot - Architecture Documentation

## Vue d'ensemble

DangerousBot est un assistant IA auto-modifiable et évolutif, conçu pour collaborer avec son utilisateur et s'adapter à ses besoins. Il combine un backend Node.js/TypeScript avec une interface web React, et utilise plusieurs providers d'IA (Claude, Kimi, Mistral) de manière interchangeable.

### Stack Technique

- **Backend**: Node.js + TypeScript + esbuild
- **Frontend**: React + TypeScript + Vite
- **Base de données**: SQLite (mémoire conversationnelle, embeddings)
- **Search Engine**: SearxNG (self-hosted via Docker)
- **Providers AI**: Anthropic (Claude), Moonshot AI (Kimi), Mistral AI

### Principes de Design

1. **Auto-évolution**: Le bot peut modifier son propre code source via `self_update`
2. **Sécurité**: Rollback automatique en cas d'échec de build
3. **Modularité**: Architecture plugin pour les tools et providers
4. **Transparence**: Toutes les actions sont visibles et traçables
5. **Persistance**: Mémoire long terme avec embeddings vectoriels

---

## Core Architecture

### Le Brain (`src/core/brain/`)

Le Brain est le cœur orchestrateur qui gère :

1. **PromptBuilder** : Construction du system prompt avec injection de contexte
2. **ProviderManager** : Gestion des providers AI (Claude/Kimi/Mistral) avec hot-swap
3. **HistoryManager** : Gestion de l'historique des conversations (SQLite)

```typescript
// Flux typique d'une requête
User Input → HistoryManager (save) → PromptBuilder (inject context) 
  → ProviderManager (chatStream) → Tool Executor (si besoin) 
  → HistoryManager (save response)
```

### Architecture des Providers

Tous les providers héritent de `BaseProvider` qui factorise :

- Calcul des coûts (`calculateCost`)
- Gestion des erreurs (`handleError`)
- Pattern streaming standardisé

```typescript
abstract class BaseProvider {
  // Méthodes concrètes (communes)
  protected calculateCost(inputTokens, outputTokens): Cost
  protected handleError(error): Error
  
  // Méthodes abstraites (à implémenter)
  protected abstract convertMessages(messages): ProviderFormat
  protected abstract makeStreamingApiCall(): AsyncGenerator
}
```

### Architecture des Tools

Pattern **Handler** avec auto-registration :

```typescript
// Chaque tool exporte :
export const monToolHandler: ToolHandler = {
  name: 'mon_tool',
  execute: async (input, context) => { /* ... */ }
};

export const monToolDefinition: Tool = {
  name: 'mon_tool',
  description: '...',
  input_schema: { /* ... */ }
};
```

**Auto-registration** dans `tools/index.ts` :

```typescript
const handlers = [shellHandler, readFileHandler, ...];
for (const handler of handlers) {
  toolRegistry.set(handler.name, handler);
}
```

---

## Memory & Context

### Base de Données SQLite

Tables principales :
- `messages` : Historique des conversations
- `memories` : Mémoires long terme (compressions)
- `code_embeddings` : Embeddings vectoriels de la codebase
- `todos` : Système de gestion de tâches

### Embeddings Vectoriels

- **Mémoires** : OpenRouter (`qwen/qwen3-embedding-8b`)
- **Code** : Mistral (`codestral-embed-2505`)

**Usage** : Recherche sémantique pour injecter le contexte pertinent dans le system prompt.

### Injection de Contexte

```typescript
// 1. Recherche sémantique
const relevantMemories = await memory.findSimilar(query, limit: 3);

// 2. Construction du system prompt
const systemPrompt = `${IDENTITY}

## 📚 Contexte pertinent
${relevantMemories.join('\n')}

## 📁 Codebase
${codebasePaths}`;
```

---

## Server & Frontend

### Backend (`src/server/`)

- **HTTP API** : Endpoints REST pour le chat et la gestion
- **WebSocket** : Communication temps réel (streaming des réponses)
- **SSE** : Server-Sent Events pour le streaming AI

### Frontend (`src/web/`)

- **Framework** : React + TypeScript
- **Build** : Vite (HMR rapide)
- **Styling** : CSS personnalisé avec variables CSS
- **Features** :
  - Markdown avec syntax highlighting
  - Tool calls visuels avec expansion
  - Compteur de tokens en temps réel
  - Responsive design

---

## Self-Update & Sécurité

### Système de Rollback

```
self_update():
  1. Créer backup dans .backups/backup_<timestamp>/
  2. Appliquer modifications
  3. Valider TypeScript (tsc --noEmit)
  4. Builder (esbuild)
  5. Si échec → Restaurer backup
  6. Redémarrer serveur
```

### Fichiers de Backup

```
.backups/
├── backup_20250130_143022/
│   ├── src/              # Copie complète du code
│   ├── dangerousbot.db   # Backup DB
│   └── manifest.json     # Métadonnées
└── manifest.json         # Index de tous les backups
```

---

## Configuration

Centralisée dans `src/config.ts` :

```typescript
export const CONFIG = {
  PROVIDER: {
    ACTIVE: 'claude',           // ou 'kimi', 'mistral'
    MODELS: {
      CLAUDE: {
        BRAIN: 'claude-opus-4-5',
        COMPRESSOR: 'claude-sonnet-4-5'
      },
      // ...
    }
  },
  MEMORY: {
    COMPRESSION_THRESHOLD: 30,  // Messages avant compression
    EMBEDDING_MODEL: 'qwen/qwen3-embedding-8b'
  },
  PATHS: {
    ANTHROPIC_KEY_FILE: '~/.dangerousbot/secrets/anthropic_api_key',
    // ...
  }
};
```

---

## Guides Pratiques

### Ajouter un nouveau Tool

1. Créer `src/core/tools/mon-tool.ts` :

```typescript
import { ToolHandler, ToolContext } from './types';
import { Tool, ToolResult, ToolInput } from '../types';

export const monToolHandler: ToolHandler = {
  name: 'mon_tool',
  
  async execute(input: ToolInput, context: ToolContext): Promise<ToolResult> {
    // Logique du tool
    return { success: true, data: result };
  }
};

export const monToolDefinition: Tool = {
  name: 'mon_tool',
  description: 'Description du tool...',
  input_schema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' }
    },
    required: ['param1']
  }
};
```

2. Enregistrer dans `src/core/tools/index.ts` :

```typescript
import { monToolHandler, monToolDefinition } from './mon-tool';

// Dans registerAllTools():
const handlers = [..., monToolHandler];

// Dans getToolDefinitions():
return [..., monToolDefinition];
```

3. Tester avec `self_update`

### Ajouter un nouveau Provider

1. Créer `src/core/providers/nouveau-provider.ts` :

```typescript
import { BaseProvider, ProviderCostConfig } from './base-provider';

export class NouveauProvider extends BaseProvider {
  readonly name = 'nouveau';
  protected costConfig: ProviderCostConfig = {
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0
  };

  protected convertMessages(messages: AIMessage[]): unknown[] {
    // Conversion au format du provider
  }

  protected async makeStreamingApiCall(...) {
    // Implémentation streaming
  }

  supportsTools(): boolean {
    return true;
  }
}
```

2. Ajouter dans `src/core/providers/index.ts`

### Ajouter une nouvelle Feature Complexe

Utiliser le système TODO intégré :

```typescript
// 1. Créer un projet
todo({ type: 'create_project', name: 'Feature X', description: '...' });

// 2. Créer les tâches (en batch, anticipé)
todo({ type: 'create_task', project_id: 1, title: 'Tâche 1', priority: 'high' });
todo({ type: 'create_task', project_id: 1, title: 'Tâche 2', priority: 'medium' });

// 3. Compléter au fur et à mesure
todo({ type: 'complete_task', task_id: 1 });
```

---

## Points d'Extension

### Providers Supportés

| Provider | Status | Models | Tools | Streaming |
|----------|--------|--------|-------|-----------|
| Claude | ✅ Actif | Opus 4.5, Sonnet 4.5 | ✅ | ✅ |
| Kimi | ✅ Actif | K1.6, K1.5 | ✅ | ✅ |
| Mistral | ✅ Actif | Large, Medium, Small | ✅ | ✅ |

### Tools Disponibles

| Tool | Description |
|------|-------------|
| `shell` | Commandes système |
| `read/write/edit/list/delete_file` | Gestion fichiers |
| `execute_code` | Exécution JS |
| `self_update` | Modification auto du code |
| `remember/recall` | Mémoire long terme |
| `todo` | Gestion projets/tâches |
| `consult_mistral` | Second avis IA |
| `searxng_search` | Recherche web privée |
| `get_kimi_balance` | Solde API Moonshot |
| `retrieve_code` | Recherche dans codebase |
| `switch_provider` | Changement provider AI |

---

## Développement

### Commandes Utiles

```bash
# Démarrage
npm start              # Start complet (backend + frontend)
npm run dev            # Mode développement

# SearxNG
npm run searxng start  # Démarrer le moteur de recherche
npm run searxng logs   # Voir les logs

# Build
npm run build          # Build complet
npm run build:server   # Build backend seul
npm run build:web      # Build frontend seul

# Setup
npm run setup          # Configuration initiale
```

### Conventions de Code

- **TypeScript strict** : `strict: true` dans tsconfig
- **Imports relatifs** : `../types` (pas d'alias)
- **Error handling** : Toujours retourner `{ success: boolean, ... }`
- **Documentation** : JSDoc pour les fonctions publiques

---

## Roadmap

### Phase 3 (En cours)

- [ ] ESLint + Prettier configuration
- [ ] Health check au démarrage
- [ ] Tests unitaires (Jest/Vitest)

### Idées Futures

- [ ] Multi-modèles (Claude + Kimi en parallèle)
- [ ] Plugins utilisateur (code externe sandboxé)
- [ ] Interface mobile optimisée
- [ ] Voice I/O (TTS/STT)

---

## Ressources

- **Repo**: `/Users/dannybengal/dev/dangerousbot`
- **Documentation Mistral**: https://docs.mistral.ai
- **Documentation Anthropic**: https://docs.anthropic.com
- **Documentation Moonshot**: https://platform.moonshot.cn/docs

---

*Dernière mise à jour: 2025-01-31*
*Version: 0.1.52*
