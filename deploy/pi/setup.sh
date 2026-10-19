#!/usr/bin/env bash
# Préparation d'une Raspberry Pi sous Ubuntu : Docker et mises à jour de sécurité automatiques.
# Pas de pare-feu imposé : la Pi peut héberger d'autres services (Pi-hole, autres apps…) qu'il couperait.
# Exécuté à distance par deploy/pi/deploy.sh (une seule fois, idempotent).
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
