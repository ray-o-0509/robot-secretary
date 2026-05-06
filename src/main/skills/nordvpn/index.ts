import { execInShellPty } from '../shell/shellPty'

const NORDVPN = '/usr/local/bin/nordvpn'

export async function getStatus() {
  try {
    const result = await execInShellPty(`${NORDVPN} status`, process.env.HOME ?? '/')
    if (!result.ok || result.exitCode !== 0) {
      console.error('[nordvpn_status] error:', result.stderr || result.stdout)
      return { ok: false, error: `NordVPN ステータス取得に失敗しました: ${result.stderr || result.stdout}` }
    }
    return { ok: true, status: result.stdout.trim() }
  } catch (e) {
    console.error('[nordvpn_status] unexpected error:', e)
    return { ok: false, error: `予期しないエラーが発生しました: ${e}` }
  }
}

export async function connect(country?: string, city?: string) {
  try {
    const args = [country, city].filter(Boolean).join(' ')
    const cmd = args ? `${NORDVPN} connect ${args}` : `${NORDVPN} connect`
    const result = await execInShellPty(cmd, process.env.HOME ?? '/')
    if (!result.ok || result.exitCode !== 0) {
      console.error(`[nordvpn_connect] error: country=${country} city=${city} →`, result.stderr || result.stdout)
      return { ok: false, error: `VPN 接続に失敗しました: ${result.stderr || result.stdout}` }
    }
    console.log(`[nordvpn_connect] ok: country=${country ?? 'best'} city=${city ?? ''}`)
    return { ok: true, message: result.stdout.trim() }
  } catch (e) {
    console.error('[nordvpn_connect] unexpected error:', e)
    return { ok: false, error: `予期しないエラーが発生しました: ${e}` }
  }
}

export async function disconnect() {
  try {
    const result = await execInShellPty(`${NORDVPN} disconnect`, process.env.HOME ?? '/')
    if (!result.ok || result.exitCode !== 0) {
      console.error('[nordvpn_disconnect] error:', result.stderr || result.stdout)
      return { ok: false, error: `VPN 切断に失敗しました: ${result.stderr || result.stdout}` }
    }
    console.log('[nordvpn_disconnect] ok')
    return { ok: true, message: result.stdout.trim() }
  } catch (e) {
    console.error('[nordvpn_disconnect] unexpected error:', e)
    return { ok: false, error: `予期しないエラーが発生しました: ${e}` }
  }
}

export async function listCountries() {
  try {
    const result = await execInShellPty(`${NORDVPN} countries`, process.env.HOME ?? '/')
    if (!result.ok || result.exitCode !== 0) {
      console.error('[nordvpn_countries] error:', result.stderr || result.stdout)
      return { ok: false, error: `国一覧の取得に失敗しました: ${result.stderr || result.stdout}` }
    }
    return { ok: true, countries: result.stdout.trim() }
  } catch (e) {
    console.error('[nordvpn_countries] unexpected error:', e)
    return { ok: false, error: `予期しないエラーが発生しました: ${e}` }
  }
}
