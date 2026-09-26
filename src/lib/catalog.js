import { supabase } from './supabase'

// Keep the catalog growing from the work itself.
//
// Antony, 26 Sep 2026: "hii list ilikuwa ukiweka kitu kipya inakitunza — jana
// nimeweka vingi sana, sivioni kwa list hapa." He priced thirteen parts on a
// job card by typing their names, and expected to find them in the picker the
// next day. They were never saved: a typed name that matched nothing was a
// one-off line, and the only way into the catalog was the Inventory screen.
//
// Now any part or service typed onto a job card or quotation is remembered,
// with the price it was given, so it comes up in the picker next time. Cost is
// stored only when the caller could see it (management), otherwise 0 — the
// same rule as the line itself.
//
// Fire-and-forget: a failure here must never fail the line that was saved.

const norm = (s) => String(s || '').trim().toLowerCase()

/**
 * Remember a typed part/service in the catalog if no entry has that name.
 * `known` is the already-loaded catalog (parts or labour_rates rows) so the
 * common case costs no extra round trip.
 * Resolves to true when a new catalog row was written.
 */
export async function rememberCatalogItem({ item_type, description, selling_price, cost_price, quantity, known = [] }) {
  const name = String(description || '').trim()
  if (!name || (item_type !== 'part' && item_type !== 'labour')) return false
  try {
    if (item_type === 'part') {
      if (known.some(p => norm(p.name) === norm(name))) return false
      const { data: dup } = await supabase.from('parts').select('id').ilike('name', name).limit(1)
      if (dup && dup.length) return false
      const { error } = await supabase.from('parts').insert({
        name,
        selling_price: Number(selling_price) || 0,
        cost_price: Number(cost_price) || 0,
        category: 'general',
        is_active: true,
      })
      if (error) throw error
      return true
    }
    if (known.some(l => norm(l.service_name) === norm(name))) return false
    const { data: dup } = await supabase.from('labour_rates').select('id').ilike('service_name', name).limit(1)
    if (dup && dup.length) return false
    const { error } = await supabase.from('labour_rates').insert({
      service_name: name,
      selling_rate: Number(selling_price) || 0,
      cost_rate: Number(cost_price) || 0,
      estimated_hours: Number(quantity) > 0 ? Number(quantity) : 1,
      category: 'service',
      is_active: true,
    })
    if (error) throw error
    return true
  } catch (err) {
    console.error('rememberCatalogItem failed:', err?.message || err)
    return false
  }
}

/** The active catalog, for pickers: { parts, labour }. */
export async function fetchCatalog() {
  const [p, l] = await Promise.all([
    supabase.from('parts').select('id, name, cost_price, selling_price').eq('is_active', true).order('name'),
    supabase.from('labour_rates').select('id, service_name, cost_rate, selling_rate, estimated_hours').eq('is_active', true).order('service_name'),
  ])
  return { parts: p.data || [], labour: l.data || [] }
}
