import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ConflictList, LoadFeedback } from '../components/StaffFeedback.jsx'
import { staffErrorMessage } from '../staff-errors.js'
import { cancelShift } from '../api/staff.api.js'
import { vi } from 'vitest'

describe('phản hồi của trang nhân sự', () => {
  it('hiển thị đang tải, lỗi và nút thử lại', () => {
    expect(renderToStaticMarkup(<LoadFeedback state={{ kind: 'loading' }} label="ca làm" />)).toContain('Đang tải ca làm')
    const markup = renderToStaticMarkup(<LoadFeedback state={{ kind: 'error', error: new Error('network') }} onRetry={() => {}} />)
    expect(markup).toContain('Thử lại')
    expect(markup).toContain('kiểm tra kết nối')
    expect(staffErrorMessage({ status: 401 })).toContain('đăng nhập lại')
  })

  it('hiển thị lịch từ phản hồi 409 thực tế của HTTP helper theo giờ Việt Nam', async () => {
    const conflicts = [{ appointmentId: 'abc123', status: 'confirmed', startAt: '2026-10-19T03:00:00Z', endAt: '2026-10-19T04:00:00Z' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'APPOINTMENT_CONFLICT', conflicts }), { status: 409 })))
    try {
      let error
      try { await cancelShift('http://localhost:4000', 'test-token', 'staff', 'shift') } catch (caught) { error = caught }
      expect(error.code).toBe('APPOINTMENT_CONFLICT')
      const markup = renderToStaticMarkup(<ConflictList conflicts={error.conflicts} />)
      expect(markup).toContain('abc123')
      expect(markup).toContain('19/10/2026')
      expect(markup).toContain('10:00')
      expect(markup).toContain('11:00')
      expect(markup).toContain('Đã xác nhận')
      expect(markup).toContain('chưa được kết nối')
    } finally { vi.unstubAllGlobals() }
  })
})
