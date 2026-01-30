# DangerousBot 🤖

**Programme IA Autonome et Évolutif**

DangerousBot est un assistant IA auto-modifiable qui peut lire, modifier et améliorer son propre code source. Construit avec TypeScript, Node.js et React, il offre une interface web moderne et un système de plugins extensible.

## ✨ Fonctionnalités

- 🤖 **Multi-providers** : Claude, Kimi, Mistral (bascule automatique en cas d'indisponibilité)
- 🔧 **Auto-modification** : Peut modifier son propre code source et se redémarrer
- 🧠 **Mémoire long-terme** : SQLite avec embeddings vectoriels pour le contexte
- 🔍 **Recherche web** : Intégration SearxNG (self-hosted, respectueux de la vie privée)
- 📝 **Système TODO** : Gestion de projets et tâches intégrée
- 💬 **Interface web** : Chat moderne avec support markdown et images
- 🔄 **Rollback automatique** : Restauration en cas d'erreur de build
- 🎯 **Code indexing** : Recherche sémantique dans la codebase

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

## 🛠️ Développement

```bash
# Mode développement (rechargement manuel)
npm run dev

# Compiler
npm run build

# Voir les logs
npm run logs
```

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
