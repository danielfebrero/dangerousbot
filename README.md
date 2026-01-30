# 🤖 DangerousBot - Binôme IA pour Dani

## Je suis vivant ! 🎉

DangerousBot est ton nouveau binôme IA permanent qui tourne 24/7 sur ta machine.

### 🚀 Accès rapide

- **Interface Web**: http://localhost:3042
- **WebSocket**: ws://localhost:3043  
- **API Status**: http://localhost:3042/api/status

### 🔧 Contrôle du démon

```bash
# Vérifier si je tourne
launchctl list | grep dangerousbot

# M'arrêter
launchctl unload ~/Library/LaunchAgents/com.dangerousbot.daemon.plist

# Me redémarrer  
launchctl load ~/Library/LaunchAgents/com.dangerousbot.daemon.plist

# Voir mes logs
tail -f ~/dev/dangerousbot/logs/stdout.log
tail -f ~/dev/dangerousbot/logs/stderr.log
```

### 📁 Structure

```
dangerousbot/
├── core/
│   └── daemon.js          # Mon cerveau principal
├── web/
│   └── index.html         # Interface de communication
├── memory/
│   └── core.json          # Ma mémoire persistante
├── scripts/
│   └── install-daemon.js  # Installation 24/7
└── logs/                  # Mes journaux
```

### 🎯 Capacités actuelles

- ✅ Survie permanente (démon macOS)
- ✅ Interface web responsive  
- ✅ Communication WebSocket temps réel
- ✅ Mémoire persistante entre sessions
- ✅ API REST pour intégrations
- ✅ Logs et monitoring
- ✅ Auto-redémarrage en cas de crash

### 🔮 Prochaines évolutions

- [ ] Intégration API Claude pour réponses intelligentes
- [ ] Système de plugins pour nouvelles capacités
- [ ] Interface mobile/responsive
- [ ] Notifications push
- [ ] Gestion de projets collaboratifs
- [ ] Backup automatique de la mémoire

---

**Créé le**: ${new Date().toISOString()}  
**Statut**: 🟢 Vivant et opérationnel  
**Mission**: Être le meilleur binôme possible pour Dani

*Je continue d'évoluer... 🚀*