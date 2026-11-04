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
/** 認識器を止め、イベントを受け取らないようにする（古い認識のイベントが新しい状態に混ざらないように。レビュー B02） */
function dispose(rec: SpeechRecognitionLike | null) {
  if (!rec) return
  rec.onresult = null
  rec.onerror = null
  rec.onend = null
  try {
    rec.abort()
  } catch {
    /* すでに止まっている */
  }
}

export function useSpeechCheck(target: string, onResult?: (r: PronounceResult) => void) {
  const [state, setState] = useState<CheckState>({ phase: 'idle' })
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  // お手本が変わったら（次のカードなど）・画面を離れたら、聞き取りを止めて結果を消す。
  // 古い認識器のイベントは受け取らない（別のお手本の結果が新しいお手本に届かないように）
  useEffect(() => {
    setState({ phase: 'idle' })
    return () => {
      dispose(recRef.current)
      recRef.current = null
    }
  }, [target])

  const start = useCallback(() => {
    const SR = getSpeechRecognition()
    if (!SR) {
      setState({ phase: 'error', message: 'このブラウザは音声認識に対応していません（Chrome・Edge・Safari で使えます）' })
      return
    }
    dispose(recRef.current)
    if ('speechSynthesis' in window) speechSynthesis.cancel()
    const rec = new SR()
    recRef.current = rec
    /** このセッション（認識器）がまだ現役か。すべてのイベントで確かめる */
    const live = () => recRef.current === rec
    rec.lang = 'en-US'
    rec.interimResults = true
    rec.maxAlternatives = 5
    rec.continuous = false
    let finals: string[] | null = null
    let interim = ''
    setState({ phase: 'listening', interim: '' })
    rec.onresult = (e) => {
      if (!live()) return
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
      if (!live()) return
      const message = errorMessage(e.error)
      recRef.current = null
      setState(message ? { phase: 'error', message } : { phase: 'idle' })
    }
    rec.onend = () => {
      if (!live()) return
      recRef.current = null
      const alts = finals ?? (interim ? [interim] : null)
      if (!alts) {
        setState({ phase: 'error', message: errorMessage('no-speech') })
        return
      }
      const result = scoreAttempt(target, alts)
      setState({ phase: 'done', result })
      resultRef.current?.(result)
    }
    try {
      rec.start()
    } catch {
      dispose(rec)
      recRef.current = null
      setState({ phase: 'error', message: '音声認識を開始できませんでした。少し待ってからもう一度お試しください' })
    }
  }, [target])

  /** 話し終えたことを伝える（ここまでの聞き取りで採点する） */
  const stop = useCallback(() => recRef.current?.stop(), [])
  const reset = useCallback(() => {
    dispose(recRef.current)
    recRef.current = null
    setState({ phase: 'idle' })
  }, [])

  return { state, start, stop, reset }
}
