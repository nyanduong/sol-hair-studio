import { createAppointmentListReader } from './customer-appointments-reader.js'
import { createAppointmentDetailReader } from './customer-appointment-detail-reader.js'
import { isAppointmentStylist } from '../appointment-presentation.js'

// Staff được lấy theo phiên, không nhận Staff ID tùy ý từ route hoặc ô lọc.
export function createStylistAppointmentReader({ accountId, readProfile, readStaff, readPage, readDetail, appointmentId }) {
  let staffId
  const denied = () => Object.assign(new Error('Phiên hoặc hồ sơ stylist không còn phù hợp.'), { status: 403 })
  async function profile(signal) {
    const value = await readProfile(signal), account = value?.account ?? value
    if (!isAppointmentStylist(account) || typeof accountId !== 'string' || (account?.accountId ?? account?.id) !== accountId) throw denied()
    if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    const staff = await readStaff(signal)
    if (!Array.isArray(staff) || staff.length !== 1 || staff[0].accountId !== accountId ||
        typeof staff[0].staffId !== 'string' || !/^[a-fA-F0-9]{24}$/.test(staff[0].staffId)) throw denied()
    if (staffId && staffId !== staff[0].staffId) { staffId = staff[0].staffId; throw denied() }
    staffId = staff[0].staffId
    return value
  }
  function assigned(item) {
    if (!item || item.staffId !== staffId) throw denied()
    return item
  }
  if (readDetail) return createAppointmentDetailReader({ accountId, appointmentId,
    readProfile: profile, authorize: isAppointmentStylist,
    readDetail: async (id, signal) => assigned(await readDetail(id, signal)) })
  return createAppointmentListReader({ accountId, readProfile: profile, authorize: isAppointmentStylist,
    compareAppointments: (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id.localeCompare(b.id),
    readPage: async (cursor, signal) => {
      const page = await readPage(cursor, signal)
      page.items.forEach(assigned)
      return page
    } })
}
