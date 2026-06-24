import type { UserConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))

/** 掃描 data/ 目錄，列出每個日期對應的 /YYYY-MM-DD 路由 */
function digestRoutes(): string[] {
  try {
    return readdirSync(resolve(root, 'data'))
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => '/' + f.replace(/\.json$/, ''))
  } catch {
    return []
  }
}

type SSGConfig = UserConfig & {
  ssgOptions?: {
    includedRoutes?: (paths: string[]) => string[]
    formatting?: 'minify' | 'prettify' | 'none'
  }
}

const config: SSGConfig = {
  base: '/claude-loop-test/',
  plugins: [vue()],
  ssgOptions: {
    formatting: 'minify',
    includedRoutes() {
      return Array.from(new Set(['/', '/archive', ...digestRoutes()]))
    },
  },
}

export default config
