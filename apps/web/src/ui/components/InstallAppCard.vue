<script setup lang="ts">
import { CheckCircle2, Download, Share, SquarePlus } from 'lucide-vue-next'
import { useInstall } from '../composables/use-install'

const { installed, canPrompt, ios, install } = useInstall()
const host = window.location.host
</script>

<template>
  <section class="card" aria-labelledby="install-title">
    <div class="card-title"><h2 id="install-title">Kairn sur ton téléphone</h2></div>

    <p v-if="installed" class="ok"><CheckCircle2 :size="18" aria-hidden="true" /> Kairn est installé sur cet appareil.</p>

    <template v-else-if="canPrompt">
      <p class="small text-2">
        Installe Kairn comme une application : icône sur l’écran d’accueil, plein écran, et ta séance du jour reste consultable sans réseau.
      </p>
      <button type="button" class="btn btn-primary" @click="install"><Download :size="18" aria-hidden="true" /> Installer l’application</button>
    </template>

    <template v-else-if="ios">
      <p class="small text-2">Dans Safari, ajoute Kairn à l’écran d’accueil : il s’ouvre en plein écran et peut t’envoyer des rappels.</p>
      <ol class="steps small">
        <li>Touche <Share :size="16" aria-label="Partager" /> en bas de l’écran.</li>
        <li>Choisis <strong>Sur l’écran d’accueil</strong> <SquarePlus :size="16" aria-hidden="true" />.</li>
        <li>Valide avec <strong>Ajouter</strong>.</li>
      </ol>
    </template>

    <p v-else class="small text-2">
      Ouvre <strong>{{ host }}</strong> sur ton téléphone, connecte-toi avec le même compte, puis choisis
      <strong>Installer l’application</strong> (Android) ou <strong>Partager → Sur l’écran d’accueil</strong> (iPhone).
    </p>
  </section>
</template>

<style scoped>
.ok {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--teal);
  font-weight: 600;
}
.steps {
  margin: var(--space-2) 0 0;
  padding-left: 1.2em;
  display: grid;
  gap: var(--space-1);
}
.steps svg {
  vertical-align: -3px;
}
.small {
  font-size: 0.88rem;
}
</style>
