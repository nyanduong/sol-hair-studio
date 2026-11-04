/* global document, window */
(() => {
  const q = selector => document.querySelector(selector)
  const root = q('[data-owner-booking]')
  if (!root) return
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const money = value => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
  const dateTime = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const phone = value => { const v = value.replace(/[\s.-]/g, ''); return v.startsWith('0') ? '+84' + v.slice(1) : v }
  const state = { services: [], customer: null, selection: null, options: null, pending: null, busy: false, sequence: 0, lookup: 0 }
  const mode = name => q(`input[name="${name}"]:checked`).value
  const serviceIds = () => [...document.querySelectorAll('[name="serviceIds"]:checked')].map(el => el.value)
  const message = text => { q('#booking-feedback').textContent = text }
  async function api(path, options = {}) {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(path, { ...options, cache: 'no-store', signal: controller.signal, headers: { Authorization: `Bearer ${root.dataset.apiToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
      const body = await response.json()
      if (!response.ok) throw Object.assign(new Error(body.message || 'Không thể thực hiện yêu cầu.'), { status: response.status })
      return body.data
    } finally { window.clearTimeout(timer) }
  }
  function summary() {
    const selected = state.services.filter(s => serviceIds().includes(s.id))
    q('#booking-summary').innerHTML = `<p><strong>${esc(mode('customerMode') === 'guest' ? q('[name="guestName"]').value || 'Khách vãng lai' : state.customer?.displayName || 'Chưa chọn khách')}</strong></p>${selected.map(s => `<p>${esc(s.name)} · ${money(s.priceVnd)}</p>`).join('')}<p>${state.selection ? esc(state.selection.name) + ' · ' + (mode('bookingMode') === 'owner_walkin' ? 'Đến ngay' : esc(dateTime(state.selection.startAt))) : 'Chưa chọn stylist / giờ'}</p>${state.options ? `<p class="border-t border-border pt-3 text-xl font-bold text-ink">${money(state.options.totalPriceVnd)}</p><p>${state.options.totalDurationMinutes} phút</p>` : ''}`
    q('#create-booking').disabled = state.busy || (!state.pending && !state.selection)
  }
  function invalidate() {
    state.sequence++; state.selection = null; state.options = null
    q('#booking-slots').textContent = 'Tìm lại giờ trống sau khi thay đổi thông tin.'
    summary()
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const today = ['year', 'month', 'day'].map(type => parts.find(p => p.type === type).value).join('-')
  q('#booking-date').value = today; q('#booking-date').min = today
  q('#booking-fields').addEventListener('change', event => {
    if (event.target.name === 'customerMode') {
      q('#existing-customer').hidden = mode('customerMode') !== 'existing'
      q('#guest-customer').hidden = mode('customerMode') !== 'guest'
    }
    if (event.target.name === 'bookingMode') q('#booking-date-label').hidden = mode('bookingMode') === 'owner_walkin'
    if (event.target.name !== 'slot') invalidate()
  })
  q('#customer-phone').addEventListener('input', () => { state.lookup++; state.customer = null; q('#customer-results').textContent = ''; invalidate() })
  q('#find-customer').addEventListener('click', async () => {
    const sequence = ++state.lookup
    const value = phone(q('#customer-phone').value)
    if (!/^\+[1-9]\d{7,14}$/.test(value)) return message('Nhập số điện thoại hợp lệ, ví dụ 0901234567.')
    q('#customer-results').textContent = 'Đang tìm khách…'
    try {
      const data = await api('/api/customers?' + new URLSearchParams({ phone: value }))
      if (sequence !== state.lookup) return
      q('#customer-results').replaceChildren()
      if (!data.items.length) q('#customer-results').textContent = 'Không có hồ sơ. Chọn Khách vãng lai để tạo mới.'
      for (const customer of data.items) {
        const button = document.createElement('button'); button.type = 'button'
        button.className = 'block min-h-11 w-full rounded-xl border border-border p-3 text-left text-sm'
        button.textContent = `${customer.displayName} · ${customer.phone}`
        button.addEventListener('click', () => {
          state.customer = customer; invalidate()
          for (const other of q('#customer-results').children) other.setAttribute('aria-pressed', String(other === button))
          message('Đã chọn khách: ' + customer.displayName)
        })
        q('#customer-results').append(button)
      }
    } catch { if (sequence === state.lookup) q('#customer-results').textContent = 'Không tìm được khách. Kiểm tra kết nối và thử lại.' }
  })
  q('#find-slots').addEventListener('click', async () => {
    const ids = serviceIds()
    if (!ids.length || ids.length > 5) return message('Chọn từ 1 đến 5 dịch vụ.')
    if (mode('customerMode') === 'existing' && !state.customer) return message('Tìm và chọn đúng hồ sơ khách trước.')
    invalidate(); const sequence = state.sequence
    q('#booking-slots').textContent = 'Đang tìm giờ trống…'; message('')
    try {
      const data = await api('/api/availability?' + new URLSearchParams({ serviceIds: ids.join(','), localDate: mode('bookingMode') === 'owner_walkin' ? today : q('#booking-date').value, mode: mode('bookingMode') === 'owner_walkin' ? 'owner_walkin' : 'scheduled', ...(mode('customerMode') === 'existing' ? { customerId: state.customer.id } : {}) }))
      if (sequence !== state.sequence) return
      state.options = data
      q('#booking-slots').innerHTML = data.stylists.map(person => `<section><h3 class="font-semibold">${esc(person.displayName)}</h3><div class="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">${person.slots.map(slot => `<label class="cursor-pointer rounded-xl border border-border p-3 text-sm has-[:checked]:bg-terracotta-light"><input type="radio" name="slot" value="${esc(person.staffId)}|${esc(slot.startAt)}"> ${mode('bookingMode') === 'owner_walkin' ? 'Nhận khách ngay' : esc(dateTime(slot.startAt).split(' ')[0])}</label>`).join('') || '<p class="text-sm text-muted">Không còn giờ phù hợp.</p>'}</div></section>`).join('') || 'Không có stylist phù hợp. Chọn ngày hoặc dịch vụ khác.'
      summary()
    } catch (error) { if (sequence === state.sequence) { q('#booking-slots').textContent = 'Chưa tải được giờ trống.'; message(error.status ? error.message : 'Kiểm tra kết nối và thử lại.') } }
  })
  q('#booking-slots').addEventListener('change', event => {
    if (event.target.name !== 'slot') return
    const [staffId, startAt] = event.target.value.split('|')
    state.selection = { staffId, startAt, name: state.options.stylists.find(s => s.staffId === staffId).displayName }; summary()
  })
  q('#owner-booking-form').addEventListener('submit', async event => {
    event.preventDefault(); if (state.busy) return
    if (!state.pending) {
      if (!state.selection) return message('Chọn stylist và giờ trống trước.')
      const guestCustomer = { displayName: q('[name="guestName"]').value.trim(), phone: phone(q('[name="guestPhone"]').value) }
      if (mode('customerMode') === 'guest' && (!guestCustomer.displayName || !/^\+[1-9]\d{7,14}$/.test(guestCustomer.phone))) return message('Nhập tên và số điện thoại hợp lệ cho khách vãng lai.')
      state.pending = { key: crypto.randomUUID(), payload: { serviceIds: serviceIds(), staffId: state.selection.staffId, bookingMode: mode('bookingMode'), ...(mode('bookingMode') === 'owner_scheduled' ? { startAt: state.selection.startAt } : {}), ...(mode('customerMode') === 'existing' ? { customerId: state.customer.id } : { guestCustomer }) } }
    }
    state.lookup++; state.sequence++; state.busy = true; q('#booking-agreed').disabled = true; q('#booking-fields').disabled = true; summary(); message('Đang xác nhận lịch…')
    try {
      const result = await api('/api/appointments', { method: 'POST', headers: { 'Idempotency-Key': state.pending.key }, body: JSON.stringify(state.pending.payload) })
      if (!result?.id) throw new Error('Missing receipt')
      state.pending = null; message('Đặt lịch thành công · ' + (result.referenceCode || 'Đã xác nhận'))
      const link = q('#booking-result'); link.href = '/admin/appointments/' + encodeURIComponent(result.id); link.hidden = false
      q('#create-booking').hidden = true; q('#booking-agreed').disabled = true
      link.focus()
    } catch (error) {
      if (error.status && error.status < 500 && error.status !== 408) {
        state.pending = null; q('#booking-agreed').disabled = false; q('#booking-fields').disabled = false; invalidate(); message(error.message + ' Hãy kiểm tra lại thông tin và tìm giờ trống mới.')
      } else message('Chưa xác định được kết quả. Giữ trang này và thử lại cùng yêu cầu để tránh đặt trùng.')
      q('#create-booking').textContent = state.pending ? 'Thử lại cùng yêu cầu' : 'Xác nhận đặt lịch'
    } finally { state.busy = false; summary() }
  })
  window.addEventListener('beforeunload', event => { if (state.pending) { event.preventDefault(); event.returnValue = '' } })
  document.addEventListener('click', event => { if (state.pending && event.target.closest('a')) { event.preventDefault(); message('Hãy thử lại cùng yêu cầu và xác định kết quả trước khi rời trang.') } })
  api('/api/services/manage').then(data => { state.services = data; q('#booking-services').innerHTML = data.filter(s => s.isActive && s.bookingDurationMinutes).map(s => `<label class="rounded-xl border border-border p-4 text-sm"><input type="checkbox" name="serviceIds" value="${esc(s.id)}"> <strong>${esc(s.name)}</strong><span class="mt-2 block text-muted">${money(s.priceVnd)} · ${s.bookingDurationMinutes} phút</span></label>`).join('') || 'Chưa có dịch vụ đủ điều kiện đặt lịch.' }).catch(() => { q('#booking-services').textContent = 'Không tải được dịch vụ. Hãy tải lại trang.' })
})()
