import { useState, useEffect, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase, errorMessage, formatDate } from '../lib/supabase'
import {
  TEAM_CHANNEL, fetchDirectory, fetchThread, sendMessage, markThreadRead,
  fetchUnreadCounts, fetchTasks, createTask, setTaskStatus,
} from '../lib/team'
import {
  MessageSquare, CheckSquare, Send, Users, Plus, X, Check,
  Clock, ArrowLeft, ChevronRight, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'

// The office talking to itself (client request 5 Aug 2026: "the boss can send a
// task to the receptionist ... so communication is easy and smooth").
//
// Messages and tasks are kept apart on purpose: an instruction typed into a
// conversation scrolls away and nobody can tell whether it was ever done.
export default function Team() {
  const { t } = useLanguage()
  const { profile } = useAuth()
  const [tab, setTab] = useState('messages')

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('team.title')}</h1>

      <div className="flex gap-2">
        {[
          { key: 'messages', icon: MessageSquare, label: t('team.messages') },
          { key: 'tasks', icon: CheckSquare, label: t('team.tasks') },
        ].map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === key ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'messages' ? <Messages me={profile} /> : <Tasks me={profile} />}
    </div>
  )
}

// ---------------------------------------------------------------- messages --
function Messages({ me }) {
  const { t } = useLanguage()
  const [people, setPeople] = useState([])
  const [unread, setUnread] = useState({})
  const [active, setActive] = useState(TEAM_CHANNEL)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  const load = async () => {
    try {
      const [dir, counts] = await Promise.all([fetchDirectory(), fetchUnreadCounts(me.id)])
      setPeople(dir.filter(p => p.id !== me.id))
      setUnread(counts)
    } catch (err) {
      toast.error(errorMessage(err, t('team.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  const openThread = async (otherId) => {
    setActive(otherId)
    try {
      setMessages(await fetchThread(me.id, otherId))
      await markThreadRead(me.id, otherId)
      setUnread(prev => ({ ...prev, [otherId]: 0 }))
    } catch (err) {
      toast.error(errorMessage(err, t('team.loadFailed')))
    }
  }

  // On a phone, land on the LIST of people — not inside a conversation. The
  // first build opened the Everyone channel straight away and collapsed the
  // list behind it, so the only thing you could do was text the whole company
  // and there was no visible way to pick one person (Antony, 5 Aug 2026).
  // A wide screen shows both panes at once, so there it is still helpful to
  // have a thread already open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!me?.id) return
    load()
    const wideScreen = typeof window !== 'undefined'
      && window.matchMedia('(min-width: 768px)').matches
    if (wideScreen) openThread(TEAM_CHANNEL)
  }, [me?.id])

  // A message that only turns up on the next page load isn't a chat.
  useEffect(() => {
    if (!me?.id) return
    const channel = supabase.channel(`staff-messages-${me.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_messages' }, (payload) => {
        const m = payload.new
        const mine = m.sender_id === me.id
        const inActiveThread = active === TEAM_CHANNEL
          ? m.recipient_id === null
          : (m.sender_id === active && m.recipient_id === me.id) ||
            (m.sender_id === me.id && m.recipient_id === active)

        if (inActiveThread) {
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
          if (!mine && active !== TEAM_CHANNEL) markThreadRead(me.id, active)
        } else if (!mine && m.recipient_id === me.id) {
          setUnread(prev => ({ ...prev, [m.sender_id]: (prev[m.sender_id] || 0) + 1 }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me?.id, active])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try {
      const sent = await sendMessage({ senderId: me.id, recipientId: active, body: draft })
      setMessages(prev => prev.some(x => x.id === sent.id) ? prev : [...prev, sent])
      setDraft('')
    } catch (err) {
      toast.error(errorMessage(err, t('team.sendFailed')))
    } finally {
      setSending(false)
    }
  }

  const activePerson = people.find(p => p.id === active)
  const activeName = active === TEAM_CHANNEL ? t('team.everyone') : activePerson?.full_name || ''

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden grid md:grid-cols-[260px_1fr] min-h-[28rem]">
      {/* People. On a phone this IS the screen until you tap someone. */}
      <div className={`border-r border-gray-200 md:block ${active ? 'hidden' : ''}`}>
        <p className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 md:hidden">
          {t('team.pickPerson')}
        </p>
        <button onClick={() => openThread(TEAM_CHANNEL)}
          className={`w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 ${
            active === TEAM_CHANNEL ? 'bg-blue-50' : ''
          }`}>
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">{t('team.everyone')}</p>
            <p className="text-xs text-gray-500 truncate">{t('team.everyoneHint')}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 md:hidden" />
        </button>

        {people.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6 px-3">{t('team.noColleagues')}</p>
        ) : people.map((p) => (
          <button key={p.id} onClick={() => openThread(p.id)}
            className={`w-full flex items-center gap-3 p-3.5 text-left hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 ${
              active === p.id ? 'bg-blue-50' : ''
            }`}>
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-gray-600">
              {(p.full_name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{p.full_name}</p>
              <p className="text-xs text-gray-500 truncate">
                {t(`staffAdmin.roles.${p.role}`)}{p.branch_name ? ` · ${p.branch_name}` : ''}
              </p>
            </div>
            {unread[p.id] > 0 && (
              <span className="text-[10px] min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white flex items-center justify-center font-bold flex-shrink-0">
                {unread[p.id]}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 md:hidden" />
          </button>
        ))}
      </div>

      {/* Thread. Hidden on a phone until a person is chosen. */}
      <div className={`flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
        <div className="flex items-center gap-2 p-3 border-b border-gray-200">
          <button onClick={() => setActive(null)}
            className="md:hidden flex items-center gap-1 -ml-1 px-2 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 active:bg-gray-200">
            <ArrowLeft className="w-4 h-4" /> {t('team.allChats')}
          </button>
          <p className="font-semibold text-gray-900 text-sm truncate">{activeName}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[60vh] md:max-h-[26rem] bg-gray-50">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('team.noMessages')}</p>
          ) : messages.map((m) => {
            const mine = m.sender_id === me.id
            const who = people.find(p => p.id === m.sender_id)
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${
                  mine ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'
                }`}>
                  {!mine && active === TEAM_CHANNEL && (
                    <p className="text-[11px] font-semibold text-blue-600 mb-0.5">
                      {who?.full_name || t('team.someone')}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-line break-words">{m.body}</p>
                  <p className={`text-[10px] mt-0.5 ${mine ? 'text-blue-100' : 'text-gray-400'}`}>
                    {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 p-3 border-t border-gray-200">
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={t('team.messagePlaceholder')}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
          <button type="submit" disabled={sending || !draft.trim()}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 disabled:opacity-40">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- tasks --
function Tasks({ me }) {
  const { t } = useLanguage()
  const [tasks, setTasks] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('mine')
  const [form, setForm] = useState({ title: '', details: '', assigned_to: '', due_date: '' })

  const load = async () => {
    try {
      const [list, dir] = await Promise.all([fetchTasks(), fetchDirectory()])
      setTasks(list)
      setPeople(dir)
    } catch (err) {
      toast.error(errorMessage(err, t('team.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error(t('team.titleRequired'))
    if (!form.assigned_to) return toast.error(t('team.assigneeRequired'))
    setSaving(true)
    try {
      await createTask({
        title: form.title,
        details: form.details,
        assignedTo: form.assigned_to,
        assignedBy: me.id,
        dueDate: form.due_date || null,
      })
      toast.success(t('team.taskCreated'))
      setForm({ title: '', details: '', assigned_to: '', due_date: '' })
      setShowForm(false)
      load()
    } catch (err) {
      toast.error(errorMessage(err, t('team.taskFailed')))
    } finally {
      setSaving(false)
    }
  }

  const toggle = async (task) => {
    const next = task.status === 'done' ? 'open' : 'done'
    setTasks(prev => prev.map(x => x.id === task.id ? { ...x, status: next } : x))
    try {
      await setTaskStatus(task.id, next)
    } catch (err) {
      toast.error(err.message === 'not_allowed' ? t('team.notYourTask') : errorMessage(err, t('team.taskFailed')))
      load()
    }
  }

  const nameOf = (id) => people.find(p => p.id === id)?.full_name || '—'
  // ProtectedRoute waits on the session, not the profile, so `me` can still be
  // null here if the profile fetch is slow or failed. Reading me.id directly
  // would take the whole page down.
  const shown = filter === 'mine' ? tasks.filter(x => x.assigned_to === me?.id) : tasks
  const overdue = (x) => x.status === 'open' && x.due_date && new Date(x.due_date) < new Date(new Date().toDateString())

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex gap-2">
          {['mine', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                filter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {t(`team.filter.${f}`)}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 text-sm font-medium">
          <Plus className="w-4 h-4" /> {t('team.newTask')}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{t('team.noTasks')}</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {shown.map((task) => (
            <div key={task.id} className="flex items-start gap-3 py-3">
              <button onClick={() => toggle(task)}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                  task.status === 'done' ? 'bg-green-600 border-green-600' : 'border-gray-300 hover:border-green-500'
                }`}>
                {task.status === 'done' && <Check className="w-3 h-3 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {task.title}
                </p>
                {task.details && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{task.details}</p>}
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                  <span>{t('team.for')}: {nameOf(task.assigned_to)}</span>
                  {task.assigned_by && <span>· {t('team.by')}: {nameOf(task.assigned_by)}</span>}
                  {task.due_date && (
                    <span className={`flex items-center gap-1 ${overdue(task) ? 'text-red-600 font-medium' : ''}`}>
                      <Clock className="w-3 h-3" /> {formatDate(task.due_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm modal-card">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-bold">{t('team.newTask')}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.taskTitle')} *</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required
                  placeholder={t('team.taskTitlePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.taskDetails')}</label>
                <textarea value={form.details} onChange={e => setForm({ ...form, details: e.target.value })} rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.assignTo')} *</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                  <option value="">{t('team.choosePerson')}</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} — {t(`staffAdmin.roles.${p.role}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('team.dueDate')}</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-blue-700 text-white font-medium rounded-lg hover:bg-blue-800 disabled:opacity-50">
                  {saving ? t('common.loading') : t('team.assign')}
                </button>
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50">
                  {t('common.cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
