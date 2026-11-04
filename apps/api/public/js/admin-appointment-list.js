/* global document, window, DOMParser */

let appointmentListRegion = document.querySelector('[data-owner-appointments-list]')
const listFilters = document.querySelector('[data-owner-filters]')
const listRefreshButton = document.querySelector('[data-refresh-appointments]')
const listUpdatedAt = document.querySelector('[data-list-updated]')
const listStatus = document.querySelector('[data-list-message]')
const listLogin = document.querySelector('[data-list-login]')
let listController = null
let listSequence = 0

function canRefreshAppointmentList() {
  return document.visibilityState !== 'hidden' &&
    !document.querySelector('[data-schedule-dialog][open], [data-appointment-action-dialog][open]') &&
    !listFilters?.contains(document.activeElement) &&
    !appointmentListRegion?.contains(document.activeElement)
}

async function refreshOwnerAppointmentList(manual = false) {
  if (!appointmentListRegion || (!manual && (!canRefreshAppointmentList() || listController))) return
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  const sequence = ++listSequence
  listRefreshButton.disabled = true
  appointmentListRegion.setAttribute('aria-busy', 'true')
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(window.location.href, {
      credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'text/html' },
    })
    if (sequence !== listSequence) return
    if (response.redirected && new URL(response.url).pathname === '/admin/login') {
      listStatus.textContent = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để cập nhật lịch.'
      listLogin.hidden = false
      return
    }
    if (!response.ok) throw new Error('List unavailable')
    const page = new DOMParser().parseFromString(await response.text(), 'text/html')
    const next = page.querySelector('[data-owner-appointments-list]')
    const timestamp = page.querySelector('[data-list-updated]')
    if (!next || !timestamp) throw new Error('Invalid list response')
    if (sequence !== listSequence) return
    // Automatic refresh must not interrupt typing or a focused appointment link.
    if (!manual && !canRefreshAppointmentList()) return
    const focusedHref = appointmentListRegion.contains(document.activeElement) ? document.activeElement.closest('a')?.href : null
    appointmentListRegion.replaceChildren(...document.importNode(next, true).childNodes)
    if (focusedHref) [...appointmentListRegion.querySelectorAll('a')].find(link => link.href === focusedHref)?.focus()
    listUpdatedAt.dateTime = timestamp.dateTime
    listUpdatedAt.textContent = timestamp.textContent
    listStatus.textContent = manual ? 'Đã tải lại danh sách.' : ''
    listLogin.hidden = true
  } catch {
    if (sequence === listSequence) {
      listStatus.textContent = 'Chưa cập nhật được lịch. Dữ liệu đang hiển thị có thể đã cũ; hãy thử tải lại.'
    }
  } finally {
    window.clearTimeout(timeout)
    if (sequence === listSequence) {
      listController = null
      listRefreshButton.disabled = false
      appointmentListRegion.removeAttribute('aria-busy')
    }
  }
}

if (appointmentListRegion && listRefreshButton) {
  listRefreshButton.addEventListener('click', () => { void refreshOwnerAppointmentList(true) })
  window.setInterval(() => { void refreshOwnerAppointmentList() }, 30000)
  window.addEventListener('focus', () => { void refreshOwnerAppointmentList() })
  window.addEventListener('pageshow', event => { if (event.persisted) void refreshOwnerAppointmentList() })
  document.addEventListener('visibilitychange', () => { void refreshOwnerAppointmentList() })
  window.addEventListener('pagehide', () => { listController?.abort() })
}

const scheduleDialog = document.querySelector('[data-schedule-dialog]')
const scheduleFrame = document.querySelector('[data-schedule-frame]')
let scheduleTrigger = null
if (scheduleDialog && typeof scheduleDialog.showModal === 'function') {
  const dialogMessage = document.querySelector('[data-schedule-dialog-message]')
  const dialogHeading = document.querySelector('[data-schedule-heading]')
  const requestOwnerAction = (href, trigger, operation) => {
    document.dispatchEvent(new CustomEvent('owner-action-dialog-request', { detail: { href, trigger, operation } }))
  }
  const openSchedule = link => {
    scheduleTrigger = link
    const url = new URL(link.href, window.location.href)
    url.searchParams.set('embedded', '1')
    dialogHeading.textContent = ''
    const heading = document.createElement('h2')
    heading.id = 'schedule-dialog-title'
    heading.className = 'font-bold'
    heading.textContent = 'Chi tiết lịch hẹn'
    dialogHeading.append(heading)
    dialogMessage.textContent = 'Đang tải chi tiết…'
    scheduleFrame.src = url.href
    scheduleDialog.showModal()
  }
  const canCloseSchedule = () => {
    try {
      if (scheduleFrame.contentDocument?.querySelector('dialog[open], [data-payment-busy="true"]')) {
        dialogMessage.textContent = 'Hãy hoàn tất hoặc đóng thao tác đang mở trước khi đóng chi tiết lịch.'
        return false
      }
    } catch { /* A redirected sign-in page must still be closable. */ }
    return true
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-schedule-detail], [data-schedule-action]')
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return
    event.preventDefault()
    if (link.matches('[data-schedule-action]')) requestOwnerAction(link.href, link, link.dataset.scheduleAction)
    else openSchedule(link)
  })
  scheduleFrame.addEventListener('load', () => {
    if (!scheduleDialog.open) return
    dialogMessage.textContent = ''
    try {
      const header = scheduleFrame.contentDocument?.querySelector('[data-appointment-heading]')
      if (header) {
        dialogHeading.replaceChildren(...document.importNode(header, true).childNodes)
        dialogHeading.querySelector('h2').id = 'schedule-dialog-title'
      }
    } catch { /* A redirected sign-in page has no appointment heading. */ }
    void refreshOwnerAppointmentList(true)
  })
  // Nhận yêu cầu từ đúng iframe chi tiết, đóng nó trước khi mở thao tác riêng.
  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.source !== scheduleFrame.contentWindow ||
        event.data?.type !== 'sol-owner-action' || !['start', 'cancel', 'reschedule'].includes(event.data.operation) ||
        !scheduleDialog.open || !canCloseSchedule()) return
    const current = new URL(scheduleFrame.src, window.location.href)
    const target = new URL(event.data.href, window.location.href)
    if (target.origin !== current.origin || target.pathname !== current.pathname) return
    const trigger = scheduleTrigger
    scheduleDialog.close()
    requestOwnerAction(target.href, trigger, event.data.operation)
  })
  document.addEventListener('owner-action-dialog-saved', () => { void refreshOwnerAppointmentList(true) })
  document.querySelector('[data-schedule-close]').addEventListener('click', () => {
    if (canCloseSchedule()) scheduleDialog.close()
  })
  scheduleDialog.addEventListener('cancel', event => { if (!canCloseSchedule()) event.preventDefault() })
  scheduleDialog.addEventListener('close', () => {
    scheduleFrame.src = 'about:blank'
    scheduleTrigger?.focus()
    void refreshOwnerAppointmentList(true)
  })
}
