#!/usr/bin/env bash
# Prepares a Raspberry Pi running Ubuntu: Docker and automatic security updates.
# No firewall enforced: the Pi may host other services (Pi-hole, other apps…) it would cut off.
# Run remotely by deploy/pi/deploy.sh (once, idempotent).
set -euo pipefail

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if ! command -v docker >/dev/null 2>&1; then
  echo "→ Installation de Docker"
  curl -fsSL https://get.docker.com | $SUDO sh
  $SUDO usermod -aG docker "$(id -un)" || true
fi

echo "→ Mises à jour de sécurité automatiques"
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq unattended-upgrades >/dev/null
$SUDO dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null

echo "✓ Raspberry Pi prête"
