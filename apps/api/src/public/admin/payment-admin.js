const paymentConfig = JSON.parse(document.querySelector('#payment-config').textContent)
const paymentEl = id => document.getElementById(id)
let paymentState = null
const paymentKey = crypto.randomUUID()
const paymentMoney = value => new Intl.NumberFormat('vi-VN').format(value) + ' đ'
async function paymentRequest(confirm = false) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch('/api/appointments/' + paymentConfig.appointmentId + '/payment' + (confirm ? '/confirm' : ''), {
      method: confirm ? 'POST' : 'GET', signal: controller.signal,
      headers: { Authorization: `Bearer ${paymentConfig.token}`, 'Content-Type': 'application/json', ...(confirm ? { 'Idempotency-Key': paymentKey } : {}) },
      ...(confirm ? { body: JSON.stringify({ expectedRevision: paymentState.revision, receivedConfirmed: paymentEl('payment-attest').checked }) } : {}),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.message || 'Không thể đọc trạng thái thanh toán.')
    return body.data
  } finally { clearTimeout(timer) }
}
function renderPayment() {
  paymentEl('payment-summary').textContent = paymentState.status === 'paid'
    ? `Đã thanh toán ${paymentMoney(paymentState.amountVnd)} · ${new Date(paymentState.receivedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`
    : paymentState.appointmentStatus === 'completed' ? `Chưa thanh toán · ${paymentMoney(paymentState.amountVnd)}` : ['cancelled', 'no_show'].includes(paymentState.appointmentStatus) ? 'Không có yêu cầu thanh toán cho lịch đã hủy hoặc không đến.' : 'Chưa ghi nhận thanh toán. Thu tiền sau khi hoàn tất phục vụ.'
  paymentEl('payment-open').hidden = paymentState.status === 'paid' || paymentState.appointmentStatus !== 'completed'
}
async function refreshPayment() {
  paymentEl('payment-refresh').disabled = true; paymentEl('payment-open').hidden = true
  try { paymentState = await paymentRequest(); renderPayment() }
  catch { paymentState = null; paymentEl('payment-summary').textContent = 'Chưa đọc được trạng thái thanh toán. Vui lòng tải lại hoặc đăng nhập lại.' }
  finally { paymentEl('payment-refresh').disabled = false }
}
paymentEl('payment-refresh').onclick = refreshPayment
paymentEl('payment-open').onclick = async () => {
  await refreshPayment()
  if (!paymentState || paymentState.status === 'paid' || paymentState.appointmentStatus !== 'completed') return
  paymentEl('payment-amount').textContent = paymentMoney(paymentState.amountVnd)
  paymentEl('payment-reference').textContent = paymentState.transferContent
  paymentEl('payment-attest').checked = false; paymentEl('payment-error').textContent = ''
  if (!paymentEl('payment-dialog').open) paymentEl('payment-dialog').showModal()
}
paymentEl('payment-close').onclick = () => paymentEl('payment-dialog').close()
paymentEl('payment-confirm').onsubmit = async event => {
  event.preventDefault(); paymentEl('payment-submit').disabled = true
  try {
    paymentState = await paymentRequest(true); renderPayment(); paymentEl('payment-dialog').close()
  } catch (error) { paymentEl('payment-error').textContent = error.name === 'AbortError' ? 'Chưa rõ kết quả. Tải lại trạng thái hoặc thử lại cùng yêu cầu, không yêu cầu khách chuyển lần nữa.' : error.message }
  finally { paymentEl('payment-submit').disabled = false }
}
refreshPayment()
