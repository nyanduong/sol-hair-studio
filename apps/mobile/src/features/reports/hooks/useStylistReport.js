import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { apiBaseUrl } from '../../../config/env.js'
import { getMe } from '../../auth/api/auth.api.js'
import { fetchMyShifts, fetchMyStaff } from '../../staff/api/staff.api.js'
import { listStylistAppointments } from '../../appointments/api/stylist-appointments.api.js'
import { readStylistSession } from '../../appointments/hooks/stylist-appointments-reader.js'
import { bindAppointmentLifecycle } from '../../appointments/hooks/customer-appointments-reader.js'
import { monthRange } from '../report-presentation.js'
import { createReportReader, readReportDay, reportShifts } from './report-reader.js'

function useReportResource(reader) {
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot)
  useFocusEffect(useCallback(() => bindAppointmentLifecycle(reader, AppState), [reader]))
  return { ...state, retry: reader.retry }
}

export function useStylistReport(token, accountId, date, month = date.slice(0, 7)) {
  const session = useMemo(() => signal => readStylistSession({
    accountId,
    readProfile: signal => getMe(apiBaseUrl, token, { signal }),
    readStaff: signal => fetchMyStaff(apiBaseUrl, token, { signal }),
  }, signal), [token, accountId])
  const dayReader = useMemo(() => createReportReader(async signal => {
    const { staffId } = await session(signal)
    return readReportDay({ staffId, localDate: date,
      readPage: (cursor, signal) => listStylistAppointments(apiBaseUrl, token, date, cursor, signal),
    }, signal)
  }), [session, token, date])
  const monthReader = useMemo(() => createReportReader(async signal => {
    const { staffId } = await session(signal), range = monthRange(month)
    return reportShifts(await fetchMyShifts(apiBaseUrl, token, staffId, range, { signal }), staffId, range)
  }), [session, token, month])
  const day = useReportResource(dayReader), shifts = useReportResource(monthReader)
  return { day, shifts }
}
