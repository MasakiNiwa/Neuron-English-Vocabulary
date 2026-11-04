import { useCallback, useEffect, useRef, useState } from 'react'
import { scoreAttempt, type PronounceResult } from '@/lib/pronounce'
import { getSpeechRecognition, type SpeechRecognitionLike } from '@/lib/speech'

export type CheckState =
  | { phase: 'idle' }
  | { phase: 'listening'; interim: string }
  | { phase: 'done'; result: PronounceResult }
  | { phase: 'error'; message: string }

/** 音声認識のエラーを、次にどうすればよいか分かる日本語にする */
function errorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'マイクの使用が許可されていません。ブラウザのアドレスバーなどからマイクを許可してください'
    case 'no-speech':
      return '声が聞き取れませんでした。マイクに近づいて、もう一度話してください'
    case 'audio-capture':
      return 'マイクが見つかりません。接続を確認してください'
    case 'network':
      return '音声認識にはインターネット接続が必要です（ブラウザの音声認識はオンラインで動きます）'
    case 'aborted':
      return ''
    default:
      return `音声認識でエラーが起きました（${code}）`
  }
}

export const speechRecognitionSupported = () => !!getSpeechRecognition()

/**
 * 発音チェックの状態管理。start() で聞き取りを始め、話し終えると自動で止まって採点する。
 * 聞き取り中の途中経過（interim）も返すので、話しながら認識結果を表示できる
 */
export function useSpeechCheck(target: string, onResult?: (r: PronounceResult) => void) {
  const [state, setState] = useState<CheckState>({ phase: 'idle' })
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  // お手本が変わったら（次のカードなど）結果を消す
  useEffect(() => {
    setState({ phase: 'idle' })
    return () => recRef.current?.abort()
  }, [target])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      setState({ phase: 'error', message: 'このブラウザは音声認識に対応していません（Chrome・Edge・Safari で使えます）' })
      return
    }
    recRef.current?.abort()
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.maxAlternatives = 5
    rec.continuous = false
    let finals: string[] | null = null
    let interim = ''
    setState({ phase: 'listening', interim: '' })
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1]
      if (res.isFinal) {
        finals = Array.from(res as ArrayLike<{ transcript: string }>).map((a) => a.transcript)
      } else {
        interim = Array.from(e.results)
          .map((r) => (r as ArrayLike<{ transcript: string }>)[0].transcript)
          .join(' ')
        setState({ phase: 'listening', interim })
      }
    }
    rec.onerror = (e) => {
      const message = errorMessage(e.error)
      setState(message ? { phase: 'error', message } : { phase: 'idle' })
      finals = null
      interim = ''
    }
    rec.onend = () => {
      if (recRef.current !== rec) return
      recRef.current = null
      const alts = finals ?? (interim ? [interim] : null)
      if (!alts) {
        setState((s) => (s.phase === 'listening' ? { phase: 'error', message: errorMessage('no-speech') } : s))
        return
      }
      const result = scoreAttempt(target, alts)
      setState({ phase: 'done', result })
      resultRef.current?.(result)
    }
    try {
      rec.start()
    } catch {
      setState({ phase: 'error', message: '音声認識を開始できませんでした。少し待ってからもう一度お試しください' })
    }
  }, [target])

  /** 話し終えたことを伝える（ここまでの聞き取りで採点する） */
  const stop = useCallback(() => recRef.current?.stop(), [])
  const reset = useCallback(() => {
    recRef.current?.abort()
    recRef.current = null
    setState({ phase: 'idle' })
  }, [])

  return { state, start, stop, reset }
}
