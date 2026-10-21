import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelShift, createShift, createStaff, listShifts, listStaff, updateShift, updateStaff } from '../api/staff.api.js'

const baseUrl = 'http://localhost:4000/'
const token = 'test-token'
const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())

describe('API nhân sự', () => {
  it('chỉ gọi khi có phiên và gửi Bearer cùng khoảng ngày tới endpoint đúng', async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    vi.stubGlobal('fetch', mock)
    await expect(listStaff(baseUrl, '')).rejects.toThrow('Cần đăng nhập')
    expect(mock).not.toHaveBeenCalled()
    await expect(listShifts(baseUrl, token, 'staff-id', { fromDate: '2026-10-19', toDate: '2026-10-25' })).resolves.toEqual([])
    expect(mock).toHaveBeenCalledWith('http://localhost:4000/api/staff/staff-id/shifts?fromDate=2026-10-19&toDate=2026-10-25', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(mock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer test-token')
  })

  it('gửi đúng phương thức, đường dẫn và JSON của các thao tác', async () => {
    const mock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: { id: 'ok' } })))
    vi.stubGlobal('fetch', mock)
    const profile = { email: 'sample@example.com', displayName: 'Mẫu', serviceIds: [] }
    const shift = { localDate: '2026-10-19', startAt: '2026-10-19T09:00:00+07:00', endAt: '2026-10-19T17:00:00+07:00' }
    await createStaff(baseUrl, token, profile)
    await updateStaff(baseUrl, token, 'staff', { isActive: false })
    await createShift(baseUrl, token, 'staff', shift)
    await updateShift(baseUrl, token, 'staff', 'shift', shift)
    await cancelShift(baseUrl, token, 'staff', 'shift')
    expect(mock.mock.calls.map(([url, options]) => [url, options.method, options.body && JSON.parse(options.body)])).toEqual([
      ['http://localhost:4000/api/staff', 'POST', profile],
      ['http://localhost:4000/api/staff/staff', 'PATCH', { isActive: false }],
      ['http://localhost:4000/api/staff/staff/shifts', 'POST', shift],
      ['http://localhost:4000/api/staff/staff/shifts/shift', 'PATCH', shift],
      ['http://localhost:4000/api/staff/staff/shifts/shift', 'DELETE', undefined],
    ])
    expect(mock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer test-token')
    expect(mock.mock.calls[0][1].headers.get('Content-Type')).toBe('application/json')
  })

  it('giữ mã lỗi và danh sách lịch xung đột từ API để giao diện xử lý', async () => {
    const conflicts = [{ appointmentId: 'appointment', startAt: '2026-10-19T03:00:00.000Z' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 'APPOINTMENT_CONFLICT', message: 'Có lịch bị ảnh hưởng.', conflicts }, 409)))
    await expect(cancelShift(baseUrl, token, 'staff', 'shift')).rejects.toMatchObject({ status: 409, code: 'APPOINTMENT_CONFLICT', conflicts })
  })
})
