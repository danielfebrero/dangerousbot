# DangerousBot 🤖

![Version](https://img.shields.io/badge/version-0.1.148-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)
![Status](https://img.shields.io/badge/status-Active-success)

**Programme IA Autonome et Évolutif**

DangerousBot est un assistant IA auto-modifiable qui peut lire, modifier et améliorer son propre code source. Construit avec TypeScript, Node.js et React, il offre une interface web moderne, un bot Telegram synchronisé et un système de plugins extensible.

## ✨ Fonctionnalités

- 🤖 **Multi-providers** : Claude, Kimi, Mistral, Grok (bascule automatique en cas d'indisponibilité)
- 🔧 **Auto-modification** : Peut modifier son propre code source et se redémarrer
- 💬 **Bot Telegram** : Interface mobile synchronisée avec la webapp
- 🧠 **Mémoire long-terme** : SQLite avec embeddings vectoriels pour le contexte
- 🔍 **Recherche web** : Intégration SearxNG (self-hosted, respectueux de la vie privée)
- 📝 **Système TODO** : Gestion de projets et tâches intégrée
- 🌊 **Streaming** : Réponses en temps réel avec indicateur de frappe
- 🗜️ **Compression intelligente** : Résumé automatique des longues conversations
- 💬 **Interface web** : Chat moderne avec support markdown et images
- 🔙 **Rollback automatique** : Restauration en cas d'erreur de build
- 🎯 **Code indexing** : Recherche sémantique dans la codebase
- 📎 **Multi-modal** : Support des images (Claude Vision)

## 🚀 Installation rapide

```bash
# 1. Cloner le projet
git clone <url-du-repo>
cd dangerousbot

# 2. Installer les dépendances
npm install

# 3. Compiler le projet
npm run build

# 4. Configurer (clés API + raccourcis)
npm run setup
```

## 🎮 Démarrage

```bash
# Démarrer DangerousBot (démarre aussi SearxNG automatiquement)
npm start

# Ou utiliser le raccourci créé sur le Bureau
# macOS : ~/dangerousbot.command
# Linux : ~/Desktop/DangerousBot.desktop
```

Puis ouvrez **http://localhost:3000** dans votre navigateur.

## ⚙️ Configuration

Les clés API sont stockées de manière sécurisée dans `~/.dangerousbot/secrets/` :

```bash
# Reconfigurer les clés API
npm run setup:keys

# Voir le statut des clés
npm run setup:keys -- --status
```

### Clés API

Aucun provider n'est obligatoire, mais **au moins un** doit être configuré pour que le bot fonctionne.

| Clé | Description |
|-----|-------------|
| **Anthropic** | Claude Opus/Sonnet - [console.anthropic.com](https://console.anthropic.com) |
| **Kimi** | Kimi K2.5 (Moonshot) - [platform.moonshot.ai](https://platform.moonshot.ai) |
| **Mistral** | Mistral Large/Medium/Small - [console.mistral.ai](https://console.mistral.ai) |
| **Grok** | Grok 4-1 (xAI) - [console.x.ai](https://console.x.ai) |
| OpenRouter | Embeddings Qwen (optionnel) - [openrouter.ai](https://openrouter.ai) |

## 💬 Bot Telegram

DangerousBot inclut un bot Telegram synchronisé avec la webapp :

- 📱 **Accès mobile** : Interface conversationnelle depuis Telegram
- 🔒 **Sécurisé** : Un seul "master user" autorisé
- 🔄 **Synchronisé** : Historique partagé avec la webapp
- 🛠️ **Mêmes capacités** : Tools, uploads d'images, etc.

### Configuration

Pour activer le bot Telegram, définissez le master user (celui qui pourra interagir avec le bot) :

```typescript
// Par username
telegram(set_master_user, "votre_username")

// Ou par ID numérique
telegram(set_master_user, "123456789")
```

## 🐳 SearxNG (Recherche Web)

SearxNG démarre automatiquement avec `npm start`. Gestion manuelle :

```bash
# Gérer SearxNG
npm run searxng start     # Démarrer
npm run searxng stop      # Arrêter
npm run searxng restart   # Redémarrer
npm run searxng status    # Statut
npm run searxng logs      # Logs
```

## 🎯 Exemples d'utilisation

### Modifier son propre code

> "Ajoute une fonction de logging dans le fichier utils.ts"

Le bot va :
1. 🔎 Rechercher le fichier avec `retrieve_code`
2. 📝 Lire le contenu avec `read_file`
3. ✏️ Modifier le code avec `edit_file`
4. 🔄 Redémarrer automatiquement avec `self_update`

### Recherche web + analyse

> "Quelles sont les dernières nouveautés de TypeScript 5.4 ?"

Le bot utilise `searxng_search` pour chercher puis analyse les résultats.

### Gestion de projet

> "Crée un projet pour refactoriser le système d'authentification"

Le bot crée un projet TODO avec les tâches ordonnées via `todo`.

### Analyse de code

> "Explique-moi comment fonctionne le système de rollback"

Le bot recherche dans la codebase et explique le fonctionnement.

## 🔒 Sécurité

- **Master user Telegram unique** : Un seul utilisateur peut interagir avec le bot Telegram
- **Rollback automatique** : Restauration en cas d'erreur de build TypeScript
- **Clés API sécurisées** : Stockage dans `~/.dangerousbot/secrets/` (permissions 600)
- **Pas de données externes** : SearxNG self-hosted, pas de télémetrie

## 🛠️ Développement

```bash
# Mode développement (rechargement manuel)
npm run dev

# Compiler
npm run build

# Voir les logs
npm run logs
```

## 🐛 Dépannage

### Le build échoue après une modification

Le système de rollback automatique restaure la dernière version fonctionnelle.
Vérifiez les logs : `npm run logs`

### SearxNG ne démarre pas

```bash
npm run searxng restart
# ou manuellement
docker-compose -f docker/searxng/docker-compose.yml up -d
```

### Provider indisponible

Le système bascule automatiquement sur un autre provider disponible (Claude, Kimi, Mistral, Grok).

## 🤝 Consultation Inter-IA

DangerousBot peut consulter d'autres modèles IA pour obtenir un second avis, brainstormer ou déléguer des tâches. Ce système permet un véritable **débat inter-IA** où le brain principal (Claude, Kimi, etc.) sollicite un modèle consultant (Mistral ou Grok) pour enrichir ses réponses.

### Modèles consultants

| Modèle | Variantes | Sélection automatique |
|--------|-----------|----------------------|
| **Mistral** | Large, Medium, Small | Selon la complexité détectée |
| **Grok** | 4-1-fast-reasoning, 4-1-fast-non-reasoning | Reasoning pour tâches complexes |

### Sélection automatique de la complexité

Le système analyse la requête et choisit le modèle adapté :

- **Haute** (Large / Reasoning) : architecture, sécurité, review, optimisation, refactoring
- **Moyenne** (Medium / Reasoning) : brainstorming, validation, analyse générale
- **Basse** (Small / Non-reasoning) : formatage, conversion, templates, résumés

### Conversations multi-turn

Chaque consultation peut être poursuivie en conversation multi-turn avec historique persistant en SQLite :

```
Utilisateur → Brain : "Compare les approches REST vs GraphQL pour notre API"
Brain → consult_ai(mistral) : "Analyse les trade-offs REST vs GraphQL pour une API..."
Mistral → Brain : "REST est préférable si... GraphQL si..."
Brain → Utilisateur : Synthèse enrichie des deux perspectives
```

```
// Continuer la conversation avec le même consultant
consult_ai(query: "Et pour le cas spécifique d'une app mobile ?", conversation_id: "abc123")
```

### Cas d'usage

| Scénario | Exemple |
|----------|---------|
| **Second avis** | Le brain demande à Mistral de valider son approche architecturale |
| **Code review** | Soumettre du code à Grok pour une review de sécurité |
| **Brainstorming** | Générer des idées alternatives via un modèle différent |
| **Délégation** | Confier une tâche de formatage/conversion au modèle le plus rapide |
| **Débat** | Confronter les réponses de deux modèles sur une question technique |

### Gestion des conversations

Le tool `manage_conversations` permet de lister, récupérer ou supprimer les conversations avec les consultants. Maximum 50 conversations stockées (rotation automatique).

## 🐝 Swarm (Agents Parallèles)

DangerousBot peut dispatcher des tâches à des **agents IA indépendants** qui travaillent en arrière-plan. Chaque agent a sa propre instance provider, son historique de conversation, et peut utiliser les tools (lecture/écriture de fichiers, shell, recherche, etc.).

### Workflow typique

```
1. Créer un swarm avec plusieurs queries
   swarm(create, "Lis src/foo.ts et liste toutes les fonctions ||| Analyse la couverture de tests de src/bar.ts")

2. Continuer à travailler de son côté, utiliser wait() si nécessaire
   wait(10)

3. Récupérer les résultats
   swarm(retrieve, agent_id_1)
   swarm(retrieve, agent_id_2)

4. Optionnel : approfondir avec un agent
   swarm(continue, agent_id_1, "Regarde plus en détail la fonction X")
```

### Configuration

| Clé | Description | Défaut |
|-----|-------------|--------|
| `swarm.model` | Provider et modèle (`provider` ou `provider:model_id`) | `mistral` (Mistral Large) |
| `swarm.max_iterations` | Max itérations tool-loop par agent | `25` |
| `swarm.max_agents` | Max agents concurrents | `10` |

Exemples :
```
config(set, swarm.model, claude)           → Claude Opus 4.5
config(set, swarm.model, mistral:mistral-medium-2505) → Mistral Medium
config(set, swarm.model, grok)             → Grok Reasoning
```

### Tools disponibles pour les agents

Les agents swarm ont accès à un sous-ensemble sûr de tools : `read_file`, `write_file`, `edit_file`, `list_files`, `delete_file`, `execute_code`, `shell`, `searxng_search`, `retrieve_code`, `code_index`, `remember`, `recall`, `wait`.

---

## 🛠️ Référence des Tools

DangerousBot dispose de 31 tools organisés par catégorie.

### Fichiers

| Tool | Description |
|------|-------------|
| `read_file` | Lit le contenu d'un fichier (texte ou image). Supporte offset/limit pour les gros fichiers. |
| `write_file` | Écrit du contenu dans un fichier. Crée le fichier et les dossiers parents si nécessaire. |
| `edit_file` | Modifie un fichier existant par remplacement de chaîne (old → new). Option `replace_all`. |
| `delete_file` | Supprime un fichier. |
| `list_files` | Liste les fichiers et dossiers d'un répertoire. |

### Code & Recherche

| Tool | Description |
|------|-------------|
| `retrieve_code` | Recherche sémantique dans la codebase indexée via embeddings. Retourne les fichiers/snippets les plus pertinents. |
| `code_index` | Gère l'indexation de projets pour la recherche sémantique. Actions : `add`, `refresh`, `list`, `remove`. |
| `searxng_search` | Recherche web privée via SearxNG self-hosted. Filtrage par moteur, catégorie, langue, période. |

### Exécution & Système

| Tool | Description |
|------|-------------|
| `execute_code` | Exécute du code JavaScript. Mode in-memory (sandboxé) par défaut, ou via fichier. |
| `shell` | Exécute des commandes shell (git, npm, commandes système). |
| `self_update` | Compile et redémarre le bot après modification du code. Validation TypeScript + build + rollback automatique en cas d'échec. |
| `restart_server` | Redémarre le serveur sans recompilation. |
| `wait` | Attend un nombre de secondes spécifié (max 300s). Utile pour créer des pauses entre des actions. |
| `swarm` | Dispatch de tâches à des agents IA indépendants en arrière-plan. Actions : `create`, `add`, `retrieve`, `continue`. Chaque agent a son propre provider et tool-loop. Configurable via `config()` (`swarm.model`, `swarm.max_iterations`, `swarm.max_agents`). |

### Mémoire & Connaissances

| Tool | Description |
|------|-------------|
| `remember` | Sauvegarde une information en mémoire long-terme. Types : `fact`, `preference`, `context`, `skill`. |
| `recall` | Récupère des informations depuis la mémoire long-terme, filtrable par type. |
| `recall_tool_result` | Récupère le résultat complet d'une exécution passée de tool via son ID de référence. |

### Consultation Inter-IA

| Tool | Description |
|------|-------------|
| `consult_ai` | Consulte un modèle IA (Mistral ou Grok) pour un second avis, brainstorming ou délégation. Multi-turn avec historique persistant. Sélection automatique du modèle selon la complexité. |
| `manage_conversations` | Gère les conversations persistantes avec les consultants. Actions : `list`, `get`, `delete`, `clear`. |

### Gestion de Conversations

| Tool | Description |
|------|-------------|
| `manage_threads` | Gère les threads de conversation indépendants. Actions : `list`, `get`, `create`, `create_sub`, `switch`, `exit`, `rename`, `delete`, `clear`. Supporte les relations parent-enfant. |
| `compact` | Compresse l'historique de conversation en un résumé concis pour libérer du contexte. |

### Gestion de Projet

| Tool | Description |
|------|-------------|
| `todo` | Gère des projets et tâches TODO. Actions : `create_project`, `create_task`, `complete_task`, `list_tasks`, `reorder_tasks`, etc. Priorités : `low`, `medium`, `high`. |

### Providers IA

| Tool | Description |
|------|-------------|
| `switch_provider` | Change le provider IA actif (Claude, Kimi, Mistral, Grok). Scopé au thread si appelé depuis un thread, sinon global. |
| `get_kimi_balance` | Récupère le solde disponible sur le compte Moonshot AI (Kimi). |

### Transfert de Fichiers

| Tool | Description |
|------|-------------|
| `download_file` | Télécharge un fichier depuis une URL. Suivi avec métadonnées, auto-suppression si limite de stockage dépassée. |
| `send_file` | Envoie un fichier dans le chat (webapp ou Telegram). Accepte un `file_id` ou une `url`. |

### Telegram

| Tool | Description |
|------|-------------|
| `telegram` | Gère le master user Telegram. Commande : `set_master_user` avec username ou ID numérique. |

### Configuration & Logs

| Tool | Description |
|------|-------------|
| `config` | Gère la configuration dynamique en base de données. Actions : `get`, `set`, `list`, `delete`. |
| `log` | Récupère et filtre les logs système. Niveaux : VERBOSE, DEBUG, INFO, WARN, ERROR. |
| `set_log_level` | Change le niveau de logging système. |
| `clear_logs` | Supprime tous les fichiers de logs (irréversible). |

---

## 📁 Structure du projet

```
dangerousbot/
├── src/
│   ├── core/              # 🧠 Cerveau (brain, providers, tools, memory)
│   ├── server/            # 🌐 Serveur Express + WebSocket
│   ├── web/               # ⚛️ Frontend React
│   └── config.ts          # ⚙️ Configuration centralisée
├── data/                  # 💾 SQLite + config SearxNG
├── dist/                  # 📦 Build compilé
└── ARCHITECTURE.md        # 📚 Documentation détaillée
```

## 🧪 Architecture

Le projet suit une architecture modulaire :

- **Providers** : Pattern `BaseProvider` pour facilement ajouter de nouveaux modèles AI
- **Tools** : Système de plugins avec auto-registration
- **Memory** : SQLite + embeddings pour la persistance et le contexte
- **Brain** : Orchestration modulaire (prompt-builder, streaming, tool-loop)

Voir [ARCHITECTURE.md](./ARCHITECTURE.md) pour plus de détails.

## 📝 Licence

Projet personnel - Usage privé uniquement.

---

**⚠️ Avertissement** : Ce programme peut modifier son propre code source. Utilisez avec précaution et assurez-vous d'avoir des backups (le système de rollback automatique est là pour ça !).
