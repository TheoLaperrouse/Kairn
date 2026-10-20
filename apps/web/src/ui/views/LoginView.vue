<script setup lang="ts">
import { LoaderCircle, MonitorSmartphone, Mountain, Timer, UtensilsCrossed } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../application/stores/auth'
import KairnLogo from '../components/KairnLogo.vue'
import { errorMessage } from '../../domain/format'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')
const pending = ref(false)

const MIN = 10
const strength = computed(() => {
  const p = password.value
  let score = 0
  if (p.length >= MIN) score++
  if (p.length >= 14) score++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++
  if (/\d/.test(p) || /[^\w]/.test(p)) score++
  return score
})
const strengthLabel = computed(() => (password.value.length < MIN ? `Encore ${MIN - password.value.length} caractères` : ['Faible', 'Correct', 'Bon', 'Solide', 'Excellent'][strength.value]))

function switchTo(next: 'login' | 'register') {
  mode.value = next
  error.value = ''
}

async function submit() {
  error.value = ''
  if (mode.value === 'register' && password.value.length < MIN) {
    error.value = `Le mot de passe doit faire au moins ${MIN} caractères`
    return
  }
  pending.value = true
  try {
    if (mode.value === 'login') await auth.login(email.value, password.value)
    else await auth.register(email.value, password.value, displayName.value)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value = errorMessage(e, 'Une erreur est survenue')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="login topo">
    <section class="hero">
      <div class="brand"><KairnLogo :size="44" /> <span>Kairn</span></div>
      <h1>Chaque cairn te rapproche<br /><em>de la ligne d’arrivée.</em></h1>
      <p class="lead">Un plan d’entraînement taillé pour ton ultra : périodisation, D+, renfo guidé, nutrition de course.</p>
      <ul class="features">
        <li><Mountain :size="18" aria-hidden="true" /> Plan spécifique trail, du 20 km à l’UTMB</li>
        <li><Timer :size="18" aria-hidden="true" /> Séances de renfo guidées, à faire en même temps que l’écran</li>
        <li><UtensilsCrossed :size="18" aria-hidden="true" /> Recettes d’effort et stratégie de ravitaillement</li>
      </ul>
      <svg class="ridge" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 120 L0 90 L60 70 L110 82 L170 40 L220 62 L280 18 L330 50 L390 30 L450 66 L510 44 L560 72 L600 60 L600 120 Z" />
        <path class="trail" d="M0 100 L60 80 L110 92 L170 50 L220 72 L280 28 L330 60 L390 40 L450 76 L510 54 L560 82 L600 70" />
      </svg>
    </section>

    <section class="panel card" aria-labelledby="auth-title">
      <h2 id="auth-title" class="visually-hidden">{{ mode === 'login' ? 'Connexion' : 'Créer un compte' }}</h2>
      <div class="tabs" role="tablist">
        <button role="tab" type="button" :aria-selected="mode === 'login'" @click="switchTo('login')">Connexion</button>
        <button role="tab" type="button" :aria-selected="mode === 'register'" @click="switchTo('register')">Créer un compte</button>
      </div>

      <form class="stack" novalidate @submit.prevent="submit">
        <label v-if="mode === 'register'" class="field">
          <span>Prénom</span>
          <input v-model="displayName" class="input" autocomplete="given-name" maxlength="60" />
        </label>
        <label class="field">
          <span>E-mail</span>
          <input v-model="email" class="input" type="email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Mot de passe</span>
          <input
            v-model="password"
            class="input"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            required
            :minlength="mode === 'register' ? MIN : undefined"
            aria-describedby="pw-help"
          />
          <span v-if="mode === 'register'" id="pw-help" class="meter" :data-score="password.length < MIN ? 0 : strength">
            <span class="bars" aria-hidden="true"><i v-for="n in 4" :key="n" :class="{ on: password.length >= MIN && n <= strength }" /></span>
            <small>{{ strengthLabel }}</small>
          </span>
        </label>

        <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

        <button class="btn btn-primary submit" type="submit" :disabled="pending || !email || !password">
          <LoaderCircle v-if="pending" :size="18" class="spin" aria-hidden="true" />
          {{ mode === 'login' ? 'Se connecter' : 'Créer mon compte' }}
        </button>
      </form>

      <p class="sync"><MonitorSmartphone :size="18" aria-hidden="true" /> Connecte-toi avec le même compte sur ton téléphone et ton ordinateur : tout est synchronisé.</p>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.15fr minmax(320px, 440px);
  gap: var(--space-7);
  align-items: center;
  padding: var(--space-7) clamp(var(--space-4), 6vw, 96px);
}
.hero {
  position: relative;
  display: grid;
  gap: var(--space-5);
  max-width: 620px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.6rem;
}
h1 {
  font-size: clamp(2rem, 4.6vw, 3.4rem);
  line-height: 1.05;
}
h1 em {
  font-style: normal;
  color: var(--accent);
}
.lead {
  color: var(--text-2);
  font-size: 1.1rem;
  max-width: 48ch;
}
.features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-3);
}
.features li {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--text-2);
}
.features svg {
  color: var(--teal);
  flex: none;
}
.ridge {
  width: 100%;
  height: 90px;
  margin-top: var(--space-4);
}
.ridge path {
  fill: var(--surface-2);
}
.ridge .trail {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
  stroke-dasharray: 6 6;
  animation: walk 3s linear infinite;
}
@keyframes walk {
  to {
    stroke-dashoffset: -48;
  }
}
.panel {
  display: grid;
  gap: var(--space-5);
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.tabs button {
  border: 0;
  background: none;
  padding: 10px;
  border-radius: 999px;
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
}
.tabs button[aria-selected='true'] {
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}
.meter {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bars {
  display: flex;
  gap: 4px;
}
.bars i {
  width: 28px;
  height: 5px;
  border-radius: 3px;
  background: var(--surface-3);
}
.meter[data-score='1'] .bars i.on {
  background: var(--danger);
}
.meter[data-score='2'] .bars i.on {
  background: var(--warning);
}
.meter[data-score='3'] .bars i.on,
.meter[data-score='4'] .bars i.on {
  background: var(--success);
}
.submit {
  width: 100%;
  margin-top: var(--space-2);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.sync {
  display: flex;
  gap: 10px;
  font-size: 0.85rem;
  color: var(--text-2);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
.sync svg {
  color: var(--teal);
  flex: none;
  margin-top: 2px;
}
@media (max-width: 900px) {
  .login {
    grid-template-columns: 1fr;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-4);
  }
  .features,
  .ridge {
    display: none;
  }
  .lead {
    font-size: 1rem;
  }
}
</style>
