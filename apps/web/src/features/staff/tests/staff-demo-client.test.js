import { describe, expect, it } from 'vitest'
import { createDemoStaffClient } from '../api/staff-demo-client.js'

describe('nguồn dữ liệu mẫu cho trang nhân sự', () => {
  it('báo xung đột theo DTO và giữ nguyên ca sau khi hủy thất bại', async () => {
    const client = createDemoStaffClient('2026-10-19')
    await expect(client.cancelShift('owner', 'sample-shift')).rejects.toMatchObject({ code: 'APPOINTMENT_CONFLICT', conflicts: [{ appointmentId: 'sample-appointment' }] })
    expect(await client.listShifts('owner', '2026-10-19', '2026-10-25')).toMatchObject([{ status: 'active' }])
    expect(await client.listShifts('owner', '2026-10-26', '2026-11-01')).toEqual([])
  })

  it('hủy request đang tải khi rời màn hình', async () => {
    const client = createDemoStaffClient('2026-10-19')
    const controller = new AbortController()
    const request = client.listStaff(controller.signal)
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('chặn ca chồng, cho ca liền kề và có thể hủy ca không xung đột', async () => {
    const client = createDemoStaffClient('2026-10-19')
    const input = { localDate: '2026-10-19', startAt: '2026-10-19T16:00:00+07:00', endAt: '2026-10-19T18:00:00+07:00' }
    await expect(client.createShift('owner', input)).rejects.toMatchObject({ code: 'SHIFT_OVERLAP' })
    const adjacent = await client.createShift('owner', { ...input, startAt: '2026-10-19T17:00:00+07:00' })
    await client.cancelShift('owner', adjacent.shiftId)
    expect(await client.listShifts('owner', '2026-10-19', '2026-10-19')).toMatchObject([{ status: 'active' }, { status: 'cancelled' }])
  })
})
