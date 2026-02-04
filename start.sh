#!/bin/bash
# DangerousBot - Script de démarrage avec auto-restart et rollback automatique
#
# Rollback logic:
#   - Maintains dist.last-good/ with the last confirmed-working build
#   - Detects startup crashes (exit non-zero within STARTUP_THRESHOLD seconds)
#   - Restores dist.last-good/ on startup crash (never touches source code)

cd "$(dirname "$0")"

# --- Configuration ---
STARTUP_THRESHOLD=15   # Seconds: exit within this = startup crash
MIN_GOOD_RUN=30        # Seconds: run longer than this = confirmed good build
MAX_ROLLBACK_ATTEMPTS=2 # Max consecutive rollback attempts before giving up

# --- State ---
CONSECUTIVE_FAILS=0

while true; do
    echo "[DangerousBot] Démarrage..."

    # Snapshot current dist/ before starting (to promote to last-good later if confirmed)
    if [ -d "dist" ]; then
        rm -rf dist.prev
        cp -r dist dist.prev
    fi

    START_TIME=$(date +%s)
    NODE_ENV=production node dist/dangerousbot.js
    EXIT_CODE=$?
    END_TIME=$(date +%s)
    ELAPSED=$((END_TIME - START_TIME))

    echo "[DangerousBot] Processus terminé avec code: $EXIT_CODE (durée: ${ELAPSED}s)"

    if [ $EXIT_CODE -eq 0 ]; then
        # Intentional restart (self_update, restart_server, etc.)
        CONSECUTIVE_FAILS=0

        # If the process ran long enough, it was a confirmed good build
        # Promote dist.prev/ (the build that was running) to dist.last-good/
        if [ $ELAPSED -ge $MIN_GOOD_RUN ] && [ -d "dist.prev" ]; then
            echo "[DangerousBot] Build confirmé (${ELAPSED}s). Sauvegarde en dist.last-good/..."
            rm -rf dist.last-good
            mv dist.prev dist.last-good
        else
            rm -rf dist.prev
        fi

        echo "[DangerousBot] Redémarrage dans 1 seconde..."
        sleep 1

    else
        # Error exit
        CONSECUTIVE_FAILS=$((CONSECUTIVE_FAILS + 1))
        rm -rf dist.prev

        # Startup crash: process died very quickly
        if [ $ELAPSED -lt $STARTUP_THRESHOLD ]; then
            if [ $CONSECUTIVE_FAILS -le $MAX_ROLLBACK_ATTEMPTS ] && [ -d "dist.last-good" ]; then
                echo "[DangerousBot] Crash au démarrage détecté (${ELAPSED}s). Rollback vers dist.last-good/ (tentative $CONSECUTIVE_FAILS/$MAX_ROLLBACK_ATTEMPTS)..."
                rm -rf dist
                cp -r dist.last-good dist
                echo "[DangerousBot] Rollback effectué. Redémarrage dans 2 secondes..."
                sleep 2
            else
                if [ $CONSECUTIVE_FAILS -gt $MAX_ROLLBACK_ATTEMPTS ]; then
                    echo "[DangerousBot] Nombre max de tentatives de rollback atteint. Redémarrage normal dans 5 secondes..."
                    CONSECUTIVE_FAILS=0
                else
                    echo "[DangerousBot] Crash au démarrage, aucun backup disponible. Redémarrage dans 5 secondes..."
                fi
                sleep 5
            fi
        else
            # Runtime error (ran for a while) — not a startup issue, no rollback
            CONSECUTIVE_FAILS=0
            echo "[DangerousBot] Erreur runtime détectée, redémarrage dans 5 secondes..."
            sleep 5
        fi
    fi
done
