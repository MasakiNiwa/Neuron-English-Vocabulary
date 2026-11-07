import { useSettings } from '@/stores/settings'

/**
 * アクセス数の計測（GoatCounter）。
 * - Cookie を使わず、個人を特定する情報は送らない
 * - 送るのは「開いた画面の種類」（/word・/study など）と、AI 機能を使ったという回数だけ。単語名や学習内容は送らない
 * - 設定「アクセス数の計測」をオフにすると何も送らない
 * スクリプト本体は index.html で読み込む（自動計測はオフ: no_onload）
 */

interface GoatCounter {
  count: (vars: { path: string; title?: string; event?: boolean }) => void
}

declare global {
  interface Window {
    goatcounter?: GoatCounter
  }
}

/** ルートのパス（#/e/abandon など）を画面の種類にまとめる。単語名・ID は含めない */
export function sectionOf(pathname: string): string {
  const seg = pathname.split('/').filter(Boolean)[0] ?? ''
  switch (seg) {
    case '':
      return '/'
    case 'e':
      return '/word'
    case 'm':
      return '/morpheme'
    case 'lesson':
      return '/lesson'
    case 'words':
    case 'history':
    case 'network':
    case 'study':
    case 'roots':
    case 'analytics':
    case 'ai':
    case 'settings':
    case 'help':
      return `/${seg}`
    default:
      return '/other'
  }
}

let last = ''
const pending: Array<Parameters<GoatCounter['count']>[0]> = []

function send(vars: Parameters<GoatCounter['count']>[0]) {
  if (!useSettings.getState().analytics) return
  if (import.meta.env.DEV) return
  const gc = window.goatcounter
  if (gc?.count) {
    try {
      gc.count(vars)
    } catch {
      /* 計測の失敗はアプリの動作に影響させない */
    }
  } else if (pending.length < 20) {
    // スクリプトの読み込み前。読み込まれたら送る
    pending.push(vars)
  }
}

/** スクリプトの読み込みを待って、溜めておいた分を送る */
function flushWhenReady(tries = 0) {
  if (!pending.length) return
  if (window.goatcounter?.count) {
    pending.splice(0).forEach(send)
  } else if (tries < 20) {
    setTimeout(() => flushWhenReady(tries + 1), 1000)
  }
}

/** 画面の表示を 1 回数える（同じ画面の連続は数えない） */
export function trackPage(pathname: string) {
  const path = sectionOf(pathname)
  if (path === last) return
  last = path
  send({ path })
  flushWhenReady()
}

/** 機能を使った回数を数える（例: 'ai-chat'） */
export function trackEvent(name: string) {
  send({ path: name, event: true })
  flushWhenReady()
}
