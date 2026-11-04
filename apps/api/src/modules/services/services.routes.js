import { listCategories, createCategory, updateCategory } from './categories.service.js'
import { serviceHandler } from './services.controller.js'
import { Router } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import {
  listServices,
  getServiceDetailController,
  listManageServicesController,
  createServiceController,
  updateServiceController,
  uploadImageController,
} from './services.controller.js'

export const servicesRouter = Router()

servicesRouter.get('/service-categories', requireAuth, requireRoles('owner'), serviceHandler(({ identity }) => listCategories(identity)))
servicesRouter.post('/service-categories', requireAuth, requireRoles('owner'), serviceHandler(({ identity, input }) => createCategory(identity, input), { status: 201, fields: ['name'] }))
servicesRouter.patch('/service-categories/:id', requireAuth, requireRoles('owner'), serviceHandler(({ identity, params, input }) => updateCategory(identity, params.id, input), { fields: ['name', 'isActive'] }))

// Public danh mục dịch vụ (giữ đúng DTO 8 field { data: [...] })
servicesRouter.get('/services', listServices)

// Owner quản lý danh sách toàn bộ dịch vụ (bao gồm dịch vụ ẩn/cấu hình booking)
servicesRouter.get(
  '/services/manage',
  requireAuth,
  requireRoles('owner'),
  listManageServicesController,
)

// Owner tải lên / đăng ký ảnh dịch vụ vào Cloudinary và MongoDB
servicesRouter.post(
  '/services/images',
  requireAuth,
  requireRoles('owner'),
  uploadImageController,
)

// Public xem chi tiết một dịch vụ theo id hoặc slug
servicesRouter.get('/services/:id', getServiceDetailController)

// Owner tạo mới dịch vụ
servicesRouter.post(
  '/services',
  requireAuth,
  requireRoles('owner'),
  createServiceController,
)

// Owner cập nhật thông tin dịch vụ (tên, giá, thời lượng, ảnh, ẩn/hiện)
servicesRouter.patch(
  '/services/:id',
  requireAuth,
  requireRoles('owner'),
  updateServiceController,
)
