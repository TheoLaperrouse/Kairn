import { computed, ref } from 'vue'

/** Chrome/Edge/Samsung Internet event offering to install the app (not standardised, hence the local type). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferred = ref<InstallPromptEvent>()
const installed = ref(isStandalone())

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** Must run at startup: the browser fires `beforeinstallprompt` once, early, and never again. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred.value = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = undefined
  })
}

export function useInstall() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  async function install() {
    const event = deferred.value
    if (!event) return
    await event.prompt()
    if ((await event.userChoice).outcome === 'accepted') installed.value = true
    deferred.value = undefined
  }

  return {
    installed,
    /** The browser can show its own install dialog. */
    canPrompt: computed(() => Boolean(deferred.value)),
    /** Safari on iPhone/iPad: installing goes through the Share menu. */
    ios,
    install,
  }
}
