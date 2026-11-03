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
    appointmentListRegion.replaceChildren(...document.importNode(next, true).childNodes)
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
