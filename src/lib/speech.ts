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

let pendingSpeak: ReturnType<typeof setTimeout> | undefined

/**
 * 読み上げる。
 * - 前の読み上げが残っているときは止めてから、少し間をおいて読む。止めた直後にすぐ読むと、
 *   ブラウザによっては止めたはずの前の音声の頭が一瞬流れることがあるため
 * - 続けて呼ばれたときは最後の 1 回だけを読む
 */
export function speak(text: string, opts: { rate?: number; lang?: string } = {}) {
  if (!ttsSupported || !text) return
  clearTimeout(pendingSpeak)
  const busy = speechSynthesis.speaking || speechSynthesis.pending
  if (busy) speechSynthesis.cancel()
  const run = () => {
    const { ttsVoiceURI, ttsRate } = useSettings.getState()
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
  if (busy) pendingSpeak = setTimeout(run, 80)
  else run()
}

/** 読み上げを止める（読み上げ待ちも取り消す） */
export function stopSpeaking() {
  if (!ttsSupported) return
  clearTimeout(pendingSpeak)
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel()
}

/**
 * 読み上げの準備（最初の読み上げが遅れないように）。
 * 起動時に声の一覧を読み込み、最初の操作（タップ・キー入力）で音量 0 の短い読み上げをして、音声エンジンを起こしておく
 */
export function warmUpSpeech() {
  if (!ttsSupported) return
  speechSynthesis.getVoices()
  const wake = () => {
    window.removeEventListener('pointerdown', wake, true)
    window.removeEventListener('keydown', wake, true)
    if (speechSynthesis.speaking || speechSynthesis.pending) return
    try {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      speechSynthesis.speak(u)
    } catch {
      /* 準備に失敗しても読み上げ自体はできる */
    }
  }
  window.addEventListener('pointerdown', wake, true)
  window.addEventListener('keydown', wake, true)
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
