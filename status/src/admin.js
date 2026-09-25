// /admin routes. Cloudflare Access guards the path; every request is also
// verified here (`verify` → the Access JWT's claims, or null → 403), and every
// POST must come from this origin.
import { accessVerifier } from './access.js'
import { adminHtml, redirect, text } from './http.js'
import { mainView, updateView, editIncidentView, editMaintenanceView, incidentPreview } from './adminView.js'
import {
  addUpdate, createIncident, deleteIncident, deleteMaintenance, editIncident, getIncident,
  getMaintenance, loadPage, saveMaintenance, saveOverrides,
} from './store.js'
import {
  formObject, parseId, validateIncident, validateIncidentEdit, validateMaintenance,
  validateOverrides, validateUpdate,
} from './validate.js'

const MAX_BODY = 32 * 1024
const forbidden = () => text('Forbidden', 403)
const notFound = () => text('Not found', 404)

function sameOrigin(request) {
  const origin = request.headers.get('origin')
  return !!origin && origin === new URL(request.url).origin
}

async function readForm(request) {
  const len = Number(request.headers.get('content-length') || 0)
  const type = request.headers.get('content-type') || ''
  if (len > MAX_BODY || !/^(application\/x-www-form-urlencoded|multipart\/form-data)/.test(type)) return null
  try {
    return formObject(await request.formData())
  } catch {
    return null
  }
}

export async function handleAdmin(request, env, { verify = accessVerifier(env), now = new Date() } = {}) {
  const claims = await verify(request)
  if (!claims) return forbidden()
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/admin'
  const ctx = { email: typeof claims.email === 'string' ? claims.email : '' }
  const db = env.DB
  const nowIso = now.toISOString()
  const m = /^\/admin\/(incidents|maintenance)\/([^/]+)(?:\/(update|updates|edit|delete))?$/.exec(path)
  const id = m ? parseId(m[2]) : null
  if (m && !id) return notFound()

  if (request.method === 'GET' || request.method === 'HEAD') {
    if (path === '/admin') {
      const data = await loadPage(db, nowIso)
      return adminHtml(mainView(data, now, { ...ctx, flash: url.searchParams.get('done'), confirm: url.searchParams.get('confirm') }))
    }
    if (m?.[1] === 'incidents' && (m[3] === 'update' || m[3] === 'edit')) {
      const inc = await getIncident(db, id)
      if (!inc) return notFound()
      return adminHtml(m[3] === 'update' ? updateView(inc, now, ctx) : editIncidentView(inc, now, ctx))
    }
    if (m?.[1] === 'maintenance' && m[3] === 'edit') {
      const mt = await getMaintenance(db, id)
      return mt ? adminHtml(editMaintenanceView(mt, ctx)) : notFound()
    }
    return notFound()
  }

  if (request.method !== 'POST') return text('Method not allowed', 405)
  if (!sameOrigin(request)) return forbidden()
  const form = await readForm(request)
  if (!form) return text('Bad request', 400)

  if (path === '/admin/preview') return adminHtml(incidentPreview(form, now))

  if (path === '/admin/incidents') {
    const v = validateIncident(form)
    if (!v.ok) return adminHtml(mainView(await loadPage(db, nowIso), now, { ...ctx, incident: { draft: form, errors: v.errors } }), 400)
    await createIncident(db, v.value, nowIso)
    return redirect('/admin?done=published')
  }
  if (path === '/admin/maintenance') {
    const v = validateMaintenance(form)
    if (!v.ok) return adminHtml(mainView(await loadPage(db, nowIso), now, { ...ctx, maintenance: { draft: form, errors: v.errors } }), 400)
    await saveMaintenance(db, null, v.value)
    return redirect('/admin?done=scheduled')
  }
  if (path === '/admin/overrides') {
    const v = validateOverrides(form)
    if (!v.ok) return text('Bad request', 400)
    await saveOverrides(db, v.value, nowIso)
    return redirect('/admin?done=overrides')
  }

  if (m?.[1] === 'incidents') {
    const inc = await getIncident(db, id)
    if (!inc) return notFound()
    if (m[3] === 'updates') {
      const v = validateUpdate(form)
      if (!v.ok) return adminHtml(updateView(inc, now, { ...ctx, draft: form, errors: v.errors }), 400)
      await addUpdate(db, id, v.value, nowIso)
      return redirect(`/admin?done=${v.value.stage === 'resolved' ? 'resolved' : 'updated'}`)
    }
    if (m[3] === 'delete') {
      await deleteIncident(db, id)
      return redirect('/admin?done=deleted')
    }
    if (!m[3]) {
      const v = validateIncidentEdit(form, inc.updates.map((u) => u.id))
      if (!v.ok) return adminHtml(editIncidentView(inc, now, { ...ctx, draft: form, errors: v.errors }), 400)
      await editIncident(db, id, v.value)
      return redirect('/admin?done=saved')
    }
  }
  if (m?.[1] === 'maintenance') {
    const mt = await getMaintenance(db, id)
    if (!mt) return notFound()
    if (m[3] === 'delete') {
      await deleteMaintenance(db, id)
      return redirect('/admin?done=deleted')
    }
    if (!m[3]) {
      const v = validateMaintenance(form)
      if (!v.ok) return adminHtml(editMaintenanceView(mt, { ...ctx, draft: form, errors: v.errors }), 400)
      await saveMaintenance(db, id, v.value)
      return redirect('/admin?done=saved')
    }
  }
  return notFound()
}
