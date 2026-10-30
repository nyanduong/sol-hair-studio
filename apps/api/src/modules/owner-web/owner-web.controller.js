
import {
  AppointmentError,
  listAppointments,
  getAppointmentDetail,
  cancelAppointment,
  getAppointmentRescheduleOptions,
  rescheduleAppointment,
  markAppointmentNoShow,
  startAppointment,
  completeAppointment,
} from '../appointments/appointments.service.js'
import { listStaff } from '../staff/staff.service.js'
import { salonDate } from '../../../../../shared/booking.js'
import { randomUUID } from 'node:crypto'

export async function showOwnerAppointments(req, res, next) {
  const query = {...req.query,localDate: req.query.localDate ?? salonDate()}

  for (const key of ['staffId', 'status', 'cursor']) {
    if (query[key] === '') delete query[key]
  }

  const filters = {
    localDate: query.localDate,
    staffId: query.staffId ?? '',
    status: query.status ?? '',
  }

  try {
    const page = await listAppointments(req.identity, query)
    const staff = await listStaff(req.identity)

    return res.render('owner/appointments', {
      title: 'Lịch hẹn toàn salon',
      filters,
      staff,
      appointments: page.items,
      pagination: page.pagination,
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('owner/appointments', {
      title: 'Lịch hẹn toàn salon',
      filters,
      staff: [],
      appointments: [],
      pagination: {
        hasNextPage: false,
        nextCursor: null,
      },
      error: error.message,
    })
  }
}

export async function showOwnerAppointmentDetail(req, res, next) {
  try {
    const appointment = await getAppointmentDetail(req.identity,req.params.appointmentId)

    return res.render('owner/appointment-detail', {
      title: 'Chi tiết lịch hẹn',
      appointment,
      cancelKey: randomUUID(),
      noShowKey: randomUUID(),
      startKey: randomUUID(),
      completeKey: randomUUID(),
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('owner/appointment-detail', {
      title: 'Chi tiết lịch hẹn',
      appointment: null,
      error: error.message,
    })
  }
}

export async function submitOwnerCancellation(req, res) {
  const rawRevision = req.body?.expectedRevision

  const expectedRevision =
    typeof rawRevision === 'string' && /^(0|[1-9]\d*)$/.test(rawRevision)
      ? Number(rawRevision)
      : rawRevision

  const payload = { expectedRevision }

  if (req.body?.reason !== undefined && req.body.reason !== '') {
    payload.reason = req.body.reason
  }

  const commandKey =
    req.get('Idempotency-Key') ?? req.body?.commandKey

  const view = {
    title: 'Hủy lịch hẹn',
    appointmentId: req.params.appointmentId,
    form: {
      expectedRevision,
      reason: payload.reason ?? '',
      commandKey: commandKey ?? '',
    },
  }

  try {
    const result = await cancelAppointment(
      req.identity,
      req.params.appointmentId,
      payload,
      commandKey,
    )

    return res.render('owner/appointment-cancel-result', {
      ...view,
      result,
      error: '',
      pending: false,
    })
  } catch (error) {
    const knownError = error instanceof AppointmentError
    const status = knownError ? error.status : 500
    const pending = status >= 500 || status === 408

    if (!knownError) {
      console.error('Lỗi hủy lịch Owner.', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    return res.status(status).render('owner/appointment-cancel-result', {
      ...view,
      result: null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả hủy. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}


export async function showOwnerReschedule(req, res, next) {
  const query = {
    ...req.query,
    localDate: req.query.localDate ?? salonDate(),
  }

  const view = {
    title: 'Đổi lịch hẹn',
    appointmentId: req.params.appointmentId,
    localDate: query.localDate,
  }

  try {
    const options = await getAppointmentRescheduleOptions(
      req.identity,
      req.params.appointmentId,
      query,
    )

    return res.render('owner/appointment-reschedule', {
      ...view,
      options,
      rescheduleKey: randomUUID(),
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('owner/appointment-reschedule', {
      ...view,
      options: null,
      rescheduleKey: '',
      error: error.message,
    })
  }
}


export async function submitOwnerReschedule(req, res) {
  const rawRevision = req.body?.expectedRevision

  const expectedRevision =
    typeof rawRevision === 'string' && /^(0|[1-9]\d*)$/.test(rawRevision)
      ? Number(rawRevision)
      : rawRevision

  const payload = { expectedRevision }

  for (const key of ['startAt', 'staffId', 'reason']) {
    if (req.body?.[key] !== undefined && req.body[key] !== '') {
      payload[key] = req.body[key]
    }
  }

  const commandKey =
    req.get('Idempotency-Key') ?? req.body?.commandKey

  const view = {
    title: 'Kết quả đổi lịch',
    appointmentId: req.params.appointmentId,
    form: {
      expectedRevision,
      startAt: payload.startAt ?? '',
      staffId: payload.staffId ?? '',
      reason: payload.reason ?? '',
      commandKey: commandKey ?? '',
    },
  }

  try {
    const result = await rescheduleAppointment(
      req.identity,
      req.params.appointmentId,
      payload,
      commandKey,
    )

    return res.render('owner/appointment-reschedule-result', {
      ...view,
      result,
      error: '',
      pending: false,
    })
  } catch (error) {
    const knownError = error instanceof AppointmentError
    const status = knownError ? error.status : 500
    const pending = status >= 500 || status === 408

    if (!knownError) {
      console.error('Lỗi đổi lịch Owner.', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    return res.status(status).render('owner/appointment-reschedule-result', {
      ...view,
      result: null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả đổi lịch. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}

export async function submitOwnerNoShow(req, res) {
  const rawRevision = req.body?.expectedRevision

  const expectedRevision =
    typeof rawRevision === 'string' && /^(0|[1-9]\d*)$/.test(rawRevision)
      ? Number(rawRevision)
      : rawRevision

  const contactLocal = req.body?.contactAttemptedLocal

  const commandKey =
    req.get('Idempotency-Key') ?? req.body?.commandKey

  const view = {
    title: 'Khách không đến',
    appointmentId: req.params.appointmentId,
    form: {
      expectedRevision,
      contactAttemptedLocal: contactLocal ?? '',
      commandKey: commandKey ?? '',
    },
  }

  try {
    if (
      typeof contactLocal !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(contactLocal)
    ) {
      throw new AppointmentError('Vui lòng nhập thời điểm đã liên hệ khách.', {
        code: 'INVALID_CONTACT_ATTEMPTED_AT',
        status: 400,
      })
    }

    const contactDate = new Date(`${contactLocal}:00+07:00`)

    if (
      !Number.isFinite(contactDate.getTime()) ||
      new Date(contactDate.getTime() + 7 * 60 * 60_000)
        .toISOString()
        .slice(0, 16) !== contactLocal
    ) {
      throw new AppointmentError('Thời điểm liên hệ không hợp lệ.', {
        code: 'INVALID_CONTACT_ATTEMPTED_AT',
        status: 400,
      })
    }

    const result = await markAppointmentNoShow(
      req.identity,
      req.params.appointmentId,
      {
        expectedRevision,
        contactAttemptedAt: contactDate.toISOString(),
      },
      commandKey,
    )

    return res.render('owner/appointment-no-show-result', {
      ...view,
      result,
      error: '',
      pending: false,
    })
  } catch (error) {
    const knownError = error instanceof AppointmentError
    const status = knownError ? error.status : 500
    const pending = status >= 500 || status === 408

    if (!knownError) {
      console.error('Lỗi đánh dấu no-show Owner.', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    return res.status(status).render('owner/appointment-no-show-result', {
      ...view,
      result: null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả no-show. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}

export function submitOwnerStart(req, res) {
  return submitOwnerServiceAction(req, res, 'start', startAppointment)
}

export function submitOwnerComplete(req, res) {
  return submitOwnerServiceAction(req, res, 'complete', completeAppointment)
}

async function submitOwnerServiceAction(req, res, operation, service) {
  const rawRevision = req.body?.expectedRevision

  const expectedRevision =
    typeof rawRevision === 'string' && /^(0|[1-9]\d*)$/.test(rawRevision)
      ? Number(rawRevision)
      : rawRevision

  const commandKey =
    req.get('Idempotency-Key') ?? req.body?.commandKey

  const view = {
    title: operation === 'start'
      ? 'Bắt đầu phục vụ'
      : 'Hoàn tất phục vụ',
    operation,
    appointmentId: req.params.appointmentId,
    form: {
      expectedRevision,
      commandKey: commandKey ?? '',
    },
  }

  try {
    const result = await service(
      req.identity,
      req.params.appointmentId,
      { expectedRevision },
      commandKey,
    )

    return res.render('owner/appointment-service-result', {
      ...view,
      result,
      error: '',
      pending: false,
    })
  } catch (error) {
    const knownError = error instanceof AppointmentError
    const status = knownError ? error.status : 500
    const pending = status >= 500 || status === 408

    if (!knownError) {
      console.error('Lỗi thao tác phục vụ Owner.', {
        operation,
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    return res.status(status).render('owner/appointment-service-result', {
      ...view,
      result: null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}