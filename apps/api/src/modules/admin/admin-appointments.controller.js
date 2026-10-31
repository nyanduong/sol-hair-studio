
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
  updateAppointmentEta,
  getAppointmentAudit,
  correctAppointmentStart,
  correctAppointmentCompletion,
} from '../appointments/appointments.service.js'
import { listStaff } from '../staff/staff.service.js'
import { salonDate } from '../../../../../shared/booking.js'
import { randomUUID } from 'node:crypto'

export async function showOwnerAppointments(req, res, next) {
  const query = {...req.query,localDate: req.query.localDate ?? salonDate()}
  const personal = query.view === 'mine'
  delete query.view

  for (const key of ['staffId', 'status', 'cursor']) {
    if (query[key] === '') delete query[key]
  }

  const filters = {
    localDate: query.localDate,
    staffId: query.staffId ?? '',
    status: query.status ?? '',
  }

  try {
    const staff = await listStaff(req.identity)
    const personalStaff = personal
      ? staff.find(person => person.accountId === req.identity.accountId)
      : null
    if (personal) {
      delete query.staffId
      filters.staffId = ''
      if (personalStaff) query.staffId = personalStaff.staffId
    }
    const page = personal && !personalStaff
      ? { items: [], pagination: { hasNextPage: false, nextCursor: null } }
      : await listAppointments(req.identity, query)

    return res.render('admin/appointments/appointments', {
      title: 'Lịch hẹn trong ngày',
      personalStaff,
      filters,
      staff,
      appointments: page.items,
      pagination: page.pagination,
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('admin/appointments/appointments', {
      title: 'Lịch hẹn toàn salon',
      personalStaff: null,
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
    let personalStaff = null
    if (req.query.view === 'mine') {
      const staff = await listStaff(req.identity)
      personalStaff = staff.find(person => person.accountId === req.identity.accountId)
      if (!personalStaff || personalStaff.staffId !== appointment.staffId) {
        throw new AppointmentError('Lịch này không được phân công cho bạn.', {
          code: 'APPOINTMENT_NOT_ASSIGNED', status: 403,
        })
      }
    }

    return res.render('admin/appointments/appointment-detail', {
      title: 'Chi tiết lịch hẹn',
      appointment,
      personalStaff,
      cancelKey: randomUUID(),
      noShowKey: randomUUID(),
      startKey: randomUUID(),
      completeKey: randomUUID(),
      etaKey: randomUUID(),
      correctStartKey: randomUUID(),
      correctCompleteKey: randomUUID(),
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('admin/appointments/appointment-detail', {
      title: 'Chi tiết lịch hẹn',
      appointment: null,
      personalStaff: null,
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

    return res.render('admin/appointments/appointment-cancel-result', {
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

    return res.status(status).render('admin/appointments/appointment-cancel-result', {
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
  // Chỉ localDate thuộc contract của Service lấy lựa chọn đổi lịch.
  delete query.view
  delete query.staffId
  delete query.status

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

    return res.render('admin/appointments/appointment-reschedule', {
      ...view,
      options,
      rescheduleKey: randomUUID(),
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('admin/appointments/appointment-reschedule', {
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
      customerAgreementConfirmed: req.body?.customerAgreementConfirmed === 'true',
      commandKey: commandKey ?? '',
    },
  }

  try {
    if (typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.length > 500) {
      throw new AppointmentError('Cần nhập lý do đổi lịch có nội dung, tối đa 500 ký tự.', {
        code: 'INVALID_REASON', status: 400,
      })
    }
    if (req.body?.customerAgreementConfirmed !== 'true') {
      throw new AppointmentError('Cần xác nhận đã trao đổi và thống nhất lịch mới với khách.', {
        code: 'CUSTOMER_AGREEMENT_REQUIRED', status: 400,
      })
    }
    const result = await rescheduleAppointment(
      req.identity,
      req.params.appointmentId,
      payload,
      commandKey,
    )

    return res.render('admin/appointments/appointment-reschedule-result', {
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

    return res.status(status).render('admin/appointments/appointment-reschedule-result', {
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

    return res.render('admin/appointments/appointment-no-show-result', {
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

    return res.status(status).render('admin/appointments/appointment-no-show-result', {
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

    return res.render('admin/appointments/appointment-service-result', {
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

    return res.status(status).render('admin/appointments/appointment-service-result', {
      ...view,
      result: null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}

export async function submitOwnerEta(req, res) {
  const rawRevision = req.body?.expectedRevision

  const expectedRevision =
    typeof rawRevision === 'string' && /^(0|[1-9]\d*)$/.test(rawRevision)
      ? Number(rawRevision)
      : rawRevision

  const estimatedEndLocal = req.body?.estimatedEndLocal

  const commandKey =
    req.get('Idempotency-Key') ?? req.body?.commandKey

  const view = {
    title: 'Kết quả cập nhật ETA',
    appointmentId: req.params.appointmentId,
    form: {
      expectedRevision,
      estimatedEndLocal: estimatedEndLocal ?? '',
      commandKey: commandKey ?? '',
    },
  }

  try {
    if (
      typeof estimatedEndLocal !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(estimatedEndLocal)
    ) {
      throw new AppointmentError('Vui lòng nhập giờ dự kiến kết thúc.', {
        code: 'INVALID_ETA',
        status: 400,
      })
    }

    const estimatedEnd = new Date(`${estimatedEndLocal}:00+07:00`)

    if (
      !Number.isFinite(estimatedEnd.getTime()) ||
      new Date(estimatedEnd.getTime() + 7 * 60 * 60_000)
        .toISOString()
        .slice(0, 16) !== estimatedEndLocal
    ) {
      throw new AppointmentError('Giờ dự kiến kết thúc không hợp lệ.', {
        code: 'INVALID_ETA',
        status: 400,
      })
    }

    const result = await updateAppointmentEta(
      req.identity,
      req.params.appointmentId,
      {
        expectedRevision,
        estimatedEndAt: estimatedEnd.toISOString(),
      },
      commandKey,
    )

    return res.render('admin/appointments/appointment-eta-result', {
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
      console.error('Lỗi cập nhật ETA Owner.', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    return res.status(status).render('admin/appointments/appointment-eta-result', {
      ...view,
      result: null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả cập nhật ETA. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}

export async function showOwnerAudit(req, res, next) {
  const view = {
    title: 'Lịch sử thao tác',
    appointmentId: req.params.appointmentId,
  }

  try {
    const page = await getAppointmentAudit(
      req.identity,
      req.params.appointmentId,
      Object.fromEntries(Object.entries(req.query).filter(([key]) =>
        !['view', 'localDate', 'staffId', 'status'].includes(key))),
    )

    return res.render('admin/appointments/appointment-audit', {
      ...view,
      events: page.items,
      pagination: page.pagination,
      error: '',
    })
  } catch (error) {
    if (!(error instanceof AppointmentError)) return next(error)

    return res.status(error.status).render('admin/appointments/appointment-audit', {
      ...view,
      events: [],
      pagination: {
        limit: 20,
        hasNextPage: false,
        nextCursor: null,
      },
      error: error.message,
    })
  }
}

export function submitOwnerCorrectStart(req, res) {
  return submitOwnerCorrection(req, res, 'correct-start')
}

export function submitOwnerCorrectComplete(req, res) {
  return submitOwnerCorrection(req, res, 'correct-complete')
}

async function submitOwnerCorrection(req, res, operation) {
  const correctingComplete = operation === 'correct-complete'
  const confirmationField = correctingComplete
    ? 'serviceNotCompleted'
    : 'serviceNotStarted'

  const service = correctingComplete
    ? correctAppointmentCompletion
    : correctAppointmentStart

  const rawRevision = req.body?.expectedRevision
  const expectedRevision =
    typeof rawRevision === 'string' && /^(0|[1-9]\d*)$/.test(rawRevision)
      ? Number(rawRevision)
      : rawRevision

  const confirmed = req.body?.[confirmationField] === 'true'
  const estimatedEndLocal = correctingComplete
    ? req.body?.estimatedEndLocal
    : undefined

  const commandKey =
    req.get('Idempotency-Key') ?? req.body?.commandKey

  const payload = {
    expectedRevision,
    reason: req.body?.reason,
    [confirmationField]: confirmed,
  }

  const view = {
    title: correctingComplete
      ? 'Sửa hoàn tất nhầm'
      : 'Sửa bắt đầu nhầm',
    operation,
    confirmationField,
    appointmentId: req.params.appointmentId,
    form: {
      expectedRevision,
      reason: payload.reason ?? '',
      confirmed,
      estimatedEndLocal: estimatedEndLocal ?? '',
      commandKey: commandKey ?? '',
    },
  }

  try {
    if (
      correctingComplete &&
      estimatedEndLocal !== undefined &&
      estimatedEndLocal !== ''
    ) {
      if (
        typeof estimatedEndLocal !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(estimatedEndLocal)
      ) {
        throw new AppointmentError('ETA mới không hợp lệ.', {
          code: 'INVALID_ETA',
          status: 400,
        })
      }

      const estimatedEnd = new Date(`${estimatedEndLocal}:00+07:00`)

      if (
        !Number.isFinite(estimatedEnd.getTime()) ||
        new Date(estimatedEnd.getTime() + 7 * 60 * 60_000)
          .toISOString()
          .slice(0, 16) !== estimatedEndLocal
      ) {
        throw new AppointmentError('ETA mới không hợp lệ.', {
          code: 'INVALID_ETA',
          status: 400,
        })
      }

      payload.estimatedEndAt = estimatedEnd.toISOString()
    }

    const result = await service(
      req.identity,
      req.params.appointmentId,
      payload,
      commandKey,
    )

    return res.render('admin/appointments/appointment-correction-result', {
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
      console.error('Lỗi sửa thao tác nhầm Owner.', {
        operation,
        name: error instanceof Error ? error.name : 'UnknownError',
      })
    }

    return res.status(status).render('admin/appointments/appointment-correction-result', {
      ...view,
      result: null,
      conflicts: knownError && error.code === 'CORRECTION_CONFLICT' ? error.details : null,
      pending,
      error: pending
        ? 'Chưa xác định được kết quả sửa nhầm. Hãy kiểm tra và thử lại cùng yêu cầu.'
        : error.message,
    })
  }
}
