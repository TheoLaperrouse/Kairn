import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Device, User } from '../../domain/models'
import { useApi } from '../api-provider'

export const useAuthStore = defineStore('auth', () => {
  const api = useApi()
  const user = ref<User>()
  const ready = ref(false)
  const devices = ref<Device[]>([])

  /** Restaure la session à partir du cookie (appel unique au démarrage). */
  async function restore() {
    if (ready.value) return
    user.value = await api.me()
    ready.value = true
  }

  async function login(email: string, password: string) {
    user.value = await api.login(email, password)
  }

  async function register(email: string, password: string, displayName: string) {
    user.value = await api.register(email, password, displayName)
  }

  async function logout() {
    await api.logout().catch(() => {})
    forget()
  }

  /** Session expirée ou révoquée depuis un autre appareil. */
  function forget() {
    user.value = undefined
    devices.value = []
  }

  async function loadDevices() {
    devices.value = await api.devices()
  }

  async function revokeDevice(id: string) {
    const current = devices.value.find((d) => d.id === id)?.current
    await api.revokeDevice(id)
    if (current) forget()
    else devices.value = devices.value.filter((d) => d.id !== id)
  }

  return { user, ready, devices, restore, login, register, logout, forget, loadDevices, revokeDevice }
})
