import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Staff notification feed for the Header bell. Reads the notifications table
// (migration 015), keeps an unread count, and live-updates when the client
// portal raises a proforma request or declares a payment.
export function useNotifications() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch()
    // Unique topic per mounted instance. The Header bell and the Dashboard
    // messages panel both use this hook, and a Phoenix socket accepts only one
    // join per topic — a shared name would leave the second subscriber dead.
    const channel = supabase
      .channel(`staff-notifications-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => fetch())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetch])

  const unreadCount = items.filter(n => !n.is_read).length

  const markAllRead = async () => {
    const unreadIds = items.filter(n => !n.is_read).map(n => n.id)
    if (unreadIds.length === 0) return
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds)
  }

  const markRead = async (notifId) => {
    setItems(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n))
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId)
  }

  return { items, unreadCount, loading, markAllRead, markRead, refresh: fetch }
}
