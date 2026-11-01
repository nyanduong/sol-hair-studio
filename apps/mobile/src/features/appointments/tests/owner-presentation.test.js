import { describe, expect, it } from 'vitest'
import {
  appointmentListDestination,
  isAppointmentCustomer,
  isAppointmentOwner,
  isAppointmentStylist,
} from '../appointment-presentation.js'

describe('owner appointment presentation logic', () => {
  it('nhận diện chính xác role Owner đang hoạt động', () => {
    expect(isAppointmentOwner({ status: 'active', roles: ['owner'] })).toBe(true)
    expect(isAppointmentOwner({ status: 'active', roles: ['owner', 'staff'] })).toBe(true)
    expect(isAppointmentOwner({ status: 'inactive', roles: ['owner'] })).toBe(false)
    expect(isAppointmentOwner({ status: 'active', roles: ['customer'] })).toBe(false)
    expect(isAppointmentOwner(null)).toBe(false)
  })

  it('nhận diện chính xác role Owner và giữ đúng điều hướng danh sách cá nhân', () => {
    const ownerAccount = { status: 'active', roles: ['owner'] }
    expect(isAppointmentOwner(ownerAccount)).toBe(true)
    expect(appointmentListDestination(ownerAccount)).toBe(null)
  })

  it('giữ nguyên điều hướng Stylist và Customer', () => {
    const stylistAccount = { status: 'active', roles: ['stylist'] }
    const customerAccount = { status: 'active', roles: ['customer'] }

    expect(isAppointmentStylist(stylistAccount)).toBe(true)
    expect(appointmentListDestination(stylistAccount)).toBe('StylistAppointments')

    expect(isAppointmentCustomer(customerAccount)).toBe(true)
    expect(appointmentListDestination(customerAccount)).toBe('CustomerAppointments')
  })
})

