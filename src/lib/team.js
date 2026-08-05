import { useState, useEffect } from 'react'
import { supabase } from './supabase'

// Staff messaging and tasks (migration 033). Office staff only — everyone here
// has a real account, so a message belongs to a person and a private one stays
// between the two of them.

export const TEAM_CHANNEL = 'team'   // stands in for recipient_id IS NULL

export async function fetchDirectory() {
  const { data, error } = await supabase.rpc('staff_directory')
  if (error) throw error
  return data || []
}

// One conversation: either the whole-team channel or the thread with one person.
export async function fetchThread(myId, otherId) {
  let q = supabase
    .from('staff_messages')
    .select('id, sender_id, recipient_id, body, read_at, created_at')
    .order('created_at')

  if (otherId === TEAM_CHANNEL) {
    q = q.is('recipient_id', null)
  } else {
    // Both directions of the pair. RLS already limits this to conversations
    // you're part of; this narrows it to the one you're looking at.
    q = q.or(
      `and(sender_id.eq.${myId},recipient_id.eq.${otherId}),` +
      `and(sender_id.eq.${otherId},recipient_id.eq.${myId})`
    )
  }

  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function sendMessage({ senderId, recipientId, body }) {
  const text = (body || '').trim()
  if (!text) throw new Error('empty_message')
  const { data, error } = await supabase.from('staff_messages').insert({
    sender_id: senderId,
    recipient_id: recipientId === TEAM_CHANNEL ? null : recipientId,
    body: text,
  }).select().single()
  if (error) throw error
  return data
}

export async function markThreadRead(myId, otherId) {
  if (otherId === TEAM_CHANNEL) return
  await supabase.from('staff_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', myId)
    .eq('sender_id', otherId)
    .is('read_at', null)
}

// Unread direct messages, per sender, for the badges.
export async function fetchUnreadCounts(myId) {
  const { data, error } = await supabase
    .from('staff_messages')
    .select('sender_id')
    .eq('recipient_id', myId)
    .is('read_at', null)
  if (error) throw error
  return (data || []).reduce((acc, m) => {
    acc[m.sender_id] = (acc[m.sender_id] || 0) + 1
    return acc
  }, {})
}

// ---------- Tasks ----------

export async function fetchTasks() {
  const { data, error } = await supabase
    .from('staff_tasks')
    .select('*')
    .order('status')
    .order('due_date', { nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createTask({ title, details, assignedTo, assignedBy, dueDate }) {
  const { data, error } = await supabase.from('staff_tasks').insert({
    title: (title || '').trim(),
    details: (details || '').trim() || null,
    assigned_to: assignedTo,
    assigned_by: assignedBy,
    due_date: dueDate || null,
  }).select().single()
  if (error) throw error
  return data
}

export async function setTaskStatus(taskId, status) {
  // RLS lets only the assignee or the person who set it change a task, and a
  // blocked update comes back as a silent no-op — so check the returned rows.
  const { data, error } = await supabase.from('staff_tasks').update({
    status,
    completed_at: status === 'done' ? new Date().toISOString() : null,
  }).eq('id', taskId).select('id')
  if (error) throw error
  if (!data?.length) throw new Error('not_allowed')
}

// Badge for the sidebar: how many direct messages are waiting, and how many
// open tasks are on you. Kept live so the nav doesn't lie between page loads.
export function useTeamBadge(myId) {
  const [counts, setCounts] = useState({ unread: 0, tasks: 0 })

  useEffect(() => {
    if (!myId) return
    let cancelled = false

    const load = async () => {
      const [msgs, tasks] = await Promise.all([
        supabase.from('staff_messages').select('id', { count: 'exact', head: true })
          .eq('recipient_id', myId).is('read_at', null),
        supabase.from('staff_tasks').select('id', { count: 'exact', head: true })
          .eq('assigned_to', myId).eq('status', 'open'),
      ])
      if (!cancelled) setCounts({ unread: msgs.count || 0, tasks: tasks.count || 0 })
    }
    load()

    const channel = supabase.channel(`team-badge-${myId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_tasks' }, load)
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [myId])

  return counts
}
