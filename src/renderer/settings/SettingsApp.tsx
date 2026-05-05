import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  RiUser3Line,
  RiBrainLine,
  RiGoogleLine,
  RiApps2Line,
  RiPaletteLine,
  RiTranslate2,
  RiAddLine,
  RiPencilLine,
  RiDeleteBinLine,
  RiCheckLine,
  RiCloseLine,
  RiRefreshLine,
  RiShieldKeyholeLine,
  RiRobotLine,
  RiSubtractLine,
  RiToolsLine,
  RiMailLine,
  RiCalendar2Line,
  RiHardDriveLine,
  RiFingerprintLine,
  RiKeyLine,
  RiEyeLine,
  RiEyeOffLine,
  RiLockLine,
  RiMicLine,
  RiComputerLine,
  RiCursorLine,
  RiExternalLinkLine,
} from 'react-icons/ri'
import i18n, { toLng } from '../i18n'
import type { MemorySnapshot, Procedure } from '../App'

type Tab = 'profile' | 'memory' | 'apps' | 'language' | 'google' | 'appearance' | 'skills' | 'permissions'

type ProfileItems = Record<string, string>

type DefaultApps = {
  email?: string
  browser?: string
  terminal?: string
  editor?: string
}

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

const NAV_ITEMS: { id: Tab; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'profile',     icon: <RiUser3Line size={18} />,      labelKey: 'settings.tabs.profile' },
  { id: 'memory',      icon: <RiBrainLine size={18} />,      labelKey: 'settings.tabs.memory' },
  { id: 'google',      icon: <RiGoogleLine size={18} />,     labelKey: 'settings.tabs.google' },
  { id: 'skills',      icon: <RiToolsLine size={18} />,      labelKey: 'settings.tabs.skills' },
  { id: 'permissions', icon: <RiLockLine size={18} />,       labelKey: 'settings.tabs.permissions' },
  { id: 'apps',        icon: <RiApps2Line size={18} />,      labelKey: 'settings.tabs.apps' },
  { id: 'appearance',  icon: <RiPaletteLine size={18} />,    labelKey: 'settings.tabs.appearance' },
  { id: 'language',    icon: <RiTranslate2 size={18} />,     labelKey: 'settings.tabs.language' },
]

export function SettingsApp() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('profile')

  const APP_ROWS: { key: keyof DefaultApps; label: string; placeholder: string }[] = [
    { key: 'email',    label: t('settings.apps.email'),    placeholder: 'Spark, Mail, Outlook …' },
    { key: 'browser',  label: t('settings.apps.browser'),  placeholder: 'Arc, Safari, Google Chrome …' },
    { key: 'terminal', label: t('settings.apps.terminal'), placeholder: 'iTerm, Terminal, Warp …' },
    { key: 'editor',   label: t('settings.apps.editor'),   placeholder: 'Visual Studio Code, Xcode …' },
  ]

  const activeNav = NAV_ITEMS.find((n) => n.id === tab)!

  return (
    <div style={containerStyle}>
      {/* Sidebar */}
      <aside style={sidebarStyle}>
        {/* Logo area — draggable */}
        <div style={{ padding: '32px 16px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <RiRobotLine size={16} color="#6366f1" />
            <span style={{ fontSize: 9, color: '#6366f1', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
              ROBOT SECRETARY
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>{t('settings.title')}</div>
        </div>

        {/* Nav items — no-drag */}
        <nav style={{ ...noDrag, flex: 1, padding: '4px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(({ id, icon, labelKey }) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: active ? '#a5b4fc' : '#64748b',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ color: active ? '#818cf8' : '#475569', flexShrink: 0 }}>{icon}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{t(labelKey)}</span>
                {active && (
                  <span style={{
                    marginLeft: 'auto',
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: '#6366f1',
                    flexShrink: 0,
                  }} />
                )}
              </button>
            )
          })}
        </nav>

        {/* Bottom version tag */}
        <div style={{ padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>v0.1.0 // settings</div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Content header — draggable */}
        <div style={{ padding: '32px 24px 14px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#6366f1' }}>{activeNav.icon}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{t(activeNav.labelKey)}</span>
          </div>
        </div>

        {/* Scrollable body — no-drag */}
        <div style={{ ...noDrag, flex: 1, overflowY: 'auto', padding: '20px 24px 28px' }}>
          {tab === 'profile'     && <ProfileTab />}
          {tab === 'memory'      && <MemoryTab />}
          {tab === 'google'      && <GoogleAccountsTab />}
          {tab === 'skills'      && <SkillsTab />}
          {tab === 'permissions' && <PermissionsTab />}
          {tab === 'apps'        && <AppsTab appRows={APP_ROWS} />}
          {tab === 'appearance'  && <AppearanceTab />}
          {tab === 'language'    && <LanguageTab />}
        </div>
      </main>
    </div>
  )
}

// ── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { t } = useTranslation()
  const [items, setItems] = useState<ProfileItems>({})
  const [loaded, setLoaded] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const newKeyRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const result = await window.electronAPI.settingsGetProfile()
    setItems(result as ProfileItems)
    setLoaded(true)
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

  if (!loaded) return <SettingsSkeleton rows={3} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px', lineHeight: 1.6 }}>
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
              <span style={{ fontSize: 12, color: '#94a3b8', width: 110, flexShrink: 0 }}>{key}</span>
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(key); if (e.key === 'Escape') cancelEdit() }}
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <IconBtn onClick={() => saveEdit(key)} title={t('common.save')} accent><RiCheckLine size={14} /></IconBtn>
                <IconBtn onClick={cancelEdit} title={t('common.cancel')}><RiCloseLine size={14} /></IconBtn>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 12, color: '#94a3b8', width: 110, flexShrink: 0 }}>{key}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <IconBtn onClick={() => { setEditingKey(key); setEditValue(value) }} title={t('common.edit')}><RiPencilLine size={14} /></IconBtn>
                <IconBtn onClick={() => deleteItem(key)} title={t('common.delete')} danger><RiDeleteBinLine size={14} /></IconBtn>
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
            style={{ ...inputStyle, width: 120 }}
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelNew() }}
            placeholder={t('settings.profile.valuePlaceholder')}
            style={{ ...inputStyle, flex: 1 }}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <IconBtn onClick={saveNew} title={t('common.add')} accent><RiCheckLine size={14} /></IconBtn>
            <IconBtn onClick={cancelNew} title={t('common.cancel')}><RiCloseLine size={14} /></IconBtn>
          </div>
        </div>
      )}

      {!addingNew && (
        <button
          onClick={() => setAddingNew(true)}
          style={addButtonStyle}
        >
          <RiAddLine size={14} />
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

type MemoryListKind = 'facts' | 'preferences' | 'ongoing_topics'

function MemoryTab() {
  const { t } = useTranslation()
  const [memory, setMemory] = useState<MemorySnapshot>(EMPTY_MEMORY)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const m = await window.electronAPI.settingsGetMemory()
    setMemory(m)
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  const upsertItem = async (kind: MemoryListKind, oldText: string | null, text: string) => {
    const saved = await window.electronAPI.settingsUpsertMemoryItem(kind, oldText, text)
    setMemory(saved)
  }
  const deleteItem = async (kind: MemoryListKind, text: string) => {
    const saved = await window.electronAPI.settingsDeleteMemoryItem(kind, text)
    setMemory(saved)
  }
  const upsertProcedure = async (oldName: string | null, name: string, description: string) => {
    const saved = await window.electronAPI.settingsUpsertProcedure(oldName, name, description)
    setMemory(saved)
  }
  const deleteProcedure = async (name: string) => {
    const saved = await window.electronAPI.settingsDeleteProcedure(name)
    setMemory(saved)
  }

  const reset = async () => {
    if (!confirm(t('settings.memory.resetConfirm'))) return
    const wiped = await window.electronAPI.settingsResetMemory()
    setMemory(wiped)
  }

  if (!loaded) return <SettingsSkeleton rows={4} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
        {t('settings.memory.description')}
      </p>

      <ProcedureSection
        items={memory.procedures}
        onUpsert={upsertProcedure}
        onDelete={deleteProcedure}
      />

      <StringListSection
        title={t('settings.memory.facts')}
        description={t('settings.memory.factsDescription')}
        items={memory.facts}
        onUpsert={(oldText, text) => upsertItem('facts', oldText, text)}
        onDelete={(text) => deleteItem('facts', text)}
        placeholder={t('settings.memory.factPlaceholder')}
      />

      <StringListSection
        title={t('settings.memory.preferences')}
        description={t('settings.memory.preferencesDescription')}
        items={memory.preferences}
        onUpsert={(oldText, text) => upsertItem('preferences', oldText, text)}
        onDelete={(text) => deleteItem('preferences', text)}
        placeholder={t('settings.memory.preferencePlaceholder')}
      />

      <StringListSection
        title={t('settings.memory.topics')}
        description={t('settings.memory.topicsDescription')}
        items={memory.ongoing_topics}
        onUpsert={(oldText, text) => upsertItem('ongoing_topics', oldText, text)}
        onDelete={(text) => deleteItem('ongoing_topics', text)}
        placeholder={t('settings.memory.topicPlaceholder')}
      />

      <button
        onClick={reset}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '9px 16px',
          fontSize: 12,
          fontFamily: 'monospace',
          background: 'rgba(127,29,29,0.25)',
          border: '1px solid rgba(220,38,38,0.4)',
          borderRadius: 8,
          color: '#fca5a5',
          cursor: 'pointer',
          marginTop: 4,
          alignSelf: 'flex-start',
        }}
      >
        <RiDeleteBinLine size={14} />
        {t('settings.memory.resetAll')}
      </button>

      {memory.updatedAt && (
        <p style={{ fontSize: 10, color: '#475569', margin: 0 }}>
          {t('settings.memory.lastUpdated', { date: new Date(memory.updatedAt).toLocaleString() })}
        </p>
      )}
    </div>
  )
}

function StringListSection({
  title, description, items, onUpsert, onDelete, placeholder,
}: {
  title: string
  description: string
  items: string[]
  onUpsert: (oldText: string | null, text: string) => Promise<void>
  onDelete: (text: string) => Promise<void>
  placeholder: string
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const v = draft.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await onUpsert(null, v)
      setDraft('')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (idx: number) => {
    if (busy) return
    setBusy(true)
    try {
      await onDelete(items[idx])
    } finally {
      setBusy(false)
    }
  }
  const startEdit = (idx: number) => { setEditingIdx(idx); setEditValue(items[idx]) }
  const saveEdit = async () => {
    if (editingIdx === null) return
    const v = editValue.trim()
    if (!v) { setEditingIdx(null); return }
    setBusy(true)
    try {
      await onUpsert(items[editingIdx], v)
      setEditingIdx(null)
    } finally {
      setBusy(false)
    }
  }
  const cancelEdit = () => setEditingIdx(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>{title}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{description}</div>

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
                <IconBtn onClick={saveEdit} title={t('common.save')} accent><RiCheckLine size={14} /></IconBtn>
                <IconBtn onClick={cancelEdit} title={t('common.cancel')}><RiCloseLine size={14} /></IconBtn>
              </div>
            </>
          ) : (
            <>
              <span style={{ flex: 1, fontSize: 13, color: '#e2e8f0', minWidth: 0, wordBreak: 'break-word' }}>
                {item}
              </span>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <IconBtn onClick={() => startEdit(idx)} title={t('common.edit')}><RiPencilLine size={14} /></IconBtn>
                <IconBtn onClick={() => remove(idx)} title={t('common.delete')} danger><RiDeleteBinLine size={14} /></IconBtn>
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
        <IconBtn onClick={add} title={t('common.add')} accent><RiAddLine size={14} /></IconBtn>
      </div>
    </div>
  )
}

function ProcedureSection({
  items, onUpsert, onDelete,
}: {
  items: Procedure[]
  onUpsert: (oldName: string | null, name: string, description: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [busy, setBusy] = useState(false)

  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditName(items[idx].name)
    setEditDesc(items[idx].description)
  }
  const saveEdit = async () => {
    if (editingIdx === null) return
    const name = editName.trim()
    const description = editDesc.trim()
    if (!name || !description) { setEditingIdx(null); return }
    const oldName = items[editingIdx].name
    setBusy(true)
    try {
      await onUpsert(oldName, name, description)
      setEditingIdx(null)
    } finally {
      setBusy(false)
    }
  }
  const cancelEdit = () => setEditingIdx(null)
  const remove = async (idx: number) => {
    if (busy) return
    setBusy(true)
    try {
      await onDelete(items[idx].name)
    } finally {
      setBusy(false)
    }
  }
  const addNew = async () => {
    const name = newName.trim()
    const description = newDesc.trim()
    if (!name || !description || busy) return
    setBusy(true)
    try {
      await onUpsert(null, name, description)
      setAdding(false); setNewName(''); setNewDesc('')
    } finally {
      setBusy(false)
    }
  }
  const cancelNew = () => { setAdding(false); setNewName(''); setNewDesc('') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>
        {t('settings.memory.procedures')}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
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
                <IconBtn onClick={saveEdit} title={t('common.save')} accent><RiCheckLine size={14} /></IconBtn>
                <IconBtn onClick={cancelEdit} title={t('common.cancel')}><RiCloseLine size={14} /></IconBtn>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#a5b4fc', minWidth: 0, wordBreak: 'break-word' }}>
                  {p.name}
                </span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <IconBtn onClick={() => startEdit(idx)} title={t('common.edit')}><RiPencilLine size={14} /></IconBtn>
                  <IconBtn onClick={() => remove(idx)} title={t('common.delete')} danger><RiDeleteBinLine size={14} /></IconBtn>
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
            <IconBtn onClick={addNew} title={t('common.add')} accent><RiCheckLine size={14} /></IconBtn>
            <IconBtn onClick={cancelNew} title={t('common.cancel')}><RiCloseLine size={14} /></IconBtn>
          </div>
        </div>
      )}

      {!adding && (
        <button onClick={() => setAdding(true)} style={addButtonStyle}>
          <RiAddLine size={14} />
          {t('settings.memory.addProcedure')}
        </button>
      )}
    </div>
  )
}

// ── Permissions Tab ──────────────────────────────────────────────────────────

type PermissionStatus = {
  micPermission: string
  screenPermission: string
  accessibilityPermission: boolean
}

type PermItem = {
  id: 'microphone' | 'screen' | 'accessibility'
  label: string
  description: string
  icon: React.ReactNode
  granted: boolean
  statusLabel: string
}

function PermissionsTab() {
  const [status, setStatus] = useState<PermissionStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await window.electronAPI.setupGetStatus()
      setStatus({
        micPermission: s.micPermission,
        screenPermission: s.screenPermission,
        accessibilityPermission: s.accessibilityPermission,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const open = (type: 'microphone' | 'screen' | 'accessibility') => {
    window.electronAPI.setupOpenSettings(type)
  }

  if (loading || !status) {
    return <SettingsSkeleton rows={3} />
  }

  const items: PermItem[] = [
    {
      id: 'microphone',
      label: 'マイク',
      description: '音声会話（Gemini Live PTT）に必要です',
      icon: <RiMicLine size={18} />,
      granted: status.micPermission === 'granted',
      statusLabel: status.micPermission === 'granted' ? '許可済み'
        : status.micPermission === 'denied' ? '拒否済み' : '未設定',
    },
    {
      id: 'screen',
      label: '画面収録',
      description: 'スクリーン共有・画面キャプチャ機能に必要です',
      icon: <RiComputerLine size={18} />,
      granted: status.screenPermission === 'granted',
      statusLabel: status.screenPermission === 'granted' ? '許可済み'
        : status.screenPermission === 'denied' ? '拒否済み' : '未設定',
    },
    {
      id: 'accessibility',
      label: 'アクセシビリティ',
      description: 'グローバルホットキー（PTT）の検知に必要です',
      icon: <RiCursorLine size={18} />,
      granted: status.accessibilityPermission,
      statusLabel: status.accessibilityPermission ? '許可済み' : '未許可',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px', lineHeight: 1.6 }}>
        macOS のシステム権限の状態を確認できます。権限が不足している場合はシステム設定を開いて許可してください。
      </p>

      {items.map((item) => (
        <div
          key={item.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '12px 14px',
            background: item.granted ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
            border: `1px solid ${item.granted ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            borderRadius: 10,
          }}
        >
          <span style={{ color: item.granted ? '#4ade80' : '#f87171', flexShrink: 0 }}>
            {item.icon}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{item.label}</span>
              <span style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 4,
                fontWeight: 600,
                background: item.granted ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: item.granted ? '#4ade80' : '#f87171',
              }}>
                {item.statusLabel}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{item.description}</div>
          </div>
          {!item.granted && (
            <button
              onClick={() => open(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(99,102,241,0.2)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 7,
                color: '#a5b4fc',
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              <RiExternalLinkLine size={12} />
              設定を開く
            </button>
          )}
          {item.granted && (
            <span style={{ color: '#4ade80', flexShrink: 0 }}>
              <RiCheckLine size={18} />
            </span>
          )}
        </div>
      ))}

      <button
        onClick={() => void load()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          marginTop: 4,
          padding: '7px 14px',
          fontSize: 11,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 7,
          color: '#94a3b8',
          cursor: 'pointer',
        }}
      >
        <RiRefreshLine size={13} />
        再確認
      </button>
    </div>
  )
}

// ── Google Accounts Tab ──────────────────────────────────────────────────────

type GoogleAccount = {
  email: string
  path: string
  source: 'primary' | 'legacy'
  scopes: string[]
  hasRefreshToken: boolean
  missingScopes: string[]
  expiry: string | null
}

type GoogleSetupInfo = {
  clientSecretPath: string
  clientSecretExists: boolean
  primaryTokensDir: string
  fallbackTokensDir: string
}

function scopeShortName(s: string): string {
  return s.replace(/^https?:\/\/[^/]+\/auth\//, '')
}

// スコープ定義
const SCOPE_OPTIONS = [
  { scope: 'https://www.googleapis.com/auth/userinfo.email', label: 'メールアドレス確認', icon: <RiFingerprintLine size={13} />, required: true },
  { scope: 'https://www.googleapis.com/auth/gmail.readonly', label: 'Gmail 読み取り', icon: <RiMailLine size={13} />, required: false },
  { scope: 'https://www.googleapis.com/auth/gmail.send', label: 'Gmail 送信', icon: <RiMailLine size={13} />, required: false },
  { scope: 'https://www.googleapis.com/auth/gmail.modify', label: 'Gmail 変更（既読・ラベル）', icon: <RiMailLine size={13} />, required: false },
  { scope: 'https://www.googleapis.com/auth/calendar', label: 'Google カレンダー', icon: <RiCalendar2Line size={13} />, required: false },
  { scope: 'https://www.googleapis.com/auth/drive', label: 'Google Drive', icon: <RiHardDriveLine size={13} />, required: false },
] as const

function ScopePanel({ loginHint, defaultScopes, onConfirm, onCancel }: {
  loginHint?: string
  defaultScopes: string[]
  onConfirm: (scopes: string[]) => void
  onCancel: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultScopes))

  const toggle = (scope: string, required: boolean) => {
    if (required) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  return (
    <div style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc' }}>
        {loginHint ? `${loginHint} を再認証` : '権限を選択してアカウントを追加'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {SCOPE_OPTIONS.map(({ scope, label, icon, required }) => {
          const checked = selected.has(scope)
          return (
            <label key={scope} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 7, background: checked ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.03)', border: `1px solid ${checked ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`, cursor: required ? 'default' : 'pointer', transition: 'all 0.12s' }}>
              <input type="checkbox" checked={checked} disabled={required} onChange={() => toggle(scope, required)} style={{ accentColor: '#6366f1', width: 14, height: 14, cursor: required ? 'default' : 'pointer', flexShrink: 0 }} />
              <span style={{ color: '#475569', flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 12, color: checked ? '#e2e8f0' : '#64748b', flex: 1 }}>{label}</span>
              {required && <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>必須</span>}
            </label>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', fontSize: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7, color: '#94a3b8', cursor: 'pointer' }}>
          <RiCloseLine size={13} />キャンセル
        </button>
        <button onClick={() => onConfirm(Array.from(selected))} disabled={selected.size === 0} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 7, color: '#fff', cursor: 'pointer' }}>
          <RiGoogleLine size={13} />ブラウザで認証
        </button>
      </div>
    </div>
  )
}

function GoogleAccountsTab() {
  const { t } = useTranslation()
  const [setup, setSetup] = useState<GoogleSetupInfo | null>(null)
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [authInProgress, setAuthInProgress] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scopePicker, setScopePicker] = useState<{ loginHint?: string; defaultScopes: string[] } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [s, list] = await Promise.all([
        window.electronAPI.googleAccountsCheckSetup(),
        window.electronAPI.googleAccountsList(),
      ])
      setSetup(s)
      setAccounts(list)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const openScopePicker = useCallback((loginHint?: string, existingScopes?: string[]) => {
    const defaultScopes = existingScopes && existingScopes.length > 0
      ? existingScopes
      : SCOPE_OPTIONS.map((s) => s.scope)
    setScopePicker({ loginHint, defaultScopes })
  }, [])

  const handleScopeConfirm = useCallback(async (scopes: string[], loginHint?: string) => {
    setScopePicker(null)
    setError(null)
    setAuthInProgress(true)
    try {
      await window.electronAPI.googleAccountsAdd(loginHint, scopes)
      await reload()
    } catch (e) {
      const msg = String((e as Error).message ?? e)
      if (!/cancelled|settings window closed/i.test(msg)) setError(msg)
    } finally {
      setAuthInProgress(false)
    }
  }, [reload])

  const handleCancelAdd = useCallback(async () => {
    try { await window.electronAPI.googleAccountsAbort() } catch { /* noop */ }
  }, [])

  const handleRemove = useCallback(async (email: string) => {
    if (!confirm(t('settings.google.removeConfirm', { email }))) return
    setError(null)
    try {
      await window.electronAPI.googleAccountsRemove(email)
      await reload()
    } catch (e) {
      setError(String((e as Error).message ?? e))
    }
  }, [reload, t])

  const setupMissing = setup && !setup.clientSecretExists
  const canAdd = !!setup?.clientSecretExists && !authInProgress && !scopePicker

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
        {t('settings.google.description')}
      </div>

      {setupMissing && (
        <div style={{ padding: '12px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, fontSize: 12, color: '#fde68a', lineHeight: 1.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <RiShieldKeyholeLine size={14} />
            <span style={{ whiteSpace: 'pre-wrap' }}>{t('settings.google.noClientSecret')}</span>
          </div>
          <code style={{ display: 'inline-block', padding: '3px 7px', background: 'rgba(0,0,0,0.3)', borderRadius: 4, fontSize: 11, color: '#fff' }}>{setup.clientSecretPath}</code>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => window.electronAPI.openUrl(t('settings.google.clientSecretGuide'))} style={{ background: 'none', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 5, color: '#fde68a', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
              Google Cloud Console を開く ↗
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 12, color: '#fca5a5', whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && accounts.length === 0 && <SettingsSkeleton rows={2} />}
        {!loading && accounts.length === 0 && <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>{t('settings.google.empty')}</div>}
        {accounts.map((acc) => (
          <AccountRow
            key={acc.email}
            account={acc}
            onRemove={() => handleRemove(acc.email)}
            onReauth={() => openScopePicker(acc.email, [...acc.scopes, ...acc.missingScopes])}
            disabled={authInProgress || !!scopePicker}
          />
        ))}
      </div>

      {scopePicker && (
        <ScopePanel
          loginHint={scopePicker.loginHint}
          defaultScopes={scopePicker.defaultScopes}
          onConfirm={(scopes) => handleScopeConfirm(scopes, scopePicker.loginHint)}
          onCancel={() => setScopePicker(null)}
        />
      )}

      {!scopePicker && !authInProgress && (
        <button onClick={() => openScopePicker()} disabled={!canAdd} style={{ ...addButtonStyle, opacity: canAdd ? 1 : 0.4, cursor: canAdd ? 'pointer' : 'not-allowed' }}>
          <RiAddLine size={14} />
          {t('settings.google.addAccount')}
        </button>
      )}

      {authInProgress && (
        <div style={{ padding: '12px 14px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, fontSize: 12, color: '#c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>{t('settings.google.adding')}</span>
          <button onClick={handleCancelAdd} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 5, color: '#e2e8f0', padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
            <RiCloseLine size={13} />{t('settings.google.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}

function AccountRow({
  account, onRemove, onReauth, disabled,
}: {
  account: GoogleAccount
  onRemove: () => void
  onReauth: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const hasMissing = account.missingScopes.length > 0

  return (
    <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <RiGoogleLine size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.email}</span>
          {account.source === 'legacy' && <span style={{ fontSize: 10, color: '#94a3b8', padding: '1px 5px', background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>{t('settings.google.legacyBadge')}</span>}
          {!account.hasRefreshToken && <span style={{ fontSize: 10, color: '#fca5a5', padding: '1px 5px', background: 'rgba(239,68,68,0.1)', borderRadius: 3 }}>{t('settings.google.noRefreshToken')}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={onReauth}
            disabled={disabled}
            title="スコープを選択して再認証"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 11, background: hasMissing ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)', border: `1px solid ${hasMissing ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 5, color: hasMissing ? '#a5b4fc' : '#64748b', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
          >
            <RiRefreshLine size={12} />再認証
          </button>
          <IconBtn onClick={onRemove} title={t('settings.google.remove')} danger>
            <RiDeleteBinLine size={14} />
          </IconBtn>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {account.scopes.map((s) => (
          <span key={s} style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(99,102,241,0.12)', color: '#c7d2fe', borderRadius: 3, fontFamily: 'monospace' }}>
            {scopeShortName(s)}
          </span>
        ))}
      </div>
      {hasMissing && <div style={{ fontSize: 10, color: '#fca5a5' }}>{t('settings.google.missingScopes', { scopes: account.missingScopes.map(scopeShortName).join(', ') })}</div>}
    </div>
  )
}

// ── Skills Tab ───────────────────────────────────────────────────────────────

type SkillSecret = { key: string; label: string; hint?: string }

type SkillInfo = {
  id: string
  label: string
  description: string
  tools: string[]
  enabled: boolean
  secrets: SkillSecret[]
}

function SkillsTab() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [needsRestart, setNeedsRestart] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [list, keys] = await Promise.all([
        window.electronAPI.settingsListSkills(),
        window.electronAPI.authListApiKeys?.() ?? [],
      ])
      setSkills(list)
      const status: Record<string, boolean> = {}
      for (const k of keys) status[k.name] = k.isSet
      setApiKeyStatus(status)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = async (id: string, next: boolean) => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: next } : s)))
    try {
      await window.electronAPI.settingsSetSkillEnabled(id, next)
    } catch {
      await load()
    }
  }

  const onSecretSaved = (keyName: string, isSet: boolean) => {
    setApiKeyStatus((prev) => ({ ...prev, [keyName]: isSet }))
    if (isSet) setNeedsRestart(true)
  }

  if (loading && skills.length === 0) {
    return <SettingsSkeleton rows={4} />
  }

  const CORE_KEYS: SkillSecret[] = [
    { key: 'GEMINI_API_KEY',    label: 'Gemini API Key',    hint: 'Gemini Live 音声会話とメモリ要約で使用' },
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', hint: 'Claude エージェント (delegate_task) で使用' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ── 再起動バナー ── */}
      {needsRestart && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px',
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ fontSize: 12, color: '#fde68a' }}>
              APIキーを反映するには再起動が必要です
            </span>
          </div>
          <button
            onClick={() => window.electronAPI.authRelaunch?.()}
            style={{
              background: 'rgba(251,191,36,0.2)',
              border: '1px solid rgba(251,191,36,0.4)',
              borderRadius: 6,
              color: '#fbbf24',
              fontSize: 11,
              fontWeight: 600,
              padding: '4px 12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            今すぐ再起動
          </button>
        </div>
      )}
      {/* ── コアAPIキー ── */}
      <div style={{
        padding: '12px 14px',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 9,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#a5b4fc', marginBottom: 10 }}>
          コア API キー
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CORE_KEYS.map((s) => (
            <SecretRow
              key={s.key}
              keyName={s.key}
              label={s.label}
              hint={s.hint}
              isSet={apiKeyStatus[s.key] ?? false}
              onSaved={onSecretSaved}
            />
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 2px', lineHeight: 1.6 }}>
        {t('settings.skills.description')}
      </p>
      {skills.map((s) => (
        <SkillRow
          key={s.id}
          skill={s}
          apiKeyStatus={apiKeyStatus}
          onToggle={(next) => toggle(s.id, next)}
          onSecretSaved={onSecretSaved}
        />
      ))}
    </div>
  )
}

function SkillRow({
  skill, apiKeyStatus, onToggle, onSecretSaved,
}: {
  skill: SkillInfo
  apiKeyStatus: Record<string, boolean>
  onToggle: (next: boolean) => void
  onSecretSaved: (keyName: string, isSet: boolean) => void
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '11px 14px',
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${skill.enabled ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: skill.enabled ? '#e2e8f0' : '#64748b',
          }}>
            {skill.label}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>
            {skill.description}
          </div>
        </div>
        <ToggleSwitch checked={skill.enabled} onChange={onToggle} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
        {skill.tools.map((tool) => (
          <span key={tool} style={{
            fontSize: 9,
            padding: '2px 6px',
            background: skill.enabled ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
            color: skill.enabled ? '#c7d2fe' : '#475569',
            borderRadius: 3,
            fontFamily: 'monospace',
          }}>
            {tool}
          </span>
        ))}
      </div>
      {skill.secrets && skill.secrets.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginTop: 4,
          paddingTop: 10,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {skill.secrets.map((s) => (
            <SecretRow
              key={s.key}
              keyName={s.key}
              label={s.label}
              hint={s.hint}
              isSet={apiKeyStatus[s.key] ?? false}
              onSaved={onSecretSaved}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SecretRow({
  keyName, label, hint, isSet, onSaved,
}: {
  keyName: string
  label: string
  hint?: string
  isSet: boolean
  onSaved: (keyName: string, isSet: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await window.electronAPI.settingsSetSecret(keyName, value.trim())
      onSaved(keyName, true)
      setEditing(false)
      setValue('')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    await window.electronAPI.settingsSetSecret(keyName, '')
    onSaved(keyName, false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RiKeyLine size={12} style={{ color: '#64748b', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{label}</span>
        {isSet ? (
          <span style={{
            fontSize: 9, padding: '2px 6px',
            background: 'rgba(34,197,94,0.12)', color: '#4ade80',
            borderRadius: 3, fontWeight: 600,
          }}>設定済み</span>
        ) : (
          <span style={{
            fontSize: 9, padding: '2px 6px',
            background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
            borderRadius: 3,
          }}>未設定</span>
        )}
        {isSet && !editing && (
          <button
            onClick={remove}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 2 }}
          >
            <RiDeleteBinLine size={13} />
          </button>
        )}
        <button
          onClick={() => { setEditing((v) => !v); setValue(''); setShow(false) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', padding: 2 }}
        >
          {editing ? <RiCloseLine size={13} /> : <RiPencilLine size={13} />}
        </button>
      </div>
      {hint && !editing && (
        <span style={{ fontSize: 10, color: '#475569', marginLeft: 20 }}>{hint}</span>
      )}
      {editing && (
        <div style={{ display: 'flex', gap: 6, marginLeft: 20 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void save() }}
              placeholder={isSet ? '新しい値を入力...' : '値を入力...'}
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 6,
                color: '#e2e8f0',
                fontSize: 11,
                padding: '5px 28px 5px 8px',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 0,
              }}
            >
              {show ? <RiEyeOffLine size={12} /> : <RiEyeLine size={12} />}
            </button>
          </div>
          <button
            onClick={() => void save()}
            disabled={saving || !value.trim()}
            style={{
              background: 'rgba(99,102,241,0.8)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 11, padding: '5px 10px', cursor: 'pointer',
              opacity: saving || !value.trim() ? 0.5 : 1,
            }}
          >
            <RiCheckLine size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        width: 38,
        height: 22,
        flexShrink: 0,
        background: checked ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.1)',
        border: '1px solid ' + (checked ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.12)'),
        borderRadius: 999,
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.18s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: checked ? 18 : 2,
        width: 16,
        height: 16,
        background: '#fff',
        borderRadius: '50%',
        transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

// ── Default Apps Tab ─────────────────────────────────────────────────────────

type InstalledApp = { name: string; path: string }

function AppsTab({ appRows }: { appRows: { key: keyof DefaultApps; label: string; placeholder: string }[] }) {
  const { t } = useTranslation()
  const [apps, setApps] = useState<DefaultApps>({})
  const [installed, setInstalled] = useState<InstalledApp[]>([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.electronAPI.settingsGetDefaultApps().then((a) => setApps(a as DefaultApps))
    window.electronAPI.settingsListInstalledApps?.().then((list: InstalledApp[]) => {
      setInstalled(Array.isArray(list) ? list : [])
    })
  }, [])

  const handleChange = async (key: keyof DefaultApps, name: string) => {
    const next = { ...apps, [key]: name }
    setApps(next)
    await window.electronAPI.settingsSaveDefaultApps(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 4px', lineHeight: 1.6 }}>
        {t('settings.apps.description')}
      </p>
      {saved && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#22c55e' }}>
          <RiCheckLine size={13} /> {t('common.saved')}
        </div>
      )}

      {appRows.map(({ key, label }) => (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#94a3b8' }}>{label}</label>
          <AppPickerDropdown
            value={apps[key] ?? ''}
            options={installed}
            onChange={(name) => handleChange(key, name)}
          />
        </div>
      ))}
    </div>
  )
}

// ── App Picker (custom searchable dropdown w/ icons) ─────────────────────────

const ICON_CACHE = new Map<string, string | null>()

function useAppIcon(appPath: string | undefined): string | null {
  const [icon, setIcon] = useState<string | null>(() =>
    appPath && ICON_CACHE.has(appPath) ? ICON_CACHE.get(appPath)! : null
  )
  useEffect(() => {
    if (!appPath) return
    if (ICON_CACHE.has(appPath)) {
      setIcon(ICON_CACHE.get(appPath)!)
      return
    }
    let cancelled = false
    window.electronAPI.settingsGetAppIcon?.(appPath).then((d: string | null) => {
      ICON_CACHE.set(appPath, d ?? null)
      if (!cancelled) setIcon(d ?? null)
    }).catch(() => { /* noop */ })
    return () => { cancelled = true }
  }, [appPath])
  return icon
}

function AppIcon({ appPath, size = 18 }: { appPath?: string; size?: number }) {
  const icon = useAppIcon(appPath)
  if (icon) {
    return <img src={icon} width={size} height={size} style={{ flexShrink: 0, borderRadius: 4 }} alt="" />
  }
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 4,
      background: 'rgba(99,102,241,0.15)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}>
      <RiApps2Line size={size * 0.7} color="#6366f1" />
    </div>
  )
}

function AppPickerDropdown({
  value,
  options,
  onChange,
}: {
  value: string
  options: InstalledApp[]
  onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const selected = options.find((o) => o.name === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [query, options])

  useEffect(() => { setActiveIdx(0) }, [query, open])

  useEffect(() => {
    if (!open) return
    const updateRect = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    inputRef.current?.focus()
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (name: string) => {
    onChange(name)
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...inputStyle,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          textAlign: 'left',
          paddingRight: 28,
          position: 'relative',
        }}
      >
        {selected ? (
          <>
            <AppIcon appPath={selected.path} size={18} />
            <span style={{ flex: 1, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selected.name}
            </span>
          </>
        ) : value ? (
          <>
            <AppIcon size={18} />
            <span style={{ flex: 1, color: '#e2e8f0' }}>{value}</span>
          </>
        ) : (
          <span style={{ flex: 1, color: '#64748b' }}>— 未設定 —</span>
        )}
        <span style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#94a3b8',
          fontSize: 10,
          pointerEvents: 'none',
        }}>▼</span>
      </button>

      {open && rect && createPortal(
        <>
          {/* Backdrop to capture outside clicks */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              background: 'transparent',
            }}
          />
          {/* Floating panel */}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: rect.left,
              top: rect.top,
              width: rect.width,
              zIndex: 9999,
              background: '#0f1020',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: 8,
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 320,
            }}
          >
            <div style={{ padding: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="検索…"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActiveIdx((i) => Math.min(filtered.length - 1, i + 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActiveIdx((i) => Math.max(0, i - 1))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const target = filtered[activeIdx]
                    if (target) select(target.name)
                  }
                }}
                style={{
                  ...inputStyle,
                  background: 'rgba(255,255,255,0.05)',
                  fontSize: 12,
                  padding: '6px 10px',
                }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Clear option */}
              <button
                type="button"
                onClick={() => select('')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                — 未設定 —
              </button>
              {filtered.length === 0 && (
                <div style={{ padding: '14px 12px', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                  該当なし
                </div>
              )}
              {filtered.map((o, idx) => {
                const isActive = idx === activeIdx
                const isSelected = o.name === value
                return (
                  <button
                    key={o.path}
                    type="button"
                    onClick={() => select(o.name)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '7px 10px',
                      width: '100%',
                      background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent',
                      border: 'none',
                      color: isSelected ? '#a5b4fc' : '#e2e8f0',
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <AppIcon appPath={o.path} size={20} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.name}
                    </span>
                    {isSelected && <RiCheckLine size={14} color="#6366f1" />}
                  </button>
                )
              })}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}

// ── Language Tab ─────────────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { code: 'ja-JP', label: '日本語', flag: '🇯🇵' },
  { code: 'en-US', label: 'English', flag: '🇺🇸' },
  { code: 'zh-CN', label: '中文', flag: '🇨🇳' },
  { code: 'ko-KR', label: '한국어', flag: '🇰🇷' },
]

function LanguageTab() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('ja-JP')

  useEffect(() => {
    window.electronAPI?.settingsGetLanguage().then((lang) => setCurrent(lang))
  }, [])

  const select = (code: string) => {
    setCurrent(code)
    i18n.changeLanguage(toLng(code))
    window.electronAPI?.setLanguage(code)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 10px', lineHeight: 1.6 }}>
        {t('settings.language.description')}
      </p>
      {LANGUAGE_OPTIONS.map(({ code, label, flag }) => {
        const active = current === code
        return (
          <button
            key={code}
            onClick={() => select(code)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 16px',
              background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${active ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.08)'}`,
              borderRadius: 9,
              cursor: 'pointer',
              textAlign: 'left',
              color: active ? '#a5b4fc' : '#94a3b8',
              fontSize: 14,
              fontWeight: active ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{flag}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {active && <RiCheckLine size={16} color="#6366f1" />}
          </button>
        )
      })}
    </div>
  )
}

// ── Appearance Tab ──────────────────────────────────────────────────────────

const ROBOT_SIZE_STEP = 20

function AppearanceTab() {
  const { t } = useTranslation()
  const [size, setSize] = useState<number>(300)
  const [min, setMin] = useState<number>(180)
  const [max, setMax] = useState<number>(600)
  const [defaultSize, setDefaultSize] = useState<number>(300)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.electronAPI.appearanceGetRobotSize().then((info) => {
      setSize(info.size)
      setMin(info.min)
      setMax(info.max)
      setDefaultSize(info.default)
      setLoaded(true)
    })
  }, [])

  const apply = useCallback(async (next: number) => {
    const clamped = Math.max(min, Math.min(max, Math.round(next)))
    setSize(clamped)
    const res = await window.electronAPI.appearanceSetRobotSize(clamped)
    setSize(res.size)
  }, [min, max])

  if (!loaded) return <SettingsSkeleton rows={2} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
        {t('settings.appearance.description')}
      </div>

      <div style={{ ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 12, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RiRobotLine size={16} color="#818cf8" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
              {t('settings.appearance.robotSize')}
            </span>
          </div>
          <div style={{
            fontSize: 12,
            fontFamily: 'monospace',
            color: '#a5b4fc',
            background: 'rgba(99,102,241,0.15)',
            padding: '2px 8px',
            borderRadius: 5,
          }}>
            {size}px
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => apply(size - ROBOT_SIZE_STEP)}
            disabled={size <= min}
            style={stepButtonStyle(size <= min)}
            aria-label="decrease"
          >
            <RiSubtractLine size={16} />
          </button>
          <input
            type="range"
            min={min}
            max={max}
            step={10}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            onMouseUp={(e) => apply(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => apply(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => apply(Number((e.target as HTMLInputElement).value))}
            style={{ flex: 1, accentColor: '#6366f1' }}
          />
          <button
            onClick={() => apply(size + ROBOT_SIZE_STEP)}
            disabled={size >= max}
            style={stepButtonStyle(size >= max)}
            aria-label="increase"
          >
            <RiAddLine size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', fontFamily: 'monospace', alignItems: 'center' }}>
          <span>{min}px</span>
          <button
            onClick={() => apply(defaultSize)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 10px',
              fontSize: 10,
              fontFamily: 'monospace',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 5,
              color: '#94a3b8',
              cursor: 'pointer',
            }}
          >
            <RiRefreshLine size={11} />
            {t('settings.appearance.reset')} ({defaultSize}px)
          </button>
          <span>{max}px</span>
        </div>
      </div>
    </div>
  )
}

// ── Shared components & styles ───────────────────────────────────────────────

function IconBtn({
  onClick,
  title,
  children,
  accent,
  danger,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  accent?: boolean
  danger?: boolean
}) {
  const bg = accent
    ? 'rgba(99,102,241,0.25)'
    : danger
    ? 'rgba(239,68,68,0.15)'
    : 'rgba(255,255,255,0.07)'
  const color = accent ? '#a5b4fc' : danger ? '#fca5a5' : '#94a3b8'

  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        background: bg,
        border: 'none',
        borderRadius: 6,
        color,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

// ── Skeleton helpers ────────────────────────────────────────────────────────

const SETTINGS_SHIMMER_STYLES = `
@keyframes settings-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes settings-pulse {
  0%, 100% { opacity: 0.4; }
  50%       { opacity: 0.7; }
}
`

function SkeletonBar({ width = '60%', height = 12, delay = 0 }: { width?: string | number; height?: number; delay?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 5,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 100%)',
        backgroundSize: '200% 100%',
        animation: `settings-shimmer 1.8s ease-in-out infinite, settings-pulse 2s ease-in-out infinite`,
        animationDelay: `${delay}s, ${delay + 0.3}s`,
      }}
    />
  )
}

function SkeletonRow({ delay = 0, wide = false }: { delay?: number; wide?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          flexShrink: 0,
          animation: `settings-pulse 2s ease-in-out ${delay}s infinite`,
        }}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonBar width={wide ? '55%' : '40%'} height={11} delay={delay} />
        <SkeletonBar width={wide ? '80%' : '65%'} height={9} delay={delay + 0.15} />
      </div>
      <SkeletonBar width={52} height={22} delay={delay + 0.1} />
    </div>
  )
}

function SettingsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      <style>{SETTINGS_SHIMMER_STYLES}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} delay={i * 0.1} wide={i % 2 === 0} />
        ))}
      </div>
    </>
  )
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.06)',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.13)',
  borderRadius: 7,
  color: '#e2e8f0',
  padding: '7px 10px',
  fontSize: 13,
  outline: 'none',
  minWidth: 0,
}

const addButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 4,
  padding: '7px 14px',
  fontSize: 12,
  background: 'rgba(99,102,241,0.15)',
  border: '1px dashed rgba(99,102,241,0.4)',
  borderRadius: 8,
  color: '#a5b4fc',
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

function stepButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    fontSize: 18,
    fontWeight: 600,
    background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.18)',
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.4)'}`,
    borderRadius: 8,
    color: disabled ? '#475569' : '#a5b4fc',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
  flexDirection: 'row',
  overflow: 'hidden',
  WebkitAppRegion: 'drag',
} as React.CSSProperties

const sidebarStyle: React.CSSProperties = {
  width: 200,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(255,255,255,0.07)',
  background: 'rgba(0,0,0,0.2)',
  overflow: 'hidden',
}
