import { supabase } from './supabase'

// Labour-time tracking (migration 034).
//
// Mechanics log HOURS only — never a price. The office attaches a rate later and
// turns the logged hours into a job_card_items labour line. The portal is anon +
// PIN, so every mechanic call goes through a SECURITY DEFINER RPC that checks the
// job is really theirs (same pattern as evidence.js / findings).

// --- Mechanic portal (anon) ---

export async function logLabour({ mechanicId, jobCardId, hours, note }) {
  const { data, error } = await supabase.rpc('mechanic_log_labour', {
    p_mechanic_id: mechanicId,
    p_job_card_id: jobCardId,
    p_hours: Number(hours),
    p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function fetchMyLabour({ mechanicId, jobCardId }) {
  const { data, error } = await supabase.rpc('mechanic_labour', {
    p_mechanic_id: mechanicId,
    p_job_card_id: jobCardId,
  })
  if (error) throw error
  return data || []
}

export async function deleteLabour({ mechanicId, entryId }) {
  const { error } = await supabase.rpc('mechanic_delete_labour', {
    p_mechanic_id: mechanicId,
    p_entry_id: entryId,
  })
  if (error) throw error
}

// --- Office (authenticated staff) ---

// Every logged entry for a job, newest first, with the mechanic's name. Staff
// read the ledger directly (RLS grants authenticated SELECT).
export async function fetchJobLabour(jobCardId) {
  const { data, error } = await supabase
    .from('labour_entries')
    .select('id, hours, note, work_date, billed, mechanic_id, created_at, mechanics(name)')
    .eq('job_card_id', jobCardId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Roll the still-unbilled hours into ONE labour line on the job card, then mark
// those entries billed so they can't be billed twice. The rate/cost are the
// office's to set — this is the boundary the mechanic never crosses.
//
// Returns the ids that were billed, so the caller can re-total the proforma.
export async function billLoggedLabour({ jobCardId, entries, rate, cost, description }) {
  const unbilled = (entries || []).filter(e => !e.billed)
  if (unbilled.length === 0) throw new Error('no_unbilled_hours')

  const hours = unbilled.reduce((s, e) => s + Number(e.hours || 0), 0)
  if (hours <= 0) throw new Error('no_unbilled_hours')

  const { data: line, error: lineErr } = await supabase
    .from('job_card_items')
    .insert({
      job_card_id: jobCardId,
      item_type: 'labour',
      description: description || `Labour — ${hours} hrs (workshop time)`,
      quantity: hours,
      selling_price: Number(rate) || 0,
      cost_price: Number(cost) || 0,
    })
    .select('id')
    .single()
  if (lineErr) throw lineErr

  const ids = unbilled.map(e => e.id)
  const { error: markErr } = await supabase
    .from('labour_entries')
    .update({ billed: true, job_card_item_id: line.id })
    .in('id', ids)
  if (markErr) throw markErr

  return { itemId: line.id, hours, count: ids.length }
}
