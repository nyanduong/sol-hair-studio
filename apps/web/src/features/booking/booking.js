export const salonDate = (now = new Date()) =>
  new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)
export const money = (value) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)
export const slotTime = (value) =>
  new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

export function contactInput(displayName, phone) {
  if (!displayName.trim() || displayName.trim().length > 120)
    throw new Error('Nhập tên khách, tối đa 120 ký tự.')
  if (!/^\+[1-9]\d{1,14}$/.test(phone.trim()))
    throw new Error('Nhập số điện thoại quốc tế, ví dụ +84901234567.')
  return { displayName: displayName.trim(), phone: phone.trim() }
}

export function bookingPayload({
  serviceIds,
  staffId,
  startAt,
  mode,
  owner,
  customerId,
  guestCustomer,
}) {
  if (
    !Array.isArray(serviceIds) ||
    serviceIds.length < 1 ||
    serviceIds.length > 5 ||
    new Set(serviceIds).size !== serviceIds.length
  )
    throw new Error('Chọn từ 1 đến 5 dịch vụ khác nhau.')
  if (!staffId || !startAt) throw new Error('Chọn stylist và giờ trống trước khi xác nhận.')
  const bookingMode = owner
    ? mode === 'owner_walkin'
      ? 'owner_walkin'
      : 'owner_scheduled'
    : 'customer'
  if (owner && !customerId && !guestCustomer)
    throw new Error('Chọn đúng hồ sơ khách hoặc nhập khách vãng lai.')
  return {
    serviceIds: [...serviceIds],
    staffId,
    bookingMode,
    // Walk-in time is assigned by the server when writing, never replay the preview timestamp.
    ...(bookingMode === 'owner_walkin' ? {} : { startAt }),
    ...(owner ? (customerId ? { customerId } : { guestCustomer }) : {}),
  }
}

export function createBookingSubmission(send, newKey = () => crypto.randomUUID()) {
  let intent
  let active
  return {
    getPending: () => intent,
    run(payload, signal) {
      const fingerprint = JSON.stringify(payload)
      if (intent && intent.fingerprint !== fingerprint)
        return Promise.reject(new Error('Cần xác minh yêu cầu trước đó trước khi đổi lựa chọn.'))
      if (active) return active
      intent ??= { key: newKey(), fingerprint, payload: JSON.parse(fingerprint) }
      active = Promise.resolve()
        .then(() => send(intent.payload, intent.key, signal))
        .then((result) => {
          intent = undefined
          return result
        })
        .catch((error) => {
          // A definite 4xx rejection is safe to edit. Timeout/network/5xx must keep the same key.
          const uncertain = !error.status || error.status >= 500 || error.status === 408
          if (!uncertain) intent = undefined
          error.uncertain = uncertain
          throw error
        })
        .finally(() => {
          active = undefined
        })
      return active
    },
  }
}
