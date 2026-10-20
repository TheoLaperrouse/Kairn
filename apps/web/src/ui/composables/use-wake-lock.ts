import { onBeforeUnmount, onMounted } from 'vue'

/** Keeps the screen on. The lock, lost when the tab goes to the background, is reacquired on return as long as `isActive()`. */
export function useWakeLock(isActive: () => boolean) {
  let wakeLock: WakeLockSentinel | undefined

  async function request() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen')
    } catch {
      wakeLock = undefined
    }
  }

  async function release() {
    await wakeLock?.release().catch(() => {})
    wakeLock = undefined
  }

  function onVisibility() {
    if (document.visibilityState === 'visible' && isActive()) void request()
  }

  onMounted(() => document.addEventListener('visibilitychange', onVisibility))
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    void release()
  })

  return { request, release }
}
