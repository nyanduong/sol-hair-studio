import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listOwnerAppointments,
  parseOwnerAppointmentDto,
} from '../api/owner-appointments.api.js'

const baseUrl = 'http://10.0.2.2:4000/'
const token = 'mock-owner-token'

const sampleRawAppt = {
  id: '672000000000000000000001',
  customerId: 'cust-123',
  customerSnapshot: {
    displayName: 'Nguyễn Văn A',
    phone: '0901234567',
  },
  staffId: 'staff-456',
  staffNameSnapshot: 'Minh Trí',
  items: [
    {
      serviceId: 'srv-1',
      name: 'Cắt Tóc Nam',
      priceVnd: 150000,
      durationMinutes: 45,
    },
  ],
  startAt: '2026-10-31T03:00:00.000Z',
  endAt: '2026-10-31T03:45:00.000Z',
  status: 'confirmed',
  totalDurationMinutes: 45,
  totalPriceVnd: 150000,
  revision: 1,
  localDate: '2026-10-31',
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('owner-appointments.api', () => {
  describe('parseOwnerAppointmentDto', () => {
    it('chuyển đổi đúng cấu trúc lịch hẹn dành cho Owner', () => {
      const parsed = parseOwnerAppointmentDto(sampleRawAppt)
      expect(parsed.id).toBe('672000000000000000000001')
      expect(parsed.customerSnapshot.displayName).toBe('Nguyễn Văn A')
      expect(parsed.customerSnapshot.phone).toBe('0901234567')
      expect(parsed.staffNameSnapshot).toBe('Minh Trí')
      expect(parsed.items).toHaveLength(1)
      expect(parsed.items[0].name).toBe('Cắt Tóc Nam')
      expect(parsed.items[0].priceVnd).toBe(150000)
      expect(parsed.status).toBe('confirmed')
      expect(parsed.totalPriceVnd).toBe(150000)
      expect(parsed.localDate).toBe('2026-10-31')
    })

    it('fallback an toàn khi thiếu snapshot khách hàng và thợ', () => {
      const parsed = parseOwnerAppointmentDto({
        id: '672000000000000000000002',
      })
      expect(parsed.customerSnapshot.displayName).toBe('Khách vãng lai')
      expect(parsed.customerSnapshot.phone).toBe('')
      expect(parsed.staffNameSnapshot).toBe('Chưa chỉ định')
      expect(parsed.items).toEqual([])
      expect(parsed.totalPriceVnd).toBe(0)
    })

    it('báo lỗi khi id không hợp lệ', () => {
      expect(() => parseOwnerAppointmentDto(null)).toThrow('Dữ liệu lịch hẹn không hợp lệ.')
      expect(() => parseOwnerAppointmentDto({})).toThrow('Dữ liệu lịch hẹn không hợp lệ.')
    })
  })

  describe('listOwnerAppointments', () => {
    it('gọi đúng endpoint với token Bearer và filter', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            items: [sampleRawAppt],
            pagination: { hasNextPage: false, nextCursor: null },
          },
        })
      )
      vi.stubGlobal('fetch', mockFetch)

      const result = await listOwnerAppointments(baseUrl, token, {
        localDate: '2026-10-31',
        status: 'confirmed',
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain('http://10.0.2.2:4000/api/appointments?')
      expect(callUrl).toContain('limit=50')
      expect(callUrl).toContain('localDate=2026-10-31')
      expect(callUrl).toContain('status=confirmed')

      const callOpts = mockFetch.mock.calls[0][1]
      expect(callOpts.headers.get('Authorization')).toBe(`Bearer ${token}`)

      expect(result.items).toHaveLength(1)
      expect(result.items[0].id).toBe('672000000000000000000001')
      expect(result.pagination.hasNextPage).toBe(false)
    })
  })
})

