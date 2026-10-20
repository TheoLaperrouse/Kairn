import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './ui/styles/tokens.css'
import './ui/styles/base.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { provideApi, providePushClient } from './application/api-provider'
import { useAuthStore } from './application/stores/auth'
import { useTrainingStore } from './application/stores/training'
import { createHttpTrainingApi } from './infrastructure/http/http-training-api'
import { BrowserPushClient, registerServiceWorker } from './infrastructure/push/browser-push-client'
import App from './ui/App.vue'
import { router } from './ui/router'

const pinia = createPinia()

// Session révoquée depuis un autre appareil ou expirée : retour à l'écran de connexion.
provideApi(
  createHttpTrainingApi(() => {
    useAuthStore(pinia).forget()
    useTrainingStore(pinia).reset()
    if (router.currentRoute.value.path !== '/connexion') void router.push('/connexion')
  }),
)

providePushClient(new BrowserPushClient())
registerServiceWorker()

const savedTheme = (() => {
  try {
    return localStorage.getItem('kairn-theme')
  } catch {
    return null
  }
})()
if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme

createApp(App).use(pinia).use(router).mount('#app')
