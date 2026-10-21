import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import { AppointmentError } from './appointments.service.js'
import { AppointmentModel } from './appointments.model.js'
import { AppointmentEventModel } from './appointment-events.model.js'
import { BookingRequestModel } from './booking-requests.model.js'
import { CustomerModel } from '../customers/customers.model.js'
import {
  findAppointmentCommandActor,
  lockAndBumpCustomerBookingRevision,
} from './appointments.repository.js'
import { lockAndBumpStaffBookingRevision } from '../staff/staff.repository.js'
import { AvailabilityError, getAvailability } from '../availability/availability.service.js'
import { toHoChiMinhDate } from '../staff/staff-shifts.model.js'

const id = (value) => typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value)
const fail = (code, message, status = 400) => {
  throw new AppointmentError(message, { code, status })
}
const day = 86_400_000

function assertAccess(actor, mode) {
  if (!actor) fail('UNAUTHORIZED', 'Phiên không còn hiệu lực.', 401)
  if (!actor.roles.includes(mode === 'customer' ? 'customer' : 'owner'))
    fail('FORBIDDEN', 'Không có quyền đặt lịch theo chế độ này.', 403)
}

export function parseBookingInput(body, key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
    fail(
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key phải có 16–100 ký tự chữ, số, gạch ngang hoặc gạch dưới.',
    )
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) =>
        ![
          'serviceIds',
          'staffId',
          'startAt',
          'bookingMode',
          'customerId',
          'guestCustomer',
        ].includes(k),
    )
  )
    fail('INVALID_REQUEST_BODY', 'Body chứa trường không hợp lệ.')
  if (!['customer', 'owner_scheduled', 'owner_walkin'].includes(body.bookingMode))
    fail('INVALID_BOOKING_MODE', 'bookingMode không hợp lệ.')
  if (
    !Array.isArray(body.serviceIds) ||
    body.serviceIds.length < 1 ||
    body.serviceIds.length > 5 ||
    new Set(body.serviceIds).size !== body.serviceIds.length ||
    body.serviceIds.some(
      (v) => typeof v !== 'string' || v.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
    )
  )
    fail('INVALID_SERVICE_IDS', 'Chọn 1–5 mã dịch vụ khác nhau.')
  if (!id(body.staffId)) fail('INVALID_STAFF_ID', 'staffId không hợp lệ.')
  const input = {
    bookingMode: body.bookingMode,
    serviceIds: [...body.serviceIds],
    staffId: body.staffId.toLowerCase(),
  }
  if (body.bookingMode === 'owner_walkin') {
    if (body.startAt !== undefined)
      fail('INVALID_START_AT', 'Khách tới ngay dùng giờ server, không nhận startAt.')
  } else {
    if (
      typeof body.startAt !== 'string' ||
      !Number.isFinite(Date.parse(body.startAt)) ||
      new Date(body.startAt).toISOString() !== body.startAt
    )
      fail('INVALID_START_AT', 'startAt phải là UTC ISO chuẩn.')
    input.startAt = body.startAt
  }
  if (body.bookingMode === 'customer') {
    if (body.customerId !== undefined || body.guestCustomer !== undefined)
      fail('FORBIDDEN', 'Khách chỉ được đặt lịch cho hồ sơ của mình.', 403)
  } else {
    if ((body.customerId !== undefined) === (body.guestCustomer !== undefined))
      fail('INVALID_CUSTOMER', 'Chọn đúng một hồ sơ hoặc khách vãng lai.')
    if (body.customerId !== undefined) {
      if (!id(body.customerId)) fail('INVALID_CUSTOMER_ID', 'customerId không hợp lệ.')
      input.customerId = body.customerId.toLowerCase()
    } else {
      const guest = body.guestCustomer
      if (
        !guest ||
        typeof guest !== 'object' ||
        Array.isArray(guest) ||
        Object.keys(guest).some((k) => !['displayName', 'phone'].includes(k)) ||
        typeof guest.displayName !== 'string' ||
        !guest.displayName.trim() ||
        guest.displayName.trim().length > 120 ||
        typeof guest.phone !== 'string' ||
        !/^\+[1-9]\d{1,14}$/.test(guest.phone)
      )
        fail('INVALID_CUSTOMER', 'Khách vãng lai cần tên 1–120 ký tự và phone E.164.')
      input.guestCustomer = { displayName: guest.displayName.trim(), phone: guest.phone }
    }
  }
  return input
}

function result(appointment) {
  // Return only the shared booking DTO, never account details or receipt internals.
  return {
    id: String(appointment._id),
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    customerId: String(appointment.customerId),
    staffId: String(appointment.staffId),
    items: appointment.items.map((item) => ({
      serviceId: item.serviceId,
      name: item.name,
      priceVnd: item.priceVnd,
      durationMinutes: item.durationMinutes,
    })),
    totalPriceVnd: appointment.totalPriceVnd,
    totalDurationMinutes: appointment.totalDurationMinutes,
    timeZone: appointment.timeZone,
    localDate: appointment.localDate,
  }
}

async function execute(session, identity, input, key, hash, operation) {
  const actor = await findAppointmentCommandActor(identity.accountId, identity.authRevision, {
    session,
  })
  assertAccess(actor, input.bookingMode)
  const now = new Date()
  const existing = await BookingRequestModel.findOne({ actorId: actor.accountId, key })
    .session(session)
    .lean()
  if (existing && existing.expiresAt > now) {
    if (existing.requestHash !== hash)
      fail('IDEMPOTENCY_CONFLICT', 'Key đã dùng với payload khác.', 409)
    const appointment = await AppointmentModel.findById(existing.appointmentId)
      .session(session)
      .lean()
    if (!appointment)
      fail(
        'BOOKING_RECEIPT_UNAVAILABLE',
        'Không đọc được lịch của receipt; giữ key và thử lại.',
        503,
      )
    if (input.bookingMode === 'customer' && String(appointment.customerId) !== actor.customerId)
      fail('FORBIDDEN', 'Hồ sơ không còn thuộc tài khoản này.', 403)
    return result(appointment)
  }

  // Preserve generated IDs and walk-in time across automatic transaction retries.
  operation.startAt ??= input.startAt ? new Date(input.startAt) : now
  const receipt = {
    actorId: actor.accountId,
    key,
    requestHash: hash,
    appointmentId: operation.appointmentId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + day),
  }
  if (existing) {
    const replaced = await BookingRequestModel.replaceOne(
      { _id: existing._id, expiresAt: { $lte: now } },
      receipt,
      { session },
    )
    if (replaced.modifiedCount !== 1)
      fail('BOOKING_RETRY', 'Receipt vừa thay đổi; giữ key và thử lại.', 503)
  } else await BookingRequestModel.create([receipt], { session })

  let customerId = input.bookingMode === 'customer' ? actor.customerId : input.customerId
  if (input.guestCustomer) {
    const [guest] = await CustomerModel.create(
      [{ _id: operation.guestId, ...input.guestCustomer }],
      { session },
    )
    customerId = String(guest._id)
  }
  if (!customerId) fail('CUSTOMER_PROFILE_REQUIRED', 'Bổ sung hồ sơ khách trước khi đặt.', 409)
  const customerGuard = await lockAndBumpCustomerBookingRevision(customerId, { session })
  if (customerGuard.status !== 'ok')
    fail('CUSTOMER_GUARD_CONFLICT', 'Hồ sơ khách không tồn tại hoặc revision không hợp lệ.', 409)
  const staffGuard = await lockAndBumpStaffBookingRevision(input.staffId, session)
  if (staffGuard.status !== 'ok')
    fail('STAFF_GUARD_CONFLICT', 'Stylist không tồn tại hoặc revision không hợp lệ.', 409)
  const customer = await CustomerModel.findById(customerId).session(session).lean()
  if (!customer.displayName?.trim() || !/^\+[1-9]\d{1,14}$/.test(customer.phone))
    fail('CUSTOMER_PROFILE_REQUIRED', 'Bổ sung tên và số điện thoại qua M1 trước khi đặt.', 409)

  const availability = await getAvailability(
    input.bookingMode === 'customer' ? { ...actor, roles: ['customer'] } : actor,
    {
      serviceIds: input.serviceIds.join(','),
      staffId: input.staffId,
      localDate: toHoChiMinhDate(operation.startAt),
      mode: input.bookingMode === 'owner_walkin' ? 'owner_walkin' : 'scheduled',
      ...(input.bookingMode !== 'customer' ? { customerId } : {}),
    },
    input.bookingMode === 'owner_walkin' ? operation.startAt : now,
    session,
  )
  const staff = availability.stylists[0]
  const slot = staff?.slots.find((item) => item.startAt === operation.startAt.toISOString())
  if (!slot) fail('BOOKING_CONFLICT', 'Giờ đã chọn không còn hợp lệ. Hãy chọn lại.', 409)

  const [appointment] = await AppointmentModel.create(
    [
      {
        _id: operation.appointmentId,
        createdByAccountId: actor.accountId,
        customerId,
        staffId: input.staffId,
        bookingMode: input.bookingMode,
        customerSnapshot: { displayName: customer.displayName, phone: customer.phone },
        staffNameSnapshot: staff.displayName,
        items: availability.items,
        totalPriceVnd: availability.totalPriceVnd,
        totalDurationMinutes: availability.totalDurationMinutes,
        bufferAfterMinutes: 10,
        startAt: operation.startAt,
        endAt: new Date(slot.endAt),
        occupiedFrom: operation.startAt,
        occupiedUntil: new Date(slot.occupiedUntil),
        timeZone: availability.timeZone,
        localDate: availability.localDate,
        status: 'confirmed',
        revision: 0,
        confirmedAt: input.bookingMode === 'owner_walkin' ? operation.startAt : now,
      },
    ],
    { session },
  )
  const after = Object.fromEntries(
    ['status', 'startAt', 'endAt', 'occupiedFrom', 'occupiedUntil', 'staffId'].map((k) => [
      k,
      appointment[k],
    ]),
  )
  await AppointmentEventModel.create(
    [
      {
        appointmentId: appointment._id,
        actorId: actor.accountId,
        revision: 0,
        kind: 'created',
        occurredAt: appointment.confirmedAt,
        before: {},
        after,
      },
    ],
    { session },
  )
  return result(appointment)
}

export async function createBooking(identity, body, key) {
  const input = parseBookingInput(body, key)
  assertAccess(identity, input.bookingMode)
  // Includes the selected profile/guest intent, excludes server-generated time and mutable catalog.
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex')
  const operation = {
    appointmentId: new mongoose.Types.ObjectId(),
    guestId: new mongoose.Types.ObjectId(),
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await mongoose.connection.transaction(
        (session) => execute(session, identity, input, key, hash, operation),
        {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 5000,
          timeoutMS: 15000,
        },
      )
    } catch (error) {
      // Concurrent claims can fail unique insertion instead of a transient write conflict.
      if (error.code === 11000 && error.keyPattern?.actorId && error.keyPattern?.key && attempt < 2)
        continue
      if (error instanceof AvailabilityError) fail(error.code, error.message, error.status)
      if (error.code === 20)
        fail('TRANSACTIONS_REQUIRED', 'Đặt lịch cần MongoDB replica set hỗ trợ transaction.', 503)
      if (
        error?.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        error?.hasErrorLabel?.('TransientTransactionError') ||
        error?.name === 'MongoOperationTimeoutError' ||
        error.code === 11000
      )
        fail(
          'BOOKING_RESULT_UNKNOWN',
          'Chưa xác định kết quả. Giữ nguyên payload/key và thử lại.',
          503,
        )
      throw error
    }
  }
}

export async function lookupBookingCustomers(query) {
  if (
    Object.keys(query).some((k) => k !== 'phone') ||
    typeof query.phone !== 'string' ||
    !/^\+[1-9]\d{1,14}$/.test(query.phone)
  )
    fail('INVALID_PHONE', 'Tìm bằng phone E.164 chính xác.')
  const customers = await CustomerModel.find({ phone: query.phone })
    .select('_id displayName phone')
    .sort({ _id: 1 })
    .limit(101)
    .lean()
  if (customers.length > 100)
    fail(
      'CUSTOMER_LOOKUP_LIMIT',
      'Có quá nhiều hồ sơ cùng số; cần kiểm tra dữ liệu trước khi chọn.',
      409,
    )
  return {
    items: customers.map((c) => ({
      id: String(c._id),
      displayName: c.displayName,
      phone: c.phone,
    })),
  }
}
