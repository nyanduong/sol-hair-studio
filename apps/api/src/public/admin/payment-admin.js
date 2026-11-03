const paymentConfig = JSON.parse(document.querySelector('#payment-config').textContent)
const paymentEl = id => document.getElementById(id)
const paymentKey = crypto.randomUUID()
const paymentMoney = value => new Intl.NumberFormat('vi-VN').format(value) + ' đ'
let paymentState = null
let paymentBusy = false
let paymentCommand = null

function setPaymentBusy(busy) {
  paymentBusy = busy
  paymentEl('payment').dataset.paymentBusy = String(busy)
  paymentEl('payment-refresh').disabled = busy
  paymentEl('payment-attest').disabled = busy
  paymentEl('payment-submit').disabled = busy || !paymentEl('payment-attest').checked
}
async function paymentRequest(confirm = false) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch('/api/appointments/' + paymentConfig.appointmentId + '/payment' + (confirm ? '/confirm' : ''), {
      method: confirm ? 'POST' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${paymentConfig.token}`, 'Content-Type': 'application/json', ...(confirm ? { 'Idempotency-Key': paymentKey } : {}) },
      ...(confirm ? { body: paymentCommand } : {}),
    })
    const body = await response.json()
    if (!response.ok) {
      const error = new Error(body.message || 'Không thể đọc trạng thái thanh toán.')
      error.status = response.status
      throw error
    }
    return body.data
  } finally { clearTimeout(timer) }
}
function renderPayment() {
  const waiting = paymentState.status !== 'paid' && paymentState.appointmentStatus === 'completed'
  paymentEl('payment-summary').className = waiting
    ? 'my-3 inline-block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800'
    : 'my-3 text-sm font-semibold text-emerald-800'
  paymentEl('payment-summary').textContent = paymentState.status === 'paid'
    ? `Đã thu tiền · ${new Date(paymentState.receivedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    : waiting ? 'Chờ thu tiền · Chưa xác nhận nhận tiền'
      : ['cancelled', 'no_show'].includes(paymentState.appointmentStatus) ? 'Không yêu cầu thu tiền' : 'Thu tiền sau khi hoàn tất phục vụ'
  paymentEl('payment-amount').textContent = paymentMoney(paymentState.amountVnd)
  paymentEl('payment-collection').hidden = !waiting
  paymentEl('payment-reference').textContent = paymentState.transferContent
  if (paymentState.status === 'paid') paymentCommand = null
}
async function refreshPayment() {
  if (paymentBusy) return
  setPaymentBusy(true)
  paymentEl('payment-collection').hidden = true
  paymentEl('payment-attest').checked = false
  paymentEl('payment-error').textContent = ''
  try { paymentState = await paymentRequest(); renderPayment() }
  catch {
    paymentState = null
    paymentEl('payment-amount').textContent = ''
    paymentEl('payment-summary').textContent = 'Chưa đọc được trạng thái thanh toán. Vui lòng tải lại hoặc đăng nhập lại.'
  } finally { setPaymentBusy(false) }
}
paymentEl('payment-refresh').onclick = refreshPayment
paymentEl('payment-attest').onchange = () => {
  paymentEl('payment-submit').disabled = paymentBusy || !paymentEl('payment-attest').checked
}
paymentEl('payment-confirm').onsubmit = async event => {
  event.preventDefault()
  if (paymentBusy || !paymentEl('payment-attest').checked || paymentState?.status !== 'unpaid' || paymentState.appointmentStatus !== 'completed') return
  paymentCommand ??= JSON.stringify({ expectedRevision: paymentState.revision, receivedConfirmed: true })
  setPaymentBusy(true)
  paymentEl('payment-error').textContent = ''
  try {
    paymentState = await paymentRequest(true)
    renderPayment()
  } catch (error) {
    if (error.status && error.status < 500 && error.status !== 408) {
      paymentCommand = null
      paymentState = null
      paymentEl('payment-collection').hidden = true
      paymentEl('payment-summary').textContent = 'Cần tải lại trạng thái trước khi xác nhận.'
      paymentEl('payment-error').textContent = error.message
    } else {
      paymentEl('payment-error').textContent = 'Chưa rõ kết quả. Tải lại trạng thái hoặc thử lại cùng yêu cầu; không yêu cầu khách chuyển lần nữa.'
    }
  } finally { setPaymentBusy(false) }
}
const paymentPageUrl = new URL(window.location.href)
if (paymentPageUrl.searchParams.get('collect') === '1') {
  paymentPageUrl.searchParams.delete('collect')
  window.history.replaceState(null, '', paymentPageUrl.href)
}
// The collection panel is always inline; completion and QR shortcuts only focus it.
void refreshPayment()
