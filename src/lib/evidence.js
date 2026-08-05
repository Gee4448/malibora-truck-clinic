import { supabase } from './supabase'

// Photos the mechanic takes to show the work is really done (client request
// 5 Aug 2026: "if it's fitting something, it's fitted, it's fresh — he should
// be able to put [a photo]").
//
// Files live in the `job-evidence` bucket under <job_card_id>/<uuid>.jpg; the
// row that points at them is written by mechanic_add_evidence(), which checks
// the job belongs to that mechanic (migration 030).

export const EVIDENCE_BUCKET = 'job-evidence'

export const evidenceUrl = (path) =>
  path ? supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path).data.publicUrl : null

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

// A phone photo is 3-6 MB and the workshop uploads over mobile data, so shrink
// it in the browser first. Roughly 150-350 KB comes out the other side.
export function compressImage(file, maxDim = 1400, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('compress_failed'))),
        'image/jpeg',
        quality
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('not_an_image'))
    }
    img.src = url
  })
}

// Puts the file in the bucket and hands back its key. Used both for evidence
// of finished work and for the photo attached to a reported fault.
export async function uploadImage(file, jobCardId) {
  const blob = await compressImage(file)
  const path = `${jobCardId}/${newId()}.jpg`
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return path
}

export async function uploadEvidence({ file, jobCardId, mechanicId, caption, itemId }) {
  const path = await uploadImage(file, jobCardId)

  const { data, error } = await supabase.rpc('mechanic_add_evidence', {
    p_mechanic_id: mechanicId,
    p_job_card_id: jobCardId,
    p_path: path,
    p_caption: caption || null,
    p_item_id: itemId || null,
  })
  if (error) {
    // Don't leave a file behind that nothing points at. Mechanics are anon and
    // the bucket only lets staff delete, so this is best-effort.
    await supabase.storage.from(EVIDENCE_BUCKET).remove([path]).catch(() => {})
    throw error
  }
  return data
}

// A fault the mechanic found that nobody asked him to look at. He files it as
// a finding — never a priced line — and the office turns it into an additional
// item the customer has to approve (migration 032).
export async function reportFinding({ file, jobCardId, mechanicId, description, severity }) {
  const path = file ? await uploadImage(file, jobCardId) : null

  const { data, error } = await supabase.rpc('mechanic_report_finding', {
    p_mechanic_id: mechanicId,
    p_job_card_id: jobCardId,
    p_description: description,
    p_severity: severity || 'medium',
    p_evidence_path: path,
  })
  if (error) {
    if (path) await supabase.storage.from(EVIDENCE_BUCKET).remove([path]).catch(() => {})
    throw error
  }
  return data
}

export async function fetchFindings(jobCardId) {
  const { data, error } = await supabase
    .from('job_findings')
    .select('id, description, severity, status, evidence_path, mechanic_id, created_at')
    .eq('job_card_id', jobCardId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchEvidence(jobCardId) {
  const { data, error } = await supabase
    .from('job_evidence')
    .select('id, storage_path, caption, created_at, mechanic_id, inspection_item_id')
    .eq('job_card_id', jobCardId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
