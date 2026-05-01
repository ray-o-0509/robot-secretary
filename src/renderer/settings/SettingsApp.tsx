import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

type Tab = 'profile' | 'apps' | 'api'

type ProfileItems = Record<string, string>

type DefaultApps = {
  email?: string
  browser?: string
  terminal?: string
  editor?: string
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function SettingsApp() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('profile')

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: 'profile', labelKey: 'settings.tabProfile' },
    { id: 'apps',    labelKey: 'settings.tabApps' },
    { id: 'api',     labelKey: 'settings.tabApi' },
  ]

  return (
    <div style={containerStyle}>
      {/* Header — draggable */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#6366f1', letterSpacing: '0.15em', fontFamily: 'monospace', marginBottom: 4 }}>
              VEGA // SETTINGS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{t('settings.title')}</div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ ...noDrag, display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {tabs.map(({ id, labelKey }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: tab === id ? 600 : 400,
                color: tab === id ? '#a5b4fc' : '#64748b',
                background: 'none',
                border: 'none',
                borderBottom: tab === id ? '2px solid #6366f1' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                whiteSpace: 'nowrap',
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable body — no-drag */}
      <div style={{ ...noDrag, flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'apps'    && <AppsTab />}
        {tab === 'api'     && <ApiTab />}
      </div>
    </div>
  )
}

// ── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { t } = useTranslation()
  const [items, setItems] = useState<ProfileItems>({})
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const newKeyRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const result = await window.electronAPI.settingsGetProfile()
    setItems(result as ProfileItems)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (addingNew) newKeyRef.current?.focus()
  }, [addingNew])

  const saveEdit = async (key: string) => {
    if (!editValue.trim()) return
    await window.electronAPI.settingsUpsertProfile(key, editValue.trim())
    setEditingKey(null)
    await load()
  }

  const cancelEdit = () => setEditingKey(null)

  const deleteItem = async (key: string) => {
    await window.electronAPI.settingsDeleteProfile(key)
    await load()
  }

  const saveNew = async () => {
    const k = newKey.trim()
    const v = newValue.trim()
    if (!k || !v) return
    await window.electronAPI.settingsUpsertProfile(k, v)
    setAddingNew(false)
    setNewKey('')
    setNewValue('')
    await load()
  }

  const cancelNew = () => {
    setAddingNew(false)
    setNewKey('')
    setNewValue('')
  }

  const entries = Object.entries(items)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
        {t('settings.profileDescription')}
      </p>

      {entries.length === 0 && !addingNew && (
        <div style={{ fontSize: 12, color: '#475569', padding: '12px 0' }}>
          {t('settings.noItems')}
        </div>
      )}

      {entries.map(([key, value]) => (
        <div key={key} style={rowStyle}>
          {editingKey === key ? (
            <>
              <span style={{ fontSize: 12, color: '#94a3b8', width: 100, flexShrink: 0 }}>{key}</span>
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(key); if (e.key === 'Escape') cancelEdit() }}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <SmallBtn onClick={() => saveEdit(key)} color="#6366f1">{t('settings.save')}</SmallBtn>
                <SmallBtn onClick={cancelEdit} color="#475569">{t('settings.cancel')}</SmallBtn>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: '#94a3b8', width: 100, flexShrink: 0 }}>{key}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <SmallBtn onClick={() => { setEditingKey(key); setEditValue(value) }} color="#334155">{t('settings.edit')}</SmallBtn>
                <SmallBtn onClick={() => deleteItem(key)} color="#7f1d1d">{t('settings.delete')}</SmallBtn>
              </div>
            </>
          )}
        </div>
      ))}

      {addingNew && (
        <div style={{ ...rowStyle, flexWrap: 'wrap', gap: 6 }}>
          <input
            ref={newKeyRef}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={t('settings.newKeyPlaceholder')}
            style={{ ...inputStyle, width: 110 }}
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelNew() }}
            placeholder={t('settings.newValuePlaceholder')}
            style={{ ...inputStyle, flex: 1 }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <SmallBtn onClick={saveNew} color="#6366f1">{t('settings.add')}</SmallBtn>
            <SmallBtn onClick={cancelNew} color="#475569">{t('settings.cancel')}</SmallBtn>
          </div>
        </div>
      )}

      {!addingNew && (
        <button
          onClick={() => setAddingNew(true)}
          style={{
            marginTop: 4,
            padding: '7px 14px',
            fontSize: 12,
            background: 'rgba(99,102,241,0.15)',
            border: '1px dashed rgba(99,102,241,0.4)',
            borderRadius: 7,
            color: '#a5b4fc',
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {t('settings.addItem')}
        </button>
      )}
    </div>
  )
}

// ── Default Apps Tab ─────────────────────────────────────────────────────────

function AppsTab() {
  const { t } = useTranslation()
  const [apps, setApps] = useState<DefaultApps>({})
  const [saved, setSaved] = useState(false)

  type AppKey = keyof DefaultApps

  const appRows: { key: AppKey; labelKey: string; placeholder: string }[] = [
    { key: 'email',    labelKey: 'settings.email',    placeholder: 'Spark, Mail, Outlook …' },
    { key: 'browser',  labelKey: 'settings.browser',  placeholder: 'Arc, Safari, Google Chrome …' },
    { key: 'terminal', labelKey: 'settings.terminal', placeholder: 'iTerm, Terminal, Warp …' },
    { key: 'editor',   labelKey: 'settings.editor',   placeholder: 'Visual Studio Code, Xcode …' },
  ]

  useEffect(() => {
    window.electronAPI.settingsGetDefaultApps().then((a) => setApps(a as DefaultApps))
  }, [])

  const save = async () => {
    await window.electronAPI.settingsSaveDefaultApps(apps)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px' }}>
        {t('settings.appDescription')}
      </p>

      {appRows.map(({ key, labelKey, placeholder }) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#94a3b8' }}>{t(labelKey)}</label>
          <input
            value={apps[key] ?? ''}
            onChange={(e) => setApps((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder={placeholder}
            style={inputStyle}
          />
        </div>
      ))}

      <button onClick={save} style={saveButtonStyle(saved)}>
        {saved ? t('settings.saved') : t('settings.save')}
      </button>
    </div>
  )
}

// ── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiTab() {
  const { t } = useTranslation()
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('GEMINI_API_KEY') ?? '')
  const [saved, setSaved] = useState(false)

  const save = () => {
    if (geminiKey.trim()) localStorage.setItem('GEMINI_API_KEY', geminiKey.trim())
    else localStorage.removeItem('GEMINI_API_KEY')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#94a3b8' }}>{t('settings.geminiKeyLabel')}</label>
        <input
          type="password"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder="AIza…"
          style={inputStyle}
        />
        <p style={{ fontSize: 10, color: '#475569', margin: '2px 0 0' }}>
          {t('settings.geminiKeyRestart')}
        </p>
      </div>

      <button onClick={save} style={saveButtonStyle(saved)}>
        {saved ? t('settings.saved') : t('settings.save')}
      </button>

      <p style={{ fontSize: 10, color: '#334155', margin: 0 }}>
        {t('settings.googleAuthNote')}
      </p>
    </div>
  )
}

// ── Shared components & styles ───────────────────────────────────────────────

function SmallBtn({ onClick, color, children }: { onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        fontSize: 11,
        background: color,
        border: 'none',
        borderRadius: 5,
        color: '#e2e8f0',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 7,
  border: '1px solid rgba(255,255,255,0.06)',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 7,
  color: '#e2e8f0',
  padding: '6px 10px',
  fontSize: 13,
  outline: 'none',
  minWidth: 0,
}

function saveButtonStyle(saved: boolean): React.CSSProperties {
  return {
    padding: '9px 0',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'monospace',
    background: saved ? 'rgba(74,222,128,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: saved ? '1px solid rgba(74,222,128,0.4)' : 'none',
    borderRadius: 8,
    color: saved ? '#4ade80' : '#fff',
    cursor: 'pointer',
    transition: 'background 0.2s',
    marginTop: 4,
  }
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background: 'linear-gradient(160deg, #0a0a14 0%, #0f1020 100%)',
  color: '#e2e8f0',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  WebkitAppRegion: 'drag',
} as React.CSSProperties
