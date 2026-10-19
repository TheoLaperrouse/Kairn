<script setup lang="ts">
import { Activity, CalendarDays, Dumbbell, Flag, Gauge, Moon, Settings, Sun, UtensilsCrossed } from 'lucide-vue-next'
import { ref } from 'vue'
import { useAuthStore } from '../../application/stores/auth'
import KairnLogo from '../components/KairnLogo.vue'

const auth = useAuthStore()

const links = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', icon: Gauge },
  { to: '/plan', label: 'Plan', short: 'Plan', icon: CalendarDays },
  { to: '/course', label: 'Plan de course', short: 'Course', icon: Flag },
  { to: '/exercices', label: 'Renforcement', short: 'Renfo', icon: Dumbbell },
  { to: '/activites', label: 'Activités', short: 'Sorties', icon: Activity },
  { to: '/nutrition', label: 'Nutrition', short: 'Nutrition', icon: UtensilsCrossed },
]

const dark = ref(
  document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : !window.matchMedia('(prefers-color-scheme: light)').matches,
)

function toggleTheme() {
  dark.value = !dark.value
  const theme = dark.value ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('kairn-theme', theme)
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <RouterLink to="/" class="brand"><KairnLogo /> <span>Kairn</span></RouterLink>
      <nav aria-label="Navigation principale">
        <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="nav-link">
          <component :is="link.icon" :size="19" aria-hidden="true" />
          {{ link.label }}
        </RouterLink>
      </nav>
      <div class="sidebar-foot">
        <RouterLink to="/reglages" class="nav-link">
          <Settings :size="19" aria-hidden="true" /> Réglages
        </RouterLink>
        <button class="nav-link" type="button" @click="toggleTheme">
          <component :is="dark ? Sun : Moon" :size="19" aria-hidden="true" />
          {{ dark ? 'Thème clair' : 'Thème sombre' }}
        </button>
        <p v-if="auth.user" class="who">
          <span class="avatar" aria-hidden="true">{{ auth.user.displayName.slice(0, 1).toUpperCase() }}</span>
          <span class="who-name">{{ auth.user.displayName }}</span>
        </p>
      </div>
    </aside>

    <header class="topbar">
      <RouterLink to="/" class="brand"><KairnLogo /> <span>Kairn</span></RouterLink>
      <div class="row">
        <button class="btn btn-ghost btn-icon" type="button" :aria-label="dark ? 'Thème clair' : 'Thème sombre'" @click="toggleTheme">
          <component :is="dark ? Sun : Moon" :size="20" />
        </button>
        <RouterLink to="/reglages" class="btn btn-ghost btn-icon" aria-label="Réglages"><Settings :size="20" /></RouterLink>
      </div>
    </header>

    <main class="content">
      <slot />
    </main>

    <nav class="tabbar" aria-label="Navigation principale">
      <RouterLink v-for="link in links" :key="link.to" :to="link.to" class="tab">
        <component :is="link.icon" :size="21" aria-hidden="true" />
        <span>{{ link.short }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 248px 1fr;
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-5) var(--space-4);
  border-right: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  backdrop-filter: blur(12px);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.3rem;
  letter-spacing: -0.03em;
  text-decoration: none;
  padding: 0 var(--space-2);
}
nav {
  display: grid;
  gap: 2px;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  color: var(--text-2);
  text-decoration: none;
  font-weight: 550;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
}
.nav-link:hover {
  background: var(--surface-2);
  color: var(--text);
}
.nav-link.router-link-exact-active,
nav .nav-link.router-link-active:not([href='/']) {
  background: var(--accent-soft);
  color: var(--accent);
}
.sidebar-foot {
  margin-top: auto;
  display: grid;
  gap: 2px;
}
.who {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  margin-top: var(--space-2);
  border-top: 1px solid var(--border);
}
.who-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--teal-soft);
  color: var(--teal);
  font-weight: 700;
  flex: none;
}
.topbar,
.tabbar {
  display: none;
}
.content {
  min-width: 0;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: 1fr;
  }
  .sidebar {
    display: none;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px var(--space-4);
    padding-top: max(10px, env(safe-area-inset-top));
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .tabbar {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 20;
    padding: 6px 4px max(6px, env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(14px);
    border-top: 1px solid var(--border);
  }
  .tab {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 6px 0;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
    border-radius: 10px;
    min-width: 0;
  }
  .tab span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab.router-link-exact-active,
  .tab.router-link-active:not([href='/']) {
    color: var(--accent);
  }
}
</style>
