#!/bin/bash

# SearxNG Manager Script for DangerousBot
# Usage: ./searxng.sh [start|stop|restart|status|logs]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="searxng"
IMAGE="searxng/searxng:latest"
PORT="8080"
CONFIG_DIR="${SCRIPT_DIR}/data/searxng/config"
DATA_DIR="${SCRIPT_DIR}/data/searxng/data"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker n'est pas installé. Installez Docker d'abord."
        exit 1
    fi
}

ensure_config() {
    if [ ! -f "${CONFIG_DIR}/settings.yml" ]; then
        log_info "Création de la configuration SearxNG..."
        mkdir -p "${CONFIG_DIR}" "${DATA_DIR}"
        
        cat > "${CONFIG_DIR}/settings.yml" << 'EOF'
use_default_settings: true

general:
  debug: false
  instance_name: "SearxNG DangerousBot"

server:
  port: 8080
  bind_address: "0.0.0.0"
  secret_key: "dangerousbot_secret_key_2024_change_me"
  limiter: false
  image_proxy: true

search:
  safe_search: 0
  autocomplete: ""
  formats:
    - html
    - json
    - csv
    - rss

ui:
  default_theme: simple
  theme_args:
    simple_style: auto

outgoing:
  request_timeout: 10.0
  max_request_timeout: 15.0
  pool_connections: 100
  pool_maxsize: 20
  enable_http2: true
EOF
        
        log_success "Configuration créée dans ${CONFIG_DIR}/settings.yml"
        log_warning "Pensez à changer le secret_key dans la config !"
    fi
}

start_searxng() {
    check_docker
    ensure_config
    
    log_info "Démarrage de SearxNG..."
    
    # Check if already running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_warning "SearxNG est déjà en cours d'exécution."
        log_info "URL: http://localhost:${PORT}"
        exit 0
    fi
    
    # Remove old container if exists
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "Suppression de l'ancien container..."
        docker rm -f "${CONTAINER_NAME}" > /dev/null 2>&1
    fi
    
    # Pull latest image
    log_info "Téléchargement de l'image ${IMAGE}..."
    docker pull "${IMAGE}" > /dev/null 2>&1
    
    # Run container
    docker run \
        --name "${CONTAINER_NAME}" \
        -d \
        -p "127.0.0.1:${PORT}:${PORT}" \
        -v "${CONFIG_DIR}:/etc/searxng" \
        -v "${DATA_DIR}:/var/cache/searxng" \
        --restart unless-stopped \
        "${IMAGE}" > /dev/null 2>&1
    
    # Wait for startup
    log_info "Attente du démarrage..."
    for i in {1..30}; do
        if curl -s "http://localhost:${PORT}" > /dev/null 2>&1; then
            log_success "SearxNG démarré avec succès !"
            log_info "URL: http://localhost:${PORT}"
            log_info "API JSON: http://localhost:${PORT}/search?q=test&format=json"
            exit 0
        fi
        sleep 1
    done
    
    log_error "Le démarrage a pris trop de temps. Vérifiez les logs avec: ./searxng.sh logs"
    exit 1
}

stop_searxng() {
    check_docker
    
    if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_warning "SearxNG n'est pas en cours d'exécution."
        exit 0
    fi
    
    log_info "Arrêt de SearxNG..."
    docker stop "${CONTAINER_NAME}" > /dev/null 2>&1
    docker rm "${CONTAINER_NAME}" > /dev/null 2>&1
    log_success "SearxNG arrêté."
}

restart_searxng() {
    stop_searxng
    sleep 2
    start_searxng
}

status_searxng() {
    check_docker
    
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_success "SearxNG est en cours d'exécution"
        log_info "URL: http://localhost:${PORT}"
        
        # Test API
        if curl -s "http://localhost:${PORT}/search?q=test&format=json" > /dev/null 2>&1; then
            log_success "API JSON accessible"
        else
            log_warning "API JSON non accessible (encore en démarrage ?)"
        fi
    else
        log_warning "SearxNG n'est pas en cours d'exécution."
        log_info "Démarrez avec: ./searxng.sh start"
    fi
}

logs_searxng() {
    check_docker
    
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        docker logs -f "${CONTAINER_NAME}"
    else
        log_error "Aucun container SearxNG trouvé."
    fi
}

# Main
COMMAND=${1:-status}

case "${COMMAND}" in
    start)
        start_searxng
        ;;
    stop)
        stop_searxng
        ;;
    restart)
        restart_searxng
        ;;
    status)
        status_searxng
        ;;
    logs)
        logs_searxng
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start    - Démarre SearxNG"
        echo "  stop     - Arrête SearxNG"
        echo "  restart  - Redémarre SearxNG"
        echo "  status   - Vérifie le statut"
        echo "  logs     - Affiche les logs en temps réel"
        exit 1
        ;;
esac
