const token = JSON.parse(document.querySelector('#customer-config').textContent).token
const el = selector => document.querySelector(selector)
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const money = value => new Intl.NumberFormat('vi-VN').format(value) + ' đ'
const date = value => value ? new Date(value).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghé'
function avatar(row, large = false) {
  const size = large ? 'h-20 w-20 text-2xl' : 'h-12 w-12 text-sm'
  const initials = row.displayName.trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase()
  const image = typeof row.avatarUrl === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(row.avatarUrl)
    ? `<img src="${esc(row.avatarUrl)}" alt="" class="absolute inset-0 h-full w-full rounded-full object-cover" loading="lazy" data-avatar-image>` : ''
  return `<span class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-terracotta-light font-bold text-terracotta ${size}" aria-hidden="true">${esc(initials)}${image}</span>`
}
document.addEventListener('error', event => { if (event.target.matches?.('[data-avatar-image]')) event.target.remove() }, true)
let page = 1, selected = null, editing = null, listController, detailController
async function api(path = '', options = {}) {
  const response = await fetch('/api/customer-management' + path, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
  const body = await response.json()
  if (!response.ok) throw new Error(body.message || 'Không thể tải dữ liệu. Vui lòng thử lại.')
  return body.data
}
async function load() {
  listController?.abort(); listController = new AbortController()
  el('#message').textContent = 'Đang tải khách hàng…'
  try {
    const params = new URLSearchParams(new FormData(el('#filters'))); params.set('page', page)
    const data = await api('?' + params, { signal: listController.signal })
    el('#summary').innerHTML = [['Tổng khách hàng', data.summary.total], ['Có tài khoản', data.summary.account], ['Khách vãng lai', data.summary.total - data.summary.account]].map(([label, value]) => `<div class="rounded-2xl border border-border bg-white p-5"><p class="text-muted">${label}</p><p class="mt-3 text-3xl font-bold">${value}</p></div>`).join('')
    el('#rows').innerHTML = data.items.map(row => `<tr class="border-b border-border ${selected?.id === row.id ? 'bg-terracotta-light' : ''}"><td class="p-3"><button data-id="${row.id}" class="flex items-center gap-3 text-left">${avatar(row)}<span><span class="block font-semibold text-terracotta">${esc(row.displayName)}</span><span class="mt-1 block text-muted">${esc(row.phone || 'Chưa có số điện thoại')}</span></span></button></td><td class="p-3">${row.hasAccount ? 'Có tài khoản' : 'Khách vãng lai'}</td><td class="p-3">${date(row.lastVisit)}</td><td class="p-3">${row.visits}</td></tr>`).join('')
    el('#pages').innerHTML = `<span>${data.total} khách hàng · Trang ${page}/${Math.max(1, Math.ceil(data.total / 6))}</span><div><button id="prev" class="rounded-lg border p-2" ${page === 1 ? 'disabled' : ''}>Trước</button> <button id="next" class="rounded-lg border p-2" ${page * 6 >= data.total ? 'disabled' : ''}>Sau</button></div>`
    el('#prev').onclick = () => { page--; load() }; el('#next').onclick = () => { page++; load() }
    el('#message').textContent = data.total ? '' : 'Chưa có khách hàng phù hợp.'
  } catch (error) { if (error.name !== 'AbortError') { el('#message').textContent = error.message; el('#rows').replaceChildren(); el('#pages').replaceChildren() } }
}
async function detail(id, historyPage = 1) {
  detailController?.abort(); detailController = new AbortController()
  if (!el('#detail-dialog').open) el('#detail-dialog').showModal()
  el('#detail').textContent = 'Đang tải chi tiết…'; selected = null
  try {
    const row = await api(`/${id}?page=${historyPage}`, { signal: detailController.signal }); selected = row
    el('#detail').innerHTML = `<div class="flex items-center gap-4">${avatar(row, true)}<h3 class="text-xl font-bold">${esc(row.displayName)}</h3></div><p class="my-3 text-sm text-terracotta">${row.hasAccount ? 'Có tài khoản' : 'Khách vãng lai'}</p><label class="my-4 block text-sm font-semibold">Đổi ảnh đại diện<input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" class="mt-2 block w-full text-sm"></label><p class="text-xs text-muted">JPG, PNG hoặc WebP · Tối đa 2 MB</p><p id="avatar-status" role="status" class="mt-2 text-sm text-terracotta"></p><dl class="space-y-3 border-t border-border py-4"><div>Số điện thoại: ${esc(row.phone || 'Chưa có')}</div><div>Email: ${esc(row.email || 'Chưa có')}</div></dl><button id="edit" class="rounded-xl border border-terracotta px-4 py-2 text-terracotta">Chỉnh sửa thông tin</button><div class="my-5 grid grid-cols-2 gap-3"><div class="rounded-xl border border-border p-3">Lịch hoàn tất<p class="mt-2 text-xl font-bold">${row.visits}</p></div><div class="rounded-xl border border-border p-3">Giá trị dịch vụ<p class="mt-2 text-xl font-bold">${money(row.totalSpentVnd)}</p></div></div><h3 class="font-bold">Lịch sử ghé salon</h3>${row.history.map(item => `<a href="/admin/appointments/${item.id}" class="mt-3 block rounded-xl border border-border p-3"><p class="font-semibold">${esc(item.names.join(', '))}</p><p class="mt-2 text-sm text-muted">${date(item.startAt)} · ${money(item.totalPriceVnd)} · Hoàn tất</p></a>`).join('') || '<p class="my-4 text-muted">Chưa có lịch hoàn tất.</p>'}<div class="mt-4 flex gap-4"><button id="history-prev" ${historyPage === 1 ? 'disabled' : ''}>Trước</button><span>Trang ${historyPage}</span><button id="history-next" ${historyPage * 6 >= row.visits ? 'disabled' : ''}>Sau</button></div>`
    el('#avatar-file').onchange = () => uploadAvatar(row.id)
    el('#edit').onclick = () => editor(row)
    el('#history-prev').onclick = () => detail(id, historyPage - 1)
    el('#history-next').onclick = () => detail(id, historyPage + 1)
  } catch (error) { if (error.name !== 'AbortError') el('#detail').textContent = error.message }
}
function editor(row = null) {
  editing = row?.id || null
  el('#editor-title').textContent = row ? 'Chỉnh sửa thông tin' : 'Thêm khách vãng lai'
  el('#customer-form').elements.displayName.value = row?.displayName || ''
  el('#customer-form').elements.phone.value = row?.phone || ''
  el('#form-error').textContent = ''; el('#editor').showModal()
}
el('#close-detail').onclick = () => el('#detail-dialog').close()
el('#detail-dialog').addEventListener('close', () => detailController?.abort())
el('#add').onclick = () => editor()
el('#close-editor').onclick = () => el('#editor').close()
el('#filters').onsubmit = event => { event.preventDefault(); page = 1; load() }
el('#rows').onclick = event => { const button = event.target.closest('[data-id]'); if (button) detail(button.dataset.id) }
el('#customer-form').onsubmit = async event => {
  event.preventDefault(); el('#save').disabled = true
  try {
    const result = await api(editing ? '/' + editing : '', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) })
    el('#editor').close(); await load(); await detail(result.id)
  } catch (error) { el('#form-error').textContent = error.message }
  finally { el('#save').disabled = false }
}
load()

async function uploadAvatar(id) {
  const input = el('#avatar-file'), file = input.files[0]
  if (!file) return
  const status = el('#avatar-status')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    status.textContent = 'Chọn ảnh JPG, PNG hoặc WebP tối đa 2 MB.'; input.value = ''; return
  }
  input.disabled = true; status.textContent = 'Đang tải ảnh lên…'
  try {
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Không đọc được ảnh.'))
      reader.readAsDataURL(file)
    })
    await api(`/${id}/avatar`, { method: 'PUT', body: JSON.stringify({ image }) })
    await load()
    if (el('#detail-dialog').open && selected?.id === id) await detail(id)
  } catch (error) { status.textContent = error.message }
  finally { input.disabled = false; input.value = '' }
}
