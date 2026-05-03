import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { toLng } from '../i18n'
import { getGeminiApiKey, setGeminiApiKey, getLanguageCode, setLanguageCode } from '../lib/persistedSettings'
import type { MemorySnapshot, Procedure } from '../App'

type Tab = 'profile' | 'memory' | 'apps' | 'api' | 'language'

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

  const APP_ROWS: { key: keyof DefaultApps; label: string; placeholder: string }[] = [
    { key: 'email',    label: t('settings.apps.email'),    placeholder: 'Spark, Mail, Outlook …' },
    { key: 'browser',  label: t('settings.apps.browser'),  placeholder: 'Arc, Safari, Google Chrome …' },
    { key: 'terminal', label: t('settings.apps.terminal'), placeholder: 'iTerm, Terminal, Warp …' },
    { key: 'editor',   label: t('settings.apps.editor'),   placeholder: 'Visual Studio Code, Xcode …' },
  ]

  return (
    <div style={containerStyle}>
      {/* Header — draggable */}
      <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, color: '#6366f1', letterSpacing: '0.15em', fontFamily: 'monospace', marginBottom: 4 }}>
              ROBOT SECRETARY // SETTINGS
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>{t('settings.title')}</div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ ...noDrag, display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {([
            { id: 'profile',  label: t('settings.tabs.profile') },
            { id: 'memory',   label: t('settings.tabs.memory') },
            { id: 'apps',     label: t('settings.tabs.apps') },
            { id: 'api',      label: t('settings.tabs.api') },
            { id: 'language', label: t('settings.tabs.language') },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
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
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable body — no-drag */}
      <div style={{ ...noDrag, flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
        {tab === 'profile'  && <ProfileTab />}
        {tab === 'memory'   && <MemoryTab />}
        {tab === 'apps'     && <AppsTab appRows={APP_ROWS} />}
        {tab === 'api'      && <ApiTab />}
        {tab === 'language' && <LanguageTab />}
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
        {t('settings.profile.description')}
      </p>

      {entries.length === 0 && !addingNew && (
        <div style={{ fontSize: 12, color: '#475569', padding: '12px 0' }}>
          {t('settings.profile.empty')}
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
                <SmallBtn onClick={() => saveEdit(key)} color="#6366f1">{t('common.save')}</SmallBtn>
                <SmallBtn onClick={cancelEdit} color="#475569">{t('common.cancel')}</SmallBtn>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: '#94a3b8', width: 100, flexShrink: 0 }}>{key}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <SmallBtn onClick={() => { setEditingKey(key); setEditValue(value) }} color="#334155">{t('common.edit')}</SmallBtn>
                <SmallBtn onClick={() => deleteItem(key)} color="#7f1d1d">{t('common.delete')}</SmallBtn>
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
            placeholder={t('settings.profile.keyPlaceholder')}
            style={{ ...inputStyle, width: 110 }}
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelNew() }}
            placeholder={t('settings.profile.valuePlaceholder')}
            style={{ ...inputStyle, flex: 1 }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <SmallBtn onClick={saveNew} color="#6366f1">{t('common.add')}</SmallBtn>
            <SmallBtn onClick={cancelNew} color="#475569">{t('common.cancel')}</SmallBtn>
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
          {t('settings.profile.addItem')}
        </button>
      )}
    </div>
  )
}

// ── Memory Tab ───────────────────────────────────────────────────────────────

const EMPTY_MEMORY: MemorySnapshot = {
  facts: [], preferences: [], ongoing_topics: [], procedures: [], updatedAt: null,
}

function MemoryTab() {
  const { t } = useTranslation()
  const [memory, setMemory] = useState<MemorySnapshot>(EMPTY_MEMORY)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const load = useCallback(async () => {
    const m = await window.electronAPI.settingsGetMemory()
    setMemory(m)
    setDirty(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateList = (key: 'facts' | 'preferences' | 'ongoing_topics', list: string[]) => {
    setMemory((m) => ({ ...m, [key]: list }))
    setDirty(true)
  }
  const updateProcedures = (list: Procedure[]) => {
    setMemory((m) => ({ ...m, procedures: list }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const saved = await window.electronAPI.settingsSaveMemory(memory)
      setMemory(saved)
      setDirty(false)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } finally {
      setSaving(false)
    }
  }

  const reset = async () => {
    if (!confirm(t('settings.memory.resetConfirm'))) return
    const wiped = await window.electronAPI.settingsResetMemory()
    setMemory(wiped)
    setDirty(false)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
        {t('settings.memory.description')}
      </p>

      <ProcedureSection
        items={memory.procedures}
        onChange={updateProcedures}
      />

      <StringListSection
        title={t('settings.memory.facts')}
        description={t('settings.memory.factsDescription')}
        items={memory.facts}
        onChange={(list) => updateList('facts', list)}
        placeholder={t('settings.memory.factPlaceholder')}
      />

      <StringListSection
        title={t('settings.memory.preferences')}
        description={t('settings.memory.preferencesDescription')}
        items={memory.preferences}
        onChange={(list) => updateList('preferences', list)}
        placeholder={t('settings.memory.preferencePlaceholder')}
      />

      <StringListSection
        title={t('settings.memory.topics')}
        description={t('settings.memory.topicsDescription')}
        items={memory.ongoing_topics}
        onChange={(list) => updateList('ongoing_topics', list)}
        placeholder={t('settings.memory.topicPlaceholder')}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            ...saveButtonStyle(savedFlash),
            flex: 1,
            opacity: !dirty && !savedFlash ? 0.4 : 1,
            cursor: !dirty || saving ? 'default' : 'pointer',
          }}
        >
          {savedFlash ? t('common.saved') : saving ? t('common.saving') : t('common.save')}
        </button>
        <button
          onClick={reset}
          style={{
            padding: '9px 18px',
            fontSize: 12,
            fontFamily: 'monospace',
            background: 'rgba(127,29,29,0.25)',
            border: '1px solid rgba(220,38,38,0.4)',
            borderRadius: 8,
            color: '#fca5a5',
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          {t('settings.memory.resetAll')}
        </button>
      </div>

      {memory.updatedAt && (
        <p style={{ fontSize: 10, color: '#475569', margin: 0 }}>
          {t('settings.memory.lastUpdated', { date: new Date(memory.updatedAt).toLocaleString() })}
        </p>
      )}
    </div>
  )
}

function StringListSection({
  title, description, items, onChange, placeholder,
}: {
  title: string
  description: string
  items: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const add = () => {
    const v = draft.trim()
    if (!v) return
    onChange([...items, v])
    setDraft('')
  }
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx))
  const startEdit = (idx: number) => { setEditingIdx(idx); setEditValue(items[idx]) }
  const saveEdit = () => {
    if (editingIdx === null) return
    const v = editValue.trim()
    if (!v) { setEditingIdx(null); return }
    onChange(items.map((x, i) => (i === editingIdx ? v : x)))
    setEditingIdx(null)
  }
  const cancelEdit = () => setEditingIdx(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{description}</div>

      {items.length === 0 && (
        <div style={{ fontSize: 12, color: '#475569', padding: '6px 0' }}>
          {t('settings.memory.empty')}
        </div>
      )}

      {items.map((item, idx) => (
        <div key={idx} style={rowStyle}>
          {editingIdx === idx ? (
            <>
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <SmallBtn onClick={saveEdit} color="#6366f1">{t('common.save')}</SmallBtn>
                <SmallBtn onClick={cancelEdit} color="#475569">{t('common.cancel')}</SmallBtn>
              </div>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', minWidth: 0, wordBreak: 'break-word' }}>
                {item}
              </span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <SmallBtn onClick={() => startEdit(idx)} color="#334155">{t('common.edit')}</SmallBtn>
                <SmallBtn onClick={() => remove(idx)} color="#7f1d1d">{t('common.delete')}</SmallBtn>
              </div>
            </>
          )}
        </div>
      ))}

      <div style={{ ...rowStyle, gap: 6 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder={placeholder}
          style={inputStyle}
        />
        <SmallBtn onClick={add} color="#6366f1">{t('common.add')}</SmallBtn>
      </div>
    </div>
  )
}

function ProcedureSection({
  items, onChange,
}: {
  items: Procedure[]
  onChange: (next: Procedure[]) => void
}) {
  const { t } = useTranslation()
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditName(items[idx].name)
    setEditDesc(items[idx].description)
  }
  const saveEdit = () => {
    if (editingIdx === null) return
    const name = editName.trim()
    const description = editDesc.trim()
    if (!name || !description) { setEditingIdx(null); return }
    const now = new Date().toISOString()
    onChange(items.map((p, i) => (
      i === editingIdx ? { ...p, name, description, updatedAt: now } : p
    )))
    setEditingIdx(null)
  }
  const cancelEdit = () => setEditingIdx(null)
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx))
  const addNew = () => {
    const name = newName.trim()
    const description = newDesc.trim()
    if (!name || !description) return
    const now = new Date().toISOString()
    onChange([...items, { name, description, learnedAt: now, updatedAt: now }])
    setAdding(false); setNewName(''); setNewDesc('')
  }
  const cancelNew = () => { setAdding(false); setNewName(''); setNewDesc('') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>
        {t('settings.memory.procedures')}
      </div>
      <div style={{ fontSize: 11, color: '#64748b' }}>
        {t('settings.memory.proceduresDescription')}
      </div>

      {items.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: '#475569', padding: '6px 0' }}>
          {t('settings.memory.empty')}
        </div>
      )}

      {items.map((p, idx) => (
        <div key={idx} style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          {editingIdx === idx ? (
            <>
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('settings.memory.procedureNamePlaceholder')}
                style={inputStyle}
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder={t('settings.memory.procedureDescPlaceholder')}
                rows={3}
                style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <SmallBtn onClick={saveEdit} color="#6366f1">{t('common.save')}</SmallBtn>
                <SmallBtn onClick={cancelEdit} color="#475569">{t('common.cancel')}</SmallBtn>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#a5b4fc', minWidth: 0, wordBreak: 'break-word' }}>
                  {p.name}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <SmallBtn onClick={() => startEdit(idx)} color="#334155">{t('common.edit')}</SmallBtn>
                  <SmallBtn onClick={() => remove(idx)} color="#7f1d1d">{t('common.delete')}</SmallBtn>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {p.description}
              </div>
              <div style={{ fontSize: 10, color: '#475569' }}>
                {t('settings.memory.learnedAt', { date: new Date(p.learnedAt).toLocaleDateString() })}
              </div>
            </>
          )}
        </div>
      ))}

      {adding && (
        <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('settings.memory.procedureNamePlaceholder')}
            style={inputStyle}
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={t('settings.memory.procedureDescPlaceholder')}
            rows={3}
            style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <SmallBtn onClick={addNew} color="#6366f1">{t('common.add')}</SmallBtn>
            <SmallBtn onClick={cancelNew} color="#475569">{t('common.cancel')}</SmallBtn>
          </div>
        </div>
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          style={{
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
          {t('settings.memory.addProcedure')}
        </button>
      )}
    </div>
  )
}

// ── Default Apps Tab ─────────────────────────────────────────────────────────

function AppsTab({ appRows }: { appRows: { key: keyof DefaultApps; label: string; placeholder: string }[] }) {
  const { t } = useTranslation()
  const [apps, setApps] = useState<DefaultApps>({})
  const [saved, setSaved] = useState(false)

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
        {t('settings.apps.description')}
      </p>

      {appRows.map(({ key, label, placeholder }) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#94a3b8' }}>{label}</label>
          <input
            value={apps[key] ?? ''}
            onChange={(e) => setApps((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder={placeholder}
            style={inputStyle}
          />
        </div>
      ))}

      <button onClick={save} style={saveButtonStyle(saved)}>
        {saved ? t('common.saved') : t('common.save')}
      </button>
    </div>
  )
}

// ── API Keys Tab ─────────────────────────────────────────────────────────────

function ApiTab() {
  const { t } = useTranslation()
  const [geminiKey, setGeminiKey] = useState(getGeminiApiKey())
  const [saved, setSaved] = useState(false)

  const save = () => {
    setGeminiApiKey(geminiKey)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 11, color: '#94a3b8' }}>Gemini API Key</label>
        <input
          type="password"
          value={geminiKey}
          onChange={(e) => setGeminiKey(e.target.value)}
          placeholder="AIza…"
          style={inputStyle}
        />
        <p style={{ fontSize: 10, color: '#475569', margin: '2px 0 0' }}>
          {t('settings.api.restartRequired')}
        </p>
      </div>

      <button onClick={save} style={saveButtonStyle(saved)}>
        {saved ? t('common.saved') : t('common.save')}
      </button>

      <p style={{ fontSize: 10, color: '#334155', margin: 0 }}>
        {t('settings.api.googleAuthNote')}
      </p>
    </div>
  )
}

// ── Language Tab ─────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { code: 'ja-JP', label: '日本語' },
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '中文' },
  { code: 'ko-KR', label: '한국어' },
]

function LanguageTab() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(() => getLanguageCode())

  const select = (code: string) => {
    setLanguageCode(code)
    setCurrent(code)
    i18n.changeLanguage(toLng(code))
    window.electronAPI?.setLanguage(code)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 8px' }}>
        {t('settings.language.description')}
      </p>
      {LANGUAGE_OPTIONS.map(({ code, label }) => {
        const active = current === code
        return (
          <button
            key={code}
            onClick={() => select(code)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 8,
              cursor: 'pointer',
              textAlign: 'left',
              color: active ? '#a5b4fc' : '#94a3b8',
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              border: `2px solid ${active ? '#6366f1' : '#475569'}`,
              background: active ? '#6366f1' : 'transparent',
              flexShrink: 0,
              display: 'inline-block',
            }} />
            {label}
          </button>
        )
      })}
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
