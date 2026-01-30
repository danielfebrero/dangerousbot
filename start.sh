#!/bin/bash
# DangerousBot - Script de démarrage avec auto-restart

cd "$(dirname "$0")"

while true; do
    echo "[DangerousBot] Démarrage..."
    NODE_ENV=production node dist/dangerousbot.js
    
    EXIT_CODE=$?
    echo "[DangerousBot] Processus terminé avec code: $EXIT_CODE"
    
    # Si exit code 0, c'est un restart volontaire
    if [ $EXIT_CODE -eq 0 ]; then
        echo "[DangerousBot] Redémarrage dans 1 seconde..."
        sleep 1
    else
        # Erreur, attendre plus longtemps
        echo "[DangerousBot] Erreur détectée, redémarrage dans 5 secondes..."
        sleep 5
    fi
done
