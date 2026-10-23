import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { listStylistAppointments, readStylistAppointment } from '../api/stylist-appointments.api.js'
import { createOwnerAppointmentReader } from './useOwnerAppointments.js'

export function isStylistAccount(account) {
  return account?.status === 'active' && Array.isArray(account.roles) &&
    account.roles.includes('stylist') && !account.roles.includes('owner')
}

export function createStylistAppointmentReader({ readProfile, readData, paginated = false }) {
  return createOwnerAppointmentReader({ readProfile, readData, paginated, authorize: isStylistAccount })
}

export function useStylistAppointments(token, id, localDate) {
  const reader = useMemo(() => createStylistAppointmentReader({
    paginated: !id,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readData: (cursor, signal) => id ? readStylistAppointment(apiBaseUrl, token, id, signal)
      : listStylistAppointments(apiBaseUrl, token, localDate, cursor, signal),
  }), [token, id, localDate])
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useEffect(() => { void reader.load(); return () => reader.cancel() }, [reader])
  return { ...state, retry: () => reader.retry(), loadMore: () => reader.load(true) }
}
