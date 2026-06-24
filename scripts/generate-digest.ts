import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SECTIONS, type SectionMeta } from '../src/lib/sections'
import type { Digest, DigestItem, DigestSection, DigestSource } from '../src/types/digest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = resolve(root, 'data')

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
// 預設用免費 router（自動挑選可用免費模型，避免 slug 變動失效）；
// 可用 OPENROUTER_MODEL 覆寫為固定 slug，例如 google/gemma-4-31b-it:free。
// 注意：CI 以 vars.OPENROUTER_MODEL 注入時，未設定會是空字串，故用 || 讓空值也退回預設
const MODEL = process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free'
const MAX_ITEMS = 5
// 每次 web search 取回的結果數（OpenRouter web plugin / Exa）
const MAX_RESULTS = 5
const TIMEOUT_MS = 60_000
const MAX_RETRIES = 3

/** 以台北時區（Asia/Taipei）取得 YYYY-MM-DD */
function taipeiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date())
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('回應中找不到 JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface RawItem {
  title?: string
  summary?: string
  category?: string
}

/** OpenRouter 回傳的 url_citation annotation（OpenAI Chat Completion 標準格式） */
interface UrlCitation {
  url: string
  title?: string
  content?: string
  start_index?: number
  end_index?: number
}
interface Annotation {
  type: string
  url_citation?: UrlCitation
}
interface ChatMessage {
  content?: string | null
  annotations?: Annotation[]
}
interface ChatResponse {
  choices?: { message?: ChatMessage }[]
  error?: { message?: string }
}

/** 從 annotations 取得去重後的來源清單，並保留原始 index 範圍以利對應到各則項目 */
function collectSources(annotations: Annotation[]): {
  ranges: { source: DigestSource; start: number; end: number }[]
  unique: DigestSource[]
} {
  const ranges: { source: DigestSource; start: number; end: number }[] = []
  const seen = new Set<string>()
  const unique: DigestSource[] = []
  for (const ann of annotations) {
    const c = ann?.url_citation
    if (ann?.type !== 'url_citation' || !c?.url) continue
    const source: DigestSource = { title: c.title ?? c.url, url: c.url }
    ranges.push({
      source,
      start: typeof c.start_index === 'number' ? c.start_index : -1,
      end: typeof c.end_index === 'number' ? c.end_index : -1,
    })
    if (!seen.has(source.url)) {
      seen.add(source.url)
      unique.push(source)
    }
  }
  return { ranges, unique }
}

async function callOpenRouter(apiKey: string, prompt: string): Promise<ChatMessage> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter 建議帶上來源識別（非必填）
        'HTTP-Referer': 'https://github.com/claude-loop',
        'X-Title': 'Daily Digest',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        // web plugin：對任何模型皆有效，回傳標準化的 url_citation annotations
        plugins: [{ id: 'web', max_results: MAX_RESULTS }],
        temperature: 0.3,
      }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${res.statusText}${body ? `：${body.slice(0, 300)}` : ''}`)
    }
    const data = (await res.json()) as ChatResponse
    if (data.error) throw new Error(data.error.message ?? 'OpenRouter 回傳錯誤')
    const message = data.choices?.[0]?.message
    if (!message) throw new Error('回應缺少 choices[0].message')
    return message
  } finally {
    clearTimeout(timer)
  }
}

async function generateSection(apiKey: string, meta: SectionMeta, date: string): Promise<DigestSection> {
  const prompt =
    `今天是 ${date}（台北時間）。請用繁體中文，針對「${meta.title}」版面，` +
    `透過網路搜尋彙整當日最重要的新聞，最多 ${MAX_ITEMS} 則。主題範圍：${meta.topic}。\n` +
    `請只輸出 JSON（不要任何其他文字），格式為：\n` +
    `{"items":[{"title":"標題","summary":"2-3 句中文摘要","category":"分類標籤"}]}`

  let lastErr: unknown
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await callOpenRouter(apiKey, prompt)
      const text = message.content ?? ''
      const parsed = extractJson(text) as { items?: RawItem[] }
      const rawItems = (parsed.items ?? []).slice(0, MAX_ITEMS)

      const { ranges, unique } = collectSources(message.annotations ?? [])

      // 整版皆無可考究來源 → 標記為空（不杜撰來源）
      if (unique.length === 0) {
        return { id: meta.id, title: meta.title, status: 'empty', items: [] }
      }

      // 嘗試以 annotation 的 index 範圍對應到各則項目（找出該項目文字在回應中的位置區間，
      // 取與之重疊的引用來源）；對應不到時退回整版來源（仍皆來自 annotations，可考究）。
      const sourcesForText = (textValue: string): DigestSource[] => {
        const idx = text.indexOf(textValue.slice(0, 24))
        if (idx === -1) return unique
        const itemStart = idx
        const itemEnd = idx + textValue.length
        const seen = new Set<string>()
        const picked: DigestSource[] = []
        for (const r of ranges) {
          if (r.start < 0 || r.end < 0) continue
          const overlaps = r.start <= itemEnd && r.end >= itemStart
          if (overlaps && !seen.has(r.source.url)) {
            seen.add(r.source.url)
            picked.push(r.source)
          }
        }
        return picked.length ? picked : unique
      }

      const items: DigestItem[] = rawItems
        .filter((it) => it.title && it.summary)
        .map((it) => ({
          title: String(it.title),
          summary: String(it.summary),
          category: String(it.category ?? meta.title),
          sources: sourcesForText(`${it.title}。${it.summary}`),
        }))
        // 來源必備：剔除無有效來源的項目
        .filter((it) => it.sources.length > 0)

      if (items.length === 0) {
        return { id: meta.id, title: meta.title, status: 'empty', items: [] }
      }
      return { id: meta.id, title: meta.title, status: 'ok', items }
    } catch (err) {
      lastErr = err
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt)
    }
  }
  throw lastErr
}

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.error('缺少 OPENROUTER_API_KEY 環境變數')
    process.exit(1)
  }

  const date = taipeiDate()
  console.log(`使用模型：${MODEL}`)

  const sections: DigestSection[] = []
  let okCount = 0

  for (const meta of SECTIONS) {
    try {
      const section = await generateSection(apiKey, meta, date)
      sections.push(section)
      if (section.status === 'ok') okCount++
      console.log(`[${meta.id}] ${section.status}（${section.items.length} 則）`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[${meta.id}] 失敗：${message}`)
      sections.push({ id: meta.id, title: meta.title, status: 'error', items: [], error: message })
    }
  }

  // 四版面皆無成功內容 → 不寫檔、以非零 exit code 結束（CI 後續步驟不執行，線上維持前一版）
  if (okCount === 0) {
    console.error('四版面皆無成功內容，中止產生。')
    process.exit(1)
  }

  const digest: Digest = { date, sections }
  mkdirSync(DATA_DIR, { recursive: true })
  const outPath = resolve(DATA_DIR, `${date}.json`)
  writeFileSync(outPath, JSON.stringify(digest, null, 2) + '\n', 'utf8')
  console.log(`已寫入 ${outPath}（成功版面：${okCount}/${SECTIONS.length}）`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
