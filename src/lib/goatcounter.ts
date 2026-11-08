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
    case 'usage':
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

/** 日付を YYYY-MM-DD に */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 同じ数を何度も取りに行かないよう、30 分だけ覚えておく（GoatCounter の数も数時間おきにしか変わらない） */
const CACHE_KEY = 'nev-gc-cache'
const CACHE_MS = 30 * 60_000
function readCache(url: string): number | undefined {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, [number, number]>
    const hit = c[url]
    return hit && Date.now() - hit[1] < CACHE_MS ? hit[0] : undefined
  } catch {
    return undefined
  }
}
function writeCache(url: string, n: number) {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, [number, number]>
    c[url] = [n, Date.now()]
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* 覚えられなくても数は出せる */
  }
}

/** 最近 days 日の日ごとの数（古い順）。取れなかった日は null */
export async function fetchDaily(path: string, days: number): Promise<{ date: string; count: number | null }[]> {
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000)
    return { date: ymd(d), next: ymd(new Date(d.getTime() + 86_400_000)) }
  })
  const out: { date: string; count: number | null }[] = list.map((x) => ({ date: x.date, count: null }))
  // 一度にたくさん送らないよう、5 件ずつ
  for (let i = 0; i < list.length; i += 5) {
    const part = await Promise.all(list.slice(i, i + 5).map((x) => fetchVisitorCount(path, x.date, x.next)))
    part.forEach((n, j) => (out[i + j].count = n))
  }
  return out
}

const COUNTER_BASE = 'https://masaki28.goatcounter.com/counter/'

/** 公開されている訪問者数を取得する（GoatCounter の設定「Allow adding visitor counts」）。まだ記録がない画面・イベントは 0。取得できなければ null */
export async function fetchVisitorCount(path: string, start?: string, endDate?: string): Promise<number | null> {
  const name = path === 'TOTAL' ? 'TOTAL' : encodeURIComponent(path)
  // 終わりの日は含まれない。start だけだと今日の分が入らないので、終わりを明後日にする（時差の分も含める）
  const end = start ? (endDate ?? ymd(new Date(Date.now() + 2 * 86_400_000))) : ''
  const url = `${COUNTER_BASE}${name}.json${start ? `?start=${start}&end=${end}` : ''}`
  const cached = readCache(url)
  if (cached !== undefined) return cached
  try {
    const res = await fetch(url)
    if (res.status === 404) return 0
    if (!res.ok) return null
    const j = (await res.json()) as { count?: string }
    const n = Number(String(j.count ?? '').replace(/[^\d]/g, ''))
    if (!Number.isFinite(n)) return null
    writeCache(url, n)
    return n
  } catch {
    return null
  }
}

/** AI 機能のイベント名（trackEvent で送っているもの） */
export const AI_EVENTS = ['ai-chat', 'ai-advice', 'ai-word'] as const
