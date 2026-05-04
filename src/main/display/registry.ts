import type { BrowserWindow } from 'electron'

export type DisplayWindowFactory = () => Promise<{ win: BrowserWindow; ready: boolean }>

let factory: DisplayWindowFactory | null = null

export function registerDisplayWindowFactory(f: DisplayWindowFactory): void {
  factory = f
}

export function getDisplayWindowFactory(): DisplayWindowFactory | null {
  return factory
}
