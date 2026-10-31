/* global document, window, DOMParser */

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

const dialogs = new Map()
const detail = document.querySelector('[data-appointment-detail]')
const dialogSupported = typeof document.createElement('dialog').showModal === 'function'

function locked(state) {
  return state.pending || (state.busy && state.command)
}

function closeDialog(dialog) {
  if (!locked(dialogs.get(dialog))) dialog.close()
}

function openDialog(dialog) {
  const waiting = [...dialogs].find(([, state]) => locked(state))?.[0]
  if (waiting && waiting !== dialog) {
    if (!waiting.open) waiting.showModal()
    return false
  }
  if (!dialog.open) dialog.showModal()
  return true
}

function createActionDialog(label, trigger, appointmentId, wide = false) {
  const dialog = document.createElement('dialog')
  dialog.className = 'fixed inset-0 m-auto max-h-[96svh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-3xl border border-border bg-[#fcfbf9] p-4 text-ink shadow-2xl backdrop:bg-ink/40 sm:p-5 ' + (wide ? 'max-w-6xl lg:h-[96svh] lg:overflow-hidden' : 'max-w-2xl')
  dialog.setAttribute('aria-label', label)
  dialog.dataset.appointmentActionDialog = appointmentId
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = '×'
  close.setAttribute('aria-label', 'Đóng hộp thoại')
  close.className = 'absolute right-3 top-3 flex size-9 items-center justify-center rounded-xl text-xl text-muted hover:bg-soft-surface disabled:opacity-40'
  close.addEventListener('click', () => closeDialog(dialog))
  const content = document.createElement('div')
  if (wide) content.className = 'lg:flex lg:h-full lg:min-h-0 lg:flex-col'
  content.dataset.dialogContent = ''
  dialog.append(close, content)
  document.body.append(dialog)
  dialogs.set(dialog, { appointmentId, content, close, trigger, pending: false, busy: false, command: null, reader: null })
  dialog.addEventListener('cancel', event => {
    if (locked(dialogs.get(dialog))) event.preventDefault()
  })
  dialog.addEventListener('close', () => {
    const state = dialogs.get(dialog)
    state.reader?.abort()
    state.trigger.focus()
  })
  return dialog
}

function message(container, text) {
  let alert = container.querySelector('[data-dialog-message]')
  if (!alert) {
    alert = document.createElement('p')
    alert.dataset.dialogMessage = ''
    alert.setAttribute('role', 'alert')
    alert.className = 'mt-4 rounded-xl border border-terracotta/20 bg-terracotta/5 p-4 text-sm text-terracotta'
    container.append(alert)
  }
  alert.textContent = text
}

function validateActionUrl(state, href) {
  const url = new URL(href, window.location.href)
  const prefix = '/admin/appointments/' + state.appointmentId + '/'
  if (url.origin !== window.location.origin || !url.pathname.startsWith(prefix)) {
    throw new Error('Yêu cầu không thuộc lịch đang mở. Hãy tải lại chi tiết lịch này.')
  }
  return url
}

// Mọi lần thử lại giữ nguyên URL, body, revision và key của lần gửi chưa rõ kết quả.
async function requestAction(dialog, href, method = 'GET', body = null) {
  const state = dialogs.get(dialog)
  if (state.busy && state.command) return
  if (state.pending && method === 'GET') return
  const writing = method === 'POST'
  const previousForm = state.content.querySelector('[data-reschedule-form]')
  const draft = !writing && previousForm ? {
    staffId: previousForm.querySelector('[name="staffId"]').value,
    reason: previousForm.querySelector('[name="reason"]').value,
  } : null
  let url
  try {
    url = validateActionUrl(state, href)
  } catch (error) {
    message(state.content, error.message)
    return
  }
  state.reader?.abort()
  const controller = new AbortController()
  state.reader = controller
  if (writing) {
    if (!state.pending) state.command = { href: url.href, body }
    url = new URL(state.command.href)
    body = state.command.body
  }
  state.busy = true
  state.close.disabled = writing
  state.content.setAttribute('aria-busy', 'true')
  if (writing) state.content.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = true })
  const timeout = window.setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(url, {
      method, credentials: 'same-origin', signal: controller.signal,
      headers: { 'X-Appointment-Dialog': 'true', ...(writing ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      ...(writing ? { body } : {}),
    })
    if (state.reader !== controller) return
    if (response.redirected && new URL(response.url).pathname === '/admin/login') {
      state.pending = false
      state.command = null
      window.location.assign(response.url)
      return
    }
    const html = new DOMParser().parseFromString(await response.text(), 'text/html')
    const result = html.querySelector('[data-appointment-response]')
    if (!result || result.dataset.appointmentResponse !== state.appointmentId) {
      throw new Error('Không xác định được kết quả cho lịch đang mở.')
    }
    state.content.replaceChildren(document.importNode(result, true))
    const nextForm = state.content.querySelector('[data-reschedule-form]')
    if (draft && nextForm) {
      const staff = nextForm.querySelector('[name="staffId"]')
      if ([...staff.options].some(option => option.value === draft.staffId)) staff.value = draft.staffId
      nextForm.querySelector('[name="reason"]').value = draft.reason
    }
    state.pending = result.dataset.commandState === 'pending'
    state.close.disabled = state.pending
    if (!state.pending) state.command = null
    if (result.dataset.commandState === 'success' && response.ok) {
      const current = new URL(window.location.href)
      if (detail?.dataset.personalStaffId && result.dataset.resultStaffId && result.dataset.resultStaffId !== detail.dataset.personalStaffId) {
        current.searchParams.delete('view')
      }
      window.location.assign(current.href)
      return
    }
    initializeReschedule(state.content)
  } catch {
    if (state.reader !== controller || !dialog.open) return
    if (writing) {
      state.pending = true
      state.close.disabled = true
      state.content.querySelectorAll('input, select, textarea').forEach(input => { input.disabled = true })
      message(state.content, 'Chưa xác định được kết quả. Giữ nguyên yêu cầu, thử lại cùng dữ liệu; không tạo thao tác khác.')
      if (!state.content.querySelector('[data-retry-command]')) {
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.dataset.retryCommand = ''
        retry.className = 'mt-4 min-h-11 rounded-xl bg-terracotta px-5 py-2 text-sm font-semibold text-white'
        retry.textContent = 'Thử lại cùng yêu cầu'
        retry.addEventListener('click', () => requestAction(dialog, state.command.href, 'POST', state.command.body))
        state.content.append(retry)
      }
    } else {
      message(state.content, 'Không tải được giờ trống cho lịch này. Hãy thử lại hoặc quay về chi tiết.')
    }
  } finally {
    window.clearTimeout(timeout)
    if (state.reader === controller) {
      state.busy = false
      state.content.removeAttribute('aria-busy')
      state.close.disabled = state.pending
      if (!writing && !state.pending) initializeReschedule(state.content)
    }
  }
}

function initializeReschedule(root) {
  root.querySelectorAll('[data-reschedule-form]').forEach(form => {
    if (form.dataset.initialized) return
    form.dataset.initialized = 'true'
    const staff = form.querySelector('[name="staffId"]')
    const agreement = form.querySelector('[name="customerAgreementConfirmed"]')
    const reason = form.querySelector('[name="reason"]')
    const confirm = form.querySelector('[type="submit"]')
    function ready() {
      const slot = form.querySelector('[name="startAt"]:checked:not(:disabled)')
      confirm.disabled = !slot || !reason.value.trim() || !agreement.checked
      const summary = form.querySelector('[data-selection-summary]')
      summary.textContent = slot
        ? 'Lịch mới: ' + new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(slot.value)) + ' · ' + staff.selectedOptions[0].textContent
        : 'Chưa chọn giờ mới cho lịch này.'
      summary.classList.toggle('text-terracotta', Boolean(slot))
      summary.classList.toggle('text-muted', !slot)
    }
    function selectStaff(reset = true) {
      if (reset) {
        agreement.checked = false
        form.querySelectorAll('[name="startAt"]').forEach(input => { input.checked = false })
      }
      form.querySelectorAll('[data-slot-staff]').forEach(group => {
        const active = group.dataset.slotStaff === staff.value
        group.hidden = !active
        group.disabled = !active
      })
      const missing = form.querySelector('[data-no-current-slots]')
      if (missing) missing.hidden = staff.value !== form.dataset.currentStaff
      ready()
    }
    form.querySelectorAll('[name="stylistMode"]').forEach(input => input.addEventListener('change', () => {
      const current = input.value === 'current'
      staff.value = current ? form.dataset.currentStaff : [...staff.options].find(option => option.value !== form.dataset.currentStaff)?.value ?? ''
      form.querySelector('[data-staff-select-label]').hidden = current
      selectStaff()
    }))
    staff.addEventListener('change', () => {
      const mode = staff.value === form.dataset.currentStaff ? 'current' : 'other'
      form.querySelector('[name="stylistMode"][value="' + mode + '"]').checked = true
      selectStaff()
    })
    form.querySelectorAll('[name="startAt"]').forEach(input => input.addEventListener('change', () => {
      agreement.checked = false
      ready()
    }))
    reason.addEventListener('input', () => {
      agreement.checked = false
      ready()
    })
    agreement.addEventListener('change', ready)
    const mode = staff.value === form.dataset.currentStaff ? 'current' : 'other'
    form.querySelector('[name="stylistMode"][value="' + mode + '"]').checked = true
    form.querySelector('[data-staff-select-label]').hidden = mode === 'current'
    selectStaff(false)
  })
}

if (dialogSupported && detail) {
  document.querySelectorAll('[data-owner-panel]').forEach(panel => {
    const summary = panel.querySelector('summary')
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'min-h-11 rounded-xl border border-border bg-white px-5 py-2 text-sm font-semibold text-ink hover:bg-soft-surface disabled:cursor-not-allowed disabled:opacity-50'
    trigger.dataset.readyAt = panel.dataset.readyAt
    trigger.textContent = summary.textContent
    const dialog = createActionDialog(summary.textContent, trigger, detail.dataset.appointmentDetail)
    const heading = document.createElement('h2')
    heading.className = 'text-2xl font-bold'
    heading.textContent = summary.textContent
    dialogs.get(dialog).content.append(heading, panel.querySelector('[data-panel-content]'))
    panel.replaceWith(trigger)
    dialog.querySelector('[data-close-panel]').hidden = false
    const initial = dialogs.get(dialog).content.cloneNode(true)
    trigger.addEventListener('click', () => {
      const state = dialogs.get(dialog)
      if (!state.pending && !state.busy && state.content.querySelector('[data-appointment-response]')) {
        state.content.replaceChildren(...initial.cloneNode(true).childNodes)
      }
      openDialog(dialog)
    })
  })
  const trigger = document.querySelector('[data-open-reschedule]')
  if (trigger) {
    const dialog = createActionDialog('Đổi lịch hẹn', trigger, detail.dataset.appointmentDetail, true)
    trigger.addEventListener('click', event => {
      event.preventDefault()
      if (!openDialog(dialog)) return
      const state = dialogs.get(dialog)
      if (locked(state)) return
      const content = state.content
      content.textContent = 'Đang tải giờ trống cho lịch này…'
      void requestAction(dialog, trigger.href)
    })
  }
}

document.addEventListener('click', event => {
  const dialog = event.target.closest('[data-appointment-action-dialog]')
  if (!dialog) return
  if (event.target.closest('a[href]') && locked(dialogs.get(dialog))) {
    event.preventDefault()
    message(dialogs.get(dialog).content, 'Yêu cầu chưa rõ kết quả. Hãy thử lại cùng yêu cầu trước khi chuyển trang.')
    return
  }
  if (event.target.closest('[data-close-panel], [data-close-action]')) {
    event.preventDefault()
    closeDialog(dialog)
    return
  }
  const link = event.target.closest('a[href]')
  if (link && new URL(link.href).pathname.endsWith('/reschedule')) {
    event.preventDefault()
    void requestAction(dialog, link.href)
  }
})

document.addEventListener('submit', event => {
  const form = event.target
  const dialog = form.closest('[data-appointment-action-dialog]')
  if (!dialog) return
  event.preventDefault()
  const state = dialogs.get(dialog)
  if (state.busy) return
  if (!state.pending && !form.reportValidity()) return
  if (form.matches('[data-reschedule-form]')) {
    const selected = form.querySelector('[name="startAt"]:checked:not(:disabled)')
    if (!selected || Date.parse(selected.value) < Date.now()) {
      message(state.content, 'Giờ đã chọn không còn hợp lệ. Hãy chọn lại giờ trống mới nhất.')
      return
    }
  }
  const data = new URLSearchParams(new FormData(form))
  if (form.method.toUpperCase() === 'GET') {
    const url = new URL(form.action)
    url.search = data.toString()
    void requestAction(dialog, url.href)
  } else {
    void requestAction(dialog, form.action, 'POST', data.toString())
  }
})

document.addEventListener('change', event => {
  const form = event.target.closest('[data-reschedule-date-form]')
  if (form && event.target.name === 'localDate') form.requestSubmit()
})

document.addEventListener('input', event => {
  if (!event.target.matches('textarea[name="reason"], input[name="estimatedEndLocal"]')) return
  const form = event.target.closest('form')
  if (!form) return
  form.querySelectorAll('[name="serviceNotStarted"], [name="serviceNotCompleted"], [name="etaConfirmed"]').forEach(input => {
    input.checked = false
  })
})

window.addEventListener('beforeunload', event => {
  if ([...dialogs.values()].some(locked)) {
    event.preventDefault()
    event.returnValue = ''
  }
})

initializeReschedule(document)
function updateTimeConditions() {
  const now = Date.now()
  document.querySelectorAll('button[data-ready-at]').forEach(button => {
    button.disabled = now < Number(button.dataset.readyAt)
  })
  document.querySelectorAll('[data-no-show-hint]').forEach(hint => {
    hint.hidden = now >= Number(hint.dataset.readyAt)
  })
  document.querySelectorAll('[data-require-after]').forEach(input => {
    input.required = now >= Number(input.dataset.requireAfter)
    const label = input.closest('label').querySelector('[data-cancel-reason-label]')
    if (label) label.textContent = input.required ? '(bắt buộc khi sát giờ)' : '(không bắt buộc)'
  })
}
updateTimeConditions()
if (detail) window.setInterval(updateTimeConditions, 1000)
const appointmentNav = document.querySelector('header nav a[href="/owner/appointments"]')
if (appointmentNav) {
  appointmentNav.setAttribute('aria-current', 'page')
  appointmentNav.classList.add('bg-[#b55338]/10', 'text-[#b55338]', 'font-semibold')
}
