
import { AppointmentError, listAppointments, getAppointmentDetail} from '../appointments/appointments.service.js'
import { listStaff } from '../staff/staff.service.js'
import { salonDate } from '../../../../../shared/booking.js'

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