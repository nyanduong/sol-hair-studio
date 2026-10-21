import { CustomerModel } from '../customers/customers.model.js'
import { isValidLocalDateString, toHoChiMinhDate } from '../staff/staff-shifts.model.js'
import {
  findAvailabilityCalendar,
  findBookingServices,
  findEligibleStaff,
} from './availability.repository.js'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const GRID = 15 * MINUTE
const BUFFER = 10 * MINUTE
const isId = (value) => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)

export class AvailabilityError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function parseAvailabilityQuery(query, identity, now) {
  if (
    Object.keys(query).some(
      (key) => !['serviceIds', 'localDate', 'staffId', 'customerId', 'mode'].includes(key),
    )
  ) {
    throw new AvailabilityError('INVALID_QUERY', 'Query chứa trường không được hỗ trợ.')
  }
  const serviceIds = typeof query.serviceIds === 'string' ? query.serviceIds.split(',') : []
  if (
    serviceIds.length < 1 ||
    serviceIds.length > 5 ||
    new Set(serviceIds).size !== serviceIds.length ||
    serviceIds.some((id) => !/^[a-z0-9][a-z0-9-]{0,79}$/.test(id))
  ) {
    throw new AvailabilityError(
      'INVALID_SERVICE_IDS',
      'Chọn 1–5 mã dịch vụ khác nhau, phân cách bằng dấu phẩy.',
    )
  }
  const owner = identity.roles.includes('owner')
  const mode = query.mode ?? 'scheduled'
  if (!['scheduled', 'owner_walkin'].includes(mode))
    throw new AvailabilityError('INVALID_MODE', 'mode không hợp lệ.')
  if (!owner && (mode === 'owner_walkin' || query.customerId !== undefined)) {
    throw new AvailabilityError(
      'FORBIDDEN',
      'Chỉ chủ tiệm được đặt hộ hoặc đặt khách tới ngay.',
      403,
    )
  }
  if (query.staffId !== undefined && !isId(query.staffId))
    throw new AvailabilityError('INVALID_STAFF_ID', 'staffId không hợp lệ.')
  if (query.customerId !== undefined && !isId(query.customerId))
    throw new AvailabilityError('INVALID_CUSTOMER_ID', 'customerId không hợp lệ.')
  const localDate = query.localDate ?? (mode === 'owner_walkin' ? toHoChiMinhDate(now) : undefined)
  if (!isValidLocalDateString(localDate))
    throw new AvailabilityError('INVALID_LOCAL_DATE', 'localDate phải là ngày YYYY-MM-DD hợp lệ.')
  const from = new Date(`${localDate}T00:00:00+07:00`)
  const until = new Date(from.getTime() + DAY)
  if (
    until <= now ||
    from.getTime() > now.getTime() + 7 * DAY ||
    (mode === 'owner_walkin' && localDate !== toHoChiMinhDate(now))
  ) {
    throw new AvailabilityError(
      'DATE_OUT_OF_RANGE',
      'Ngày phải nằm trong cửa sổ đặt lịch; khách tới ngay chỉ dùng hôm nay.',
    )
  }
  return {
    serviceIds,
    localDate,
    from,
    until,
    mode,
    owner,
    staffId: query.staffId?.toLowerCase(),
    customerId: owner ? query.customerId?.toLowerCase() : identity.customerId,
  }
}

function appointmentInterval(appointment, customer, now) {
  let from = new Date(appointment.occupiedFrom).getTime()
  let end = new Date(appointment.endAt).getTime()
  if (appointment.status === 'completed') {
    from = new Date(appointment.startedAt).getTime()
    end = new Date(appointment.completedAt).getTime()
  } else if (appointment.status === 'in_progress') {
    end = Math.max(
      end,
      appointment.estimatedEndAt ? new Date(appointment.estimatedEndAt).getTime() : end,
    )
    if (end <= now.getTime()) return [from, Infinity]
  }
  return [from, end + (customer ? 0 : BUFFER)]
}

const overlaps = (from, until, interval) => interval[0] < until && interval[1] > from

// Pure calculation shared by tests and the read API; this does not reserve a slot.
export function calculateStaffSlots(staffId, options, calendar, durationMinutes, now) {
  const { from, until, mode, owner, customerId } = options
  const shifts = calendar.shifts.filter((item) => String(item.staffId) === String(staffId))
  const breaks = calendar.timeOff
    .filter((item) => String(item.staffId) === String(staffId))
    .map((item) => [new Date(item.startAt).getTime(), new Date(item.endAt).getTime()])
  const staffBusy = calendar.appointments
    .filter((item) => String(item.staffId) === String(staffId))
    .map((item) => appointmentInterval(item, false, now))
  const customerBusy = customerId
    ? calendar.appointments
      .filter((item) => String(item.customerId) === String(customerId))
      .map((item) => appointmentInterval(item, true, now))
    : []
  const earliest = now.getTime() + (owner ? 0 : 30 * MINUTE)
  const latest = now.getTime() + 7 * DAY
  const starts = new Set()
  for (const shift of shifts) {
    const shiftStart = new Date(shift.startAt).getTime()
    const shiftEnd = new Date(shift.endAt).getTime()
    const first =
      mode === 'owner_walkin'
        ? now.getTime()
        : Math.ceil(Math.max(from.getTime(), shiftStart, earliest) / GRID) * GRID
    const last = Math.min(until.getTime() - 1, latest, shiftEnd - durationMinutes * MINUTE - BUFFER)
    for (let start = first; start <= last; start += GRID) {
      if (start >= shiftStart && start >= earliest) {
        const serviceEnd = start + durationMinutes * MINUTE
        const occupiedEnd = serviceEnd + BUFFER
        if (
          ![...breaks, ...staffBusy].some((interval) => overlaps(start, occupiedEnd, interval)) &&
          !customerBusy.some((interval) => overlaps(start, serviceEnd, interval))
        )
          starts.add(start)
      }
      if (mode === 'owner_walkin') break
    }
  }
  return [...starts]
    .sort((a, b) => a - b)
    .map((start) => ({
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + durationMinutes * MINUTE).toISOString(),
      occupiedUntil: new Date(start + durationMinutes * MINUTE + BUFFER).toISOString(),
    }))
}

export async function getAvailability(identity, query, now = new Date()) {
  const options = parseAvailabilityQuery(query, identity, now)
  if (
    options.customerId &&
    options.owner &&
    !(await CustomerModel.exists({ _id: options.customerId }))
  ) {
    throw new AvailabilityError('CUSTOMER_NOT_FOUND', 'Không tìm thấy hồ sơ khách.', 404)
  }
  const services = await findBookingServices(options.serviceIds)
  if (services.length !== options.serviceIds.length)
    throw new AvailabilityError('SERVICE_UNAVAILABLE', 'Dịch vụ không tồn tại hoặc đã ẩn.', 409)
  const items = options.serviceIds.map((id) => services.find((item) => item.id === id))
  if (
    items.some(
      (item) =>
        !Number.isInteger(item.bookingDurationMinutes) ||
        item.bookingDurationMinutes < 1 ||
        item.bookingDurationMinutes > 480 ||
        item.bookingDurationMinutes < item.durationMinutes?.min ||
        item.bookingDurationMinutes > item.durationMinutes?.max ||
        !Number.isInteger(item.durationMinutes?.min) ||
        !Number.isInteger(item.durationMinutes?.max) ||
        !Number.isSafeInteger(item.priceVnd) ||
        item.priceVnd < 0 ||
        item.priceVnd > 100_000_000,
    )
  ) {
    throw new AvailabilityError(
      'SERVICE_BOOKING_NOT_CONFIGURED',
      'Dịch vụ chưa có giá/thời lượng đặt lịch cố định hợp lệ.',
      409,
    )
  }
  const totalDurationMinutes = items.reduce((sum, item) => sum + item.bookingDurationMinutes, 0)
  const staff = await findEligibleStaff(options.serviceIds, options.staffId)
  const calendar = staff.length
    ? await findAvailabilityCalendar(
      staff.map((item) => item._id),
      options.customerId,
      options.from,
      options.until,
    )
    : { shifts: [], timeOff: [], appointments: [] }
  return {
    generatedAt: now.toISOString(),
    timeZone: 'Asia/Ho_Chi_Minh',
    localDate: options.localDate,
    mode: options.mode,
    items: items.map((item) => ({
      serviceId: item.id,
      name: item.name,
      priceVnd: item.priceVnd,
      durationMinutes: item.bookingDurationMinutes,
    })),
    totalPriceVnd: items.reduce((sum, item) => sum + item.priceVnd, 0),
    totalDurationMinutes,
    bufferAfterMinutes: 10,
    stylists: staff.map((item) => ({
      staffId: String(item._id),
      displayName: item.displayName,
      slots: calculateStaffSlots(item._id, options, calendar, totalDurationMinutes, now),
    })),
  }
}

// Writer chi goi sau guards; dung snapshot, khong doc lai catalog active.
export async function assertAppointmentSlotAvailable({ staffId, customerId, serviceIds, durationMinutes, startAt, owner, excludeAppointmentId },{ session, now } = {}) {
    if (!session?.inTransaction()) throw new TypeError('An active transaction session is required')
    if (
      !isId(staffId) || !isId(customerId) || !isId(excludeAppointmentId) ||
      !Array.isArray(serviceIds) || serviceIds.length < 1 || serviceIds.length > 5 ||
      !Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 2400 ||
      !(startAt instanceof Date) || !Number.isFinite(startAt.getTime()) ||
      !(now instanceof Date) || !Number.isFinite(now.getTime()) || typeof owner !== 'boolean'
    ) throw new TypeError('Valid snapshot and server timestamps are required')
    const [staff] = await findEligibleStaff(serviceIds, staffId, { session })
    if (!staff) throw new AvailabilityError('STAFF_UNAVAILABLE', 'Staff is inactive or lacks the required capabilities.', 409)
    const localDate = toHoChiMinhDate(startAt)
    const from = new Date(localDate + 'T00:00:00+07:00')
    const until = new Date(from.getTime() + DAY)
    const calendar = await findAvailabilityCalendar([staff._id], customerId, from, until, {
      session, excludeAppointmentId,
    })
    const slots = calculateStaffSlots(staff._id, {
      from, until, owner, customerId, mode: 'scheduled',
    }, calendar, durationMinutes, now)
    const slot = slots.find(item => item.startAt === startAt.toISOString())
    if (!slot) throw new AvailabilityError('SLOT_UNAVAILABLE', 'The requested time is unavailable.', 409)
    return { staffId: String(staff._id), displayName: staff.displayName, slot }
}
