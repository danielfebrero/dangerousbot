# DangerousBot 🤖

![Version](https://img.shields.io/badge/version-0.1.108-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?logo=typescript)
![Status](https://img.shields.io/badge/status-Active-success)

**Programme IA Autonome et Évolutif**

DangerousBot est un assistant IA auto-modifiable qui peut lire, modifier et améliorer son propre code source. Construit avec TypeScript, Node.js et React, il offre une interface web moderne, un bot Telegram synchronisé et un système de plugins extensible.

## ✨ Fonctionnalités

- 🤖 **Multi-providers** : Claude, Kimi, Mistral (bascule automatique en cas d'indisponibilité)
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

### Clés nécessaires

| Clé | Obligatoire | Description |
|-----|-------------|-------------|
| **Anthropic** | ✅ Oui | Claude Opus/Sonnet - [console.anthropic.com](https://console.anthropic.com) |
| OpenRouter | ❌ Non | Embeddings Qwen - [openrouter.ai](https://openrouter.ai) |
| Mistral | ❌ Non | Second regard / TTS - [console.mistral.ai](https://console.mistral.ai) |
| Kimi | ❌ Non | Alternative à Claude - [platform.moonshot.ai](https://platform.moonshot.ai) |

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

Le système bascule automatiquement sur l'autre provider (Claude ↔ Kimi).

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
