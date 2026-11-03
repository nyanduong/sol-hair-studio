import { requestJson } from '../../../lib/http.js'
export async function readPayment(baseUrl, token, appointmentId, signal) {
  const response = await requestJson('/api/appointments/' + encodeURIComponent(appointmentId) + '/payment', {
    baseUrl, headers: { Authorization: `Bearer ${token}` }, signal,
  })
  const data = response.data
  if (!data || data.appointmentId !== appointmentId || !['paid', 'unpaid'].includes(data.status) ||
    !['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(data.appointmentStatus) ||
    !Number.isSafeInteger(data.amountVnd) || data.amountVnd < 0 || typeof data.transferContent !== 'string' ||
    (data.status === 'paid' && (typeof data.receivedAt !== 'string' || !Number.isFinite(Date.parse(data.receivedAt)))) ||
    (data.qrPath !== null && data.qrPath !== '/admin-assets/qr/qr-code.jpg')) throw new Error('Không đọc được trạng thái thanh toán.')
  return data
}
