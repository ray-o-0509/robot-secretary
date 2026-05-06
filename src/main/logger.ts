import * as fs from 'fs'
import * as path from 'path'

const MAX_LOG_BYTES = 5 * 1024 * 1024 // 5 MB

let logPath: string | null = null
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

function serialize(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

function rotateLogs(filePath: string): void {
  try {
    const stat = fs.statSync(filePath)
    if (stat.size >= MAX_LOG_BYTES) {
      fs.renameSync(filePath, `${filePath}.1`)
    }
  } catch {
    // ファイルが存在しない場合は無視
  }
}

function writeLog(level: 'log' | 'warn' | 'error', line: string): void {
  if (!logPath) return
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    rotateLogs(logPath)
    fs.appendFileSync(logPath, `${new Date().toISOString()} [${level}] ${line}\n`)
  } catch {
    // ログ書き込み失敗でアプリ本体を止めない
  }
}

/**
 * アプリ起動時に1回呼ぶ。console をパッチして debug.log へ書き込む。
 */
export function initLogger(debugLogPath: string): void {
  logPath = debugLogPath

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args)
    writeLog('log', serialize(args))
  }
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args)
    writeLog('warn', serialize(args))
  }
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args)
    writeLog('error', serialize(args))
  }
}

export type Logger = {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * モジュール名を先頭に付けたロガーを返す。
 * initLogger() より前に呼ばれてもコンソール出力はされる。
 */
export function createLogger(module: string): Logger {
  const prefix = `[${module}]`
  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  }
}
