#!/usr/bin/env bash
# Deploys Kairn to a VPS in one command.
#
#   ./deploy/deploy.sh debian@51.38.12.34                 # free domain 51-38-12-34.sslip.io
#   ./deploy/deploy.sh debian@51.38.12.34 kairn.mydomain.com
#   SSH_KEY=~/.ssh/id_ed25519_perso ./deploy/deploy.sh debian@51.38.12.34
#
# First run: prepares the VPS (Docker, firewall) and creates deploy/.env on the server.
# Later runs: upload the code, rebuild and restart without data loss.
set -euo pipefail

TARGET="${1:?Usage : deploy.sh utilisateur@ip [domaine]}"
HOST="${TARGET#*@}"
REMOTE_DIR="${REMOTE_DIR:-kairn}"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$SSH_KEY")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Domain: the one given, otherwise <ip>.sslip.io (resolves to the IP, valid HTTPS without buying anything).
if [ -n "${2:-}" ]; then
  DOMAIN="$2"
else
  IP="$(getent ahostsv4 "$HOST" | awk 'NR==1 {print $1}')"
  [ -z "$IP" ] && { echo "Impossible de résoudre $HOST"; exit 1; }
  DOMAIN="${IP//./-}.sslip.io"
fi

ssh_run() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo "→ Connexion à $TARGET"
ssh_run true

if ! ssh_run "command -v docker >/dev/null && command -v rsync >/dev/null"; then
  echo "→ Préparation du VPS (première fois)"
  ssh_run "bash -s" < "$ROOT/deploy/setup-vps.sh"
fi

echo "→ Envoi du code"
rsync -az --delete \
  -e "ssh ${SSH_OPTS[*]}" \
  --exclude node_modules --exclude '**/node_modules' --exclude '**/dist' --exclude data \
  --exclude .env --exclude deploy/.env --exclude deploy/backups --exclude .git \
  "$ROOT/" "$TARGET:$REMOTE_DIR/"

echo "→ Configuration ($DOMAIN)"
ssh_run "cd $REMOTE_DIR/deploy && if [ ! -f .env ]; then
  printf 'DOMAIN=%s\nPUBLIC_URL=https://%s\n# STRAVA_CLIENT_ID=\n# STRAVA_CLIENT_SECRET=\n' '$DOMAIN' '$DOMAIN' > .env
  chmod 600 .env
fi
mkdir -p backups"

echo "→ Construction et démarrage"
ssh_run "cd $REMOTE_DIR/deploy && docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null"

echo "→ Vérification"
for _ in $(seq 1 30); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
    echo "✓ Kairn est en ligne : https://$DOMAIN"
    exit 0
  fi
  sleep 4
done
echo "⚠ Le site ne répond pas encore en HTTPS. Diagnostic : ssh $TARGET 'cd $REMOTE_DIR/deploy && docker compose logs --tail 50'"
exit 1
