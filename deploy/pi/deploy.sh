#!/usr/bin/env bash
# Deploys Kairn to a Raspberry Pi (64-bit Ubuntu), locally and optionally through a Cloudflare Tunnel.
#
#   ./deploy/pi/deploy.sh theolap@192.168.1.11                                          # local network: http://192.168.1.11:3100
#   TUNNEL_TOKEN=eyJ... ./deploy/pi/deploy.sh theolap@192.168.1.11 kairn.mydomain.com   # enables the tunnel
#   ./deploy/pi/deploy.sh theolap@192.168.1.11 kairn.mydomain.com                       # updates
#
# The image is built on this PC for ARM64 (QEMU emulation) then loaded onto the Pi:
# a Pi 3 does not have the memory to build the front end. Can be re-run without data loss.
set -euo pipefail

TARGET="${1:?Usage : deploy.sh utilisateur@ip [domaine]}"
DOMAIN="${2:-}"
HOST="${TARGET#*@}"
REMOTE_DIR="${REMOTE_DIR:-kairn}"
KAIRN_PORT="${KAIRN_PORT:-3100}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY")
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

ssh_run() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo "→ Connexion à $TARGET"
ARCH="$(ssh_run uname -m)"
if [ "$ARCH" != "aarch64" ]; then
  echo "La Pi tourne en $ARCH : Node 24 et cloudflared n'existent qu'en 64 bits (aarch64)."
  echo "Réinstalle Ubuntu Server 64 bits (Raspberry Pi Imager → Ubuntu Server … 64-bit)."
  exit 1
fi

if ! ssh_run "command -v docker >/dev/null"; then
  echo "→ Préparation de la Pi (première fois)"
  ssh_run "bash -s" < "$ROOT/deploy/pi/setup.sh"
fi
# Without docker group membership, fall back to sudo (no interactive password).
DOCKER="docker"
ssh_run "docker info >/dev/null 2>&1" || DOCKER="sudo -n docker"

if [ -n "$DOMAIN" ]; then PUBLIC_URL="https://$DOMAIN"; else PUBLIC_URL="http://$HOST:$KAIRN_PORT"; fi
echo "→ Configuration ($PUBLIC_URL)"
ssh_run "mkdir -p $REMOTE_DIR/backups && cd $REMOTE_DIR && touch .env && chmod 600 .env &&
  { grep -v -E '^(PUBLIC_URL|KAIRN_PORT)=' .env || true; } > .env.tmp &&
  printf 'PUBLIC_URL=%s\nKAIRN_PORT=%s\n' '$PUBLIC_URL' '$KAIRN_PORT' >> .env.tmp && mv .env.tmp .env"
if [ -n "${TUNNEL_TOKEN:-}" ]; then
  [ -z "$DOMAIN" ] && { echo "Le tunnel a besoin du domaine : $0 $TARGET kairn.mondomaine.fr"; exit 1; }
  # The token goes through standard input so it never shows up on a command line.
  printf 'TUNNEL_TOKEN=%s\nCOMPOSE_PROFILES=tunnel\n' "$TUNNEL_TOKEN" | ssh_run "cd $REMOTE_DIR &&
    { grep -v -E '^(TUNNEL_TOKEN|COMPOSE_PROFILES)=' .env || true; } > .env.tmp && cat >> .env.tmp && mv .env.tmp .env"
fi
scp -q "${SSH_OPTS[@]}" "$ROOT/deploy/pi/docker-compose.yml" "$TARGET:$REMOTE_DIR/docker-compose.yml"

if [ ! -e /proc/sys/fs/binfmt_misc/qemu-aarch64 ]; then
  echo "→ Activation de l'émulation ARM64 sur ce PC (jusqu'au prochain redémarrage)"
  docker run --privileged --rm tonistiigi/binfmt:qemu-v9.2.2 --install arm64 >/dev/null
fi

echo "→ Construction de l'image ARM64"
docker buildx build --platform linux/arm64 -t kairn:latest --load "$ROOT"

echo "→ Envoi de l'image sur la Pi"
docker save kairn:latest | gzip -1 | ssh_run "gunzip | $DOCKER load"

echo "→ Démarrage"
ssh_run "cd $REMOTE_DIR && $DOCKER compose up -d --remove-orphans"

echo "→ Vérification"
for _ in $(seq 1 45); do
  if ssh_run "curl -fsS http://127.0.0.1:$KAIRN_PORT/api/health" >/dev/null 2>&1; then
    echo "✓ Kairn tourne sur la Pi : http://$HOST:$KAIRN_PORT (réseau local)"
    [ -z "$DOMAIN" ] && exit 0
    for _ in $(seq 1 15); do
      curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1 && { echo "✓ En ligne : https://$DOMAIN"; exit 0; }
      sleep 4
    done
    echo "⚠ https://$DOMAIN ne répond pas : vérifie le Public hostname du tunnel (service http://kairn:3000)."
    exit 1
  fi
  sleep 4
done
echo "⚠ Kairn ne répond pas. Diagnostic : ssh $TARGET 'cd $REMOTE_DIR && $DOCKER compose ps && $DOCKER compose logs --tail 50'"
exit 1
