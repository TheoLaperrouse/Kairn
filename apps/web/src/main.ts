import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './ui/styles/tokens.css'
import './ui/styles/base.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { provideApi, providePushClient } from './application/api-provider'
import { useAuthStore } from './application/stores/auth'
import { useConnectivityStore } from './application/stores/connectivity'
import { useTrainingStore } from './application/stores/training'
import { createHttpTrainingApi } from './infrastructure/http/http-training-api'
import { BrowserPushClient, registerServiceWorker } from './infrastructure/push/browser-push-client'
import App from './ui/App.vue'
import { listenForInstallPrompt } from './ui/composables/use-install'
import { router } from './ui/router'
import { applyTheme } from './ui/theme'

const pinia = createPinia()

provideApi(
  createHttpTrainingApi(
    // Session revoked from another device or expired: back to the login screen.
    () => {
      useAuthStore(pinia).forget()
      useTrainingStore(pinia).reset()
      if (router.currentRoute.value.path !== '/connexion') void router.push('/connexion')
    },
    (fromCache) => (useConnectivityStore(pinia).servedFromCache = fromCache),
  ),
)

providePushClient(new BrowserPushClient())
registerServiceWorker()
listenForInstallPrompt()

const savedTheme = (() => {
  try {
    return localStorage.getItem('kairn-theme')
  } catch {
    return null
  }
})()
if (savedTheme === 'light' || savedTheme === 'dark') applyTheme(savedTheme)

createApp(App).use(pinia).use(router).mount('#app')
