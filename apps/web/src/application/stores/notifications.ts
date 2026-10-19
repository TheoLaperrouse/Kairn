import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { NotificationSettings, NotificationStatus } from '../../domain/models'
import type { PushSupport } from '../ports/push-client'
import { useApi, usePushClient } from '../api-provider'

export const useNotificationsStore = defineStore('notifications', () => {
  const api = useApi()
  const push = usePushClient()
  const status = ref<NotificationStatus>()
  const support = ref<PushSupport>(push.support())
  const deviceEndpoint = ref<string>()
  const calendarUrl = ref<string>()

  const enabledHere = computed(() => Boolean(deviceEndpoint.value && status.value?.devices.some((d) => d.endpoint === deviceEndpoint.value)))

  async function load() {
    support.value = push.support()
    const [loaded, endpoint] = await Promise.all([api.notificationStatus(), push.currentEndpoint().catch(() => undefined)])
    status.value = loaded
    deviceEndpoint.value = endpoint
  }

  async function enable() {
    if (!status.value) await load()
    const subscription = await push.subscribe(status.value!.publicKey)
    status.value = await api.subscribePush(subscription, push.timeZone())
    deviceEndpoint.value = subscription.endpoint
    support.value = push.support()
  }

  async function disable() {
    const endpoint = (await push.unsubscribe()) ?? deviceEndpoint.value
    if (endpoint) status.value = await api.unsubscribePush(endpoint)
    deviceEndpoint.value = undefined
  }

  async function removeDevice(endpoint: string) {
    status.value = await api.unsubscribePush(endpoint)
    if (endpoint === deviceEndpoint.value) await disable()
  }

  async function save(settings: NotificationSettings) {
    status.value = await api.updateNotificationSettings(settings)
  }

  function test() {
    return api.testNotification()
  }

  async function loadCalendar() {
    calendarUrl.value = await api.calendarUrl()
  }

  async function regenerateCalendar() {
    calendarUrl.value = await api.regenerateCalendarUrl()
  }

  return { status, support, deviceEndpoint, enabledHere, calendarUrl, load, enable, disable, removeDevice, save, test, loadCalendar, regenerateCalendar }
})
