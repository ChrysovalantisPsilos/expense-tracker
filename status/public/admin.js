// Status admin: keeps the new-incident preview in step with the form. The
// preview HTML comes from the Worker (POST /admin/preview), which escapes
// everything it renders, so the page and the preview share one renderer.
const form = document.getElementById('f')
const preview = document.getElementById('pv')

if (form && preview) {
  let timer
  const draw = async () => {
    try {
      const res = await fetch('/admin/preview', { method: 'POST', body: new FormData(form), credentials: 'same-origin' })
      if (res.ok) preview.innerHTML = await res.text()
    } catch {
      // Offline or signed out: keep the last preview.
    }
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(draw, 250) }
  form.addEventListener('input', soon)
  form.addEventListener('change', soon)
  form.addEventListener('reset', () => setTimeout(draw, 0))
}
