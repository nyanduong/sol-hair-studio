/* global document, window */

const filters = document.querySelector('[data-owner-filters]')
if (filters) {
  filters.querySelector('[data-filter-submit]').hidden = true
  filters.addEventListener('change', () => {
    if (filters.reportValidity()) filters.requestSubmit()
  })
  const toggle = filters.querySelector('[data-filter-toggle]')
  const fields = document.getElementById('owner-filter-fields')
  fields.classList.add('hidden', 'sm:grid')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.textContent = 'Lọc lịch'
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true'
    toggle.setAttribute('aria-expanded', String(open))
    toggle.textContent = open ? 'Thu gọn' : 'Lọc lịch'
    fields.classList.toggle('hidden', !open)
  })
}

// Giữ form EJS làm fallback; trình duyệt có dialog sẽ mở thao tác như Web React.
if (typeof document.createElement('dialog').showModal === 'function') {
  document.querySelectorAll('[data-owner-panel]').forEach((panel, index) => {
    const summary = panel.querySelector('summary')
    const content = panel.querySelector('[data-panel-content]')
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'min-h-11 rounded-xl border border-border bg-white px-5 py-2 text-sm font-semibold text-ink hover:bg-soft-surface'
    trigger.textContent = summary.textContent
    const dialog = document.createElement('dialog')
    dialog.className = 'fixed inset-0 m-auto max-h-[92svh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-[28px] border border-border bg-[#fcfbf9] p-6 text-ink shadow-2xl backdrop:bg-ink/40 sm:p-8'
    const heading = document.createElement('h2')
    heading.id = 'owner-action-' + index
    heading.className = 'font-sans text-2xl font-bold sm:text-3xl'
    heading.textContent = summary.textContent
    dialog.setAttribute('aria-labelledby', heading.id)
    dialog.append(heading, content)
    panel.replaceWith(trigger)
    document.body.append(dialog)
    trigger.addEventListener('click', () => dialog.showModal())
    const close = dialog.querySelector('[data-close-panel]')
    close.hidden = false
    close.addEventListener('click', () => dialog.close())
    dialog.addEventListener('close', () => trigger.focus())
    dialog.addEventListener('cancel', event => {
      if (dialog.querySelector('form')?.dataset.submitting) event.preventDefault()
    })
  })
}

document.querySelectorAll('[data-reschedule-form]').forEach(form => {
  form.querySelector('[name="startAt"]').addEventListener('change', () => {
    form.querySelector('[name="customerAgreementConfirmed"]').checked = false
  })
})

document.querySelectorAll('form[method="post"]').forEach(form => {
  form.addEventListener('submit', event => {
    if (form.dataset.submitting) {
      event.preventDefault()
      return
    }
    form.dataset.submitting = 'true'
    const button = form.querySelector('[type="submit"]')
    if (button) {
      button.dataset.label = button.textContent
      button.disabled = true
      button.textContent = 'Đang xử lý…'
    }
  })
})

window.addEventListener('pageshow', () => {
  document.querySelectorAll('form[data-submitting]').forEach(form => {
    delete form.dataset.submitting
    const button = form.querySelector('[type="submit"]')
    if (button) {
      button.disabled = false
      button.textContent = button.dataset.label
    }
  })
})

// Danh dau muc lich dang mo tren layout Admin dung chung, khong sua file layout.
const appointmentNav = document.querySelector('header nav a[href="/owner/appointments"]')
if (appointmentNav) {
  appointmentNav.setAttribute('aria-current', 'page')
  appointmentNav.classList.add('bg-[#b55338]/10', 'text-[#b55338]', 'font-semibold')
}
