import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLatestRequest } from '../../../lib/latest-request.js'
import {
  fetchStylistAppointments,
  getStylistAppointmentsErrorMessage,
} from '../api/appointments.api.js'
import { appointmentStatusLabel, moveLocalDate } from '../staff-presentation.js'

const baseUrl = 'http://10.0.2.2:4000/'
const token = 'stylist-token'

function response(data) {
  return new Response(JSON.stringify({ status: 'success', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('lịch hẹn được giao trên mobile', () => {
  it('gọi endpoint lịch hẹn theo ngày với token stylist', async () => {
    const data = { items: [], pagination: { limit: 50, hasNextPage: false, nextCursor: null } }
    const fetchMock = vi.fn().mockResolvedValue(response(data))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchStylistAppointments(baseUrl, token, '2026-11-03')).resolves.toEqual(data)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.2.2:4000/api/appointments?localDate=2026-11-03',
      expect.objectContaining({ headers: expect.any(Headers), signal: expect.any(AbortSignal) }),
    )
  })

  it('bỏ qua kết quả cũ sau khi stylist đổi ngày', async () => {
    const requests = []
    vi.stubGlobal('fetch', vi.fn((_url, { signal }) => new Promise((resolve) => requests.push({ resolve, signal }))))
    const manager = createLatestRequest()
    const previous = manager.run((signal) => fetchStylistAppointments(baseUrl, token, '2026-11-03', { signal }))
    const latest = manager.run((signal) => fetchStylistAppointments(baseUrl, token, '2026-11-04', { signal }))

    expect(requests[0].signal.aborted).toBe(true)
    requests[1].resolve(response({ items: ['latest'] }))
    await expect(latest).resolves.toEqual({ kind: 'success', value: { items: ['latest'] } })
    requests[0].resolve(response({ items: ['old'] }))
    await expect(previous).resolves.toEqual({ kind: 'ignored' })
  })

  it('trình bày ngày và trạng thái đã allowlist từ API', () => {
    expect(moveLocalDate('2026-11-03', 1)).toBe('2026-11-04')
    expect(appointmentStatusLabel('in_progress')).toBe('Đang phục vụ')
    expect(getStylistAppointmentsErrorMessage({ status: 403 })).toContain('không có quyền')
  })
})
