import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLatestRequest } from '../../../lib/latest-request.js'
import { fetchMyShifts, fetchMyStaff, getStaffErrorMessage } from '../api/staff.api.js'
import { currentWeekRange, formatShiftTime, moveWeek, shiftStatusLabel } from '../staff-presentation.js'

const baseUrl = 'http://10.0.2.2:4000/'
const token = 'stylist-token'
const staff = { staffId: 'staff-1', displayName: 'Stylist An' }
const range = { fromDate: '2026-10-19', toDate: '2026-10-25' }

function response(data) {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('ca làm của stylist trên mobile', () => {
  it('đọc hồ sơ theo phiên rồi lấy ca theo khoảng tuần, không nhận staffId từ giao diện', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response([staff])).mockResolvedValueOnce(response([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMyStaff(baseUrl, token)).resolves.toEqual([staff])
    await expect(fetchMyShifts(baseUrl, token, staff.staffId, range)).resolves.toEqual([])
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://10.0.2.2:4000/api/staff', expect.objectContaining({ headers: expect.any(Headers) }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://10.0.2.2:4000/api/staff/staff-1/shifts?fromDate=2026-10-19&toDate=2026-10-25', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('giữ quyền lỗi và bỏ qua response cũ sau khi đổi tuần', async () => {
    const manager = createLatestRequest()
    const first = manager.run(async () => new Promise((resolve) => setTimeout(() => resolve(['old']), 0)))
    await expect(manager.run(async () => ['new'])).resolves.toEqual({ kind: 'success', value: ['new'] })
    await expect(first).resolves.toEqual({ kind: 'ignored' })
    expect(getStaffErrorMessage({ status: 403 })).toContain('không có quyền')
  })

  it('trình bày khoảng tuần và dữ liệu ca từ hợp đồng API', () => {
    expect(currentWeekRange(new Date('2026-10-21T12:00:00'))).toEqual(range)
    expect(moveWeek(range, 1)).toEqual({ fromDate: '2026-10-26', toDate: '2026-11-01' })
    expect(formatShiftTime('2026-10-19T09:00:00+07:00')).toBe('09:00')
    expect(shiftStatusLabel('cancelled')).toBe('Đã hủy')
  })
})
