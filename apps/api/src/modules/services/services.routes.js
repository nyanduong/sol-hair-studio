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
