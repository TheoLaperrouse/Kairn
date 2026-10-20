import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** Network state, and whether the data on screen comes from the offline copy. */
export const useConnectivityStore = defineStore('connectivity', () => {
  const online = ref(navigator.onLine)
  const servedFromCache = ref(false)

  window.addEventListener('online', () => (online.value = true))
  window.addEventListener('offline', () => (online.value = false))

  return {
    online,
    servedFromCache,
    offline: computed(() => !online.value || servedFromCache.value),
  }
})
