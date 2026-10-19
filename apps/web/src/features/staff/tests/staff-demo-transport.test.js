import { describe, expect, it, vi } from 'vitest'
import { createStaffClient } from '../api/staff-client.js'
import { createDemoFetch } from '../api/staff-demo-transport.js'

describe('luồng API nhân sự với phiên và HTTP giả lập', () => {
  it('tải dữ liệu, gửi thay đổi và đọc danh sách xung đột qua hàm API', async () => {
    const fetchImpl = vi.fn(createDemoFetch('2026-10-19'))
    const client = createStaffClient('http://staff-demo.invalid', 'demo-session', { fetchImpl })
    expect(await client.listStaff()).toEqual(expect.arrayContaining([expect.objectContaining({ staffId: 'owner' })]))
    expect(await client.listServices()).toHaveLength(4)
    expect(await client.listShifts('owner', '2026-10-19', '2026-10-25')).toMatchObject([{ shiftId: 'sample-shift' }])
    await expect(client.cancelShift('owner', 'sample-shift')).rejects.toMatchObject({ status: 409, code: 'APPOINTMENT_CONFLICT', conflicts: [{ appointmentId: 'sample-appointment' }] })
    const shift = await client.createShift('owner', { localDate: '2026-10-20', startAt: '2026-10-20T09:00:00+07:00', endAt: '2026-10-20T17:00:00+07:00' })
    expect(shift.status).toBe('active')
    expect(fetchImpl.mock.calls.map(([url, options]) => [new URL(url).pathname, options.method || 'GET'])).toEqual([
      ['/api/staff', 'GET'], ['/api/services', 'GET'], ['/api/staff/owner/shifts', 'GET'],
      ['/api/staff/owner/shifts/sample-shift', 'DELETE'], ['/api/staff/owner/shifts', 'POST'],
    ])
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer demo-session')
  })

  it('từ chối phiên không hợp lệ và hủy request đang tải', async () => {
    const fetchImpl = createDemoFetch('2026-10-19')
    const invalid = createStaffClient('http://staff-demo.invalid', 'invalid', { fetchImpl })
    await expect(invalid.listStaff()).rejects.toMatchObject({ status: 401 })
    const client = createStaffClient('http://staff-demo.invalid', 'demo-session', { fetchImpl })
    const controller = new AbortController()
    const request = client.listStaff(controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })
})
