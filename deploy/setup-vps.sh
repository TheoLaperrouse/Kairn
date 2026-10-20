#!/usr/bin/env bash
# Prepares a fresh Debian/Ubuntu VPS: Docker, firewall, automatic security updates.
# Run remotely by deploy.sh (once, idempotent).
set -euo pipefail

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if ! command -v docker >/dev/null 2>&1; then
  echo "→ Installation de Docker"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO usermod -aG docker "$(id -un)" || true
fi

echo "→ Pare-feu : SSH, HTTP, HTTPS uniquement"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq ufw unattended-upgrades rsync >/dev/null
$SUDO ufw allow OpenSSH >/dev/null
$SUDO ufw allow 80/tcp >/dev/null
$SUDO ufw allow 443/tcp >/dev/null
$SUDO ufw allow 443/udp >/dev/null
$SUDO ufw --force enable >/dev/null

echo "→ Mises à jour de sécurité automatiques"
$SUDO dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null

echo "✓ VPS prêt"
