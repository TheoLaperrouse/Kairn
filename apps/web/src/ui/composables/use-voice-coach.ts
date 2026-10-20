import { onBeforeUnmount, ref } from 'vue'

const SOUND_KEY = 'kairn-sound'

function readSoundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

/** Annonces (lecteur d'écran et synthèse vocale) et bips de la séance guidée. */
export function useVoiceCoach() {
  const sound = ref(readSoundPreference())
  const announcement = ref('')
  let frenchVoice: SpeechSynthesisVoice | undefined
  let audio: AudioContext | undefined

  function toggleSound() {
    sound.value = !sound.value
    if (!sound.value) window.speechSynthesis?.cancel()
    try {
      localStorage.setItem(SOUND_KEY, sound.value ? 'on' : 'off')
    } catch {
      /* préférence non mémorisée */
    }
  }

  function pickVoice() {
    const voices = window.speechSynthesis?.getVoices() ?? []
    frenchVoice = voices.find((v) => v.lang === 'fr-FR' && v.localService) ?? voices.find((v) => v.lang.startsWith('fr'))
  }

  function say(text: string) {
    announcement.value = text.trim()
    if (!sound.value || !('speechSynthesis' in window)) return
    if (!frenchVoice) pickVoice()
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'fr-FR'
    utterance.rate = 1.05
    if (frenchVoice) utterance.voice = frenchVoice
    window.speechSynthesis.speak(utterance)
  }

  /** À appeler sur un geste de l'utilisateur : sans cela, les navigateurs bloquent l'audio. */
  function unlockAudio() {
    try {
      audio ??= new AudioContext()
      void audio.resume()
    } catch {
      audio = undefined
    }
    if ('speechSynthesis' in window) {
      pickVoice()
      window.speechSynthesis.onvoiceschanged = pickVoice
    }
  }

  function beep(frequency: number, duration: number) {
    if (!sound.value || !audio) return
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start()
    oscillator.stop(audio.currentTime + duration + 0.02)
  }

  onBeforeUnmount(() => {
    window.speechSynthesis?.cancel()
    void audio?.close().catch(() => {})
  })

  return { sound, announcement, toggleSound, say, beep, unlockAudio }
}
