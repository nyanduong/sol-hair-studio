import { Router } from 'express'

export const adminRouter = Router()

function todayInVietnam() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Giao diện quản trị được render trên Express. Dữ liệu minh họa giữ đúng phạm vi
// SOL-026: chỉ ở bộ nhớ trình duyệt, không thay đổi dữ liệu API thật.
adminRouter.get(['/admin/nhan-su', '/quan-ly/nhan-su'], (request, response) => {
  response.set('Cache-Control', 'no-store')
  return response.render('admin/staff', { today: todayInVietnam() })
})
