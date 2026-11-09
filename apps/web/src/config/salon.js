// Chỉ cấu hình thông tin liên hệ đã được chủ salon xác nhận.
const phone = (import.meta.env.VITE_SALON_PHONE || '').trim()
export const salonContact = {
  phone: /^\+?[0-9]{8,15}$/.test(phone) ? phone : '',
  address: (import.meta.env.VITE_SALON_ADDRESS || '').trim(),
}
export const salonSupportHref = salonContact.phone ? `tel:${salonContact.phone}` : '/#contact'
