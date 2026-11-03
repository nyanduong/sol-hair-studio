import { Router } from 'express'
import { requireAdminAuth, getAdminTokenFromRequest } from '../modules/admin/admin.middleware.js'

export const adminRouter = Router()

function todayInVietnam() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// Giao diện EJS dùng cùng phiên owner với dashboard.
adminRouter.get(['/admin/nhan-su', '/quan-ly/nhan-su'], requireAdminAuth, (request, response) => {
  response.set('Cache-Control', 'no-store')
  return response.render('admin/staff', {
    title: 'Nhân sự & ca làm — Sol Hair Studio Admin',
    activeTab: 'staff',
    identity: request.identity,
    staffStylesheet: true,
    today: todayInVietnam(),
    apiToken: getAdminTokenFromRequest(request),
  })
})
