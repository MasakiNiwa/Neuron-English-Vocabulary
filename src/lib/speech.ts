import { useEffect, useState } from 'react'
import { useSettings } from '@/stores/settings'

/** Web Speech API（音声合成）のラッパー */
export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported) return []
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => Number(b.localService) - Number(a.localService) || a.lang.localeCompare(b.lang))
}

export function useEnglishVoices() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getEnglishVoices())
  useEffect(() => {
    if (!ttsSupported) return
    const update = () => setVoices(getEnglishVoices())
    speechSynthesis.addEventListener('voiceschanged', update)
    update()
    return () => speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

export function speak(text: string, opts: { rate?: number; lang?: string } = {}) {
  if (!ttsSupported || !text) return
  const { ttsVoiceURI, ttsRate } = useSettings.getState()
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voices = getEnglishVoices()
  const voice =
    voices.find((v) => v.voiceURI === ttsVoiceURI) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices[0]
  if (voice) u.voice = voice
  u.lang = opts.lang ?? voice?.lang ?? 'en-US'
  u.rate = opts.rate ?? ttsRate
  speechSynthesis.speak(u)
}

/** Web Speech API（音声認識）。Chrome / Safari の webkit 実装に対応 */
export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return ((w.SpeechRecognition ?? w.webkitSpeechRecognition) as never) ?? null
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
