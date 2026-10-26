import { getDatabaseStatus } from '../../config/database.js'
import { sendAuthError } from '../../middlewares/auth.js'
import {
  ServiceError,
  listPublicServices,
  listManageServices,
  getServiceDetail,
  createService,
  updateService,
  uploadOrRegisterImage,
} from './services.service.js'

export function sendServiceError(error, response, next) {
  if (error instanceof ServiceError) {
    return response.status(error.status).json({
      status: 'error',
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    })
  }
  return sendAuthError(error, response, next)
}

export function serviceHandler(operation, { status = 200, fields = null } = {}) {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (getDatabaseStatus() !== 'connected') {
      return response.status(503).json({
        status: 'error',
        code: 'DATABASE_UNAVAILABLE',
        message: 'Cơ sở dữ liệu chưa sẵn sàng.',
      })
    }

    try {
      let input = {}
      if (fields !== null) {
        const body = request.body
        if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
          return response.status(400).json({
            status: 'error',
            code: 'INVALID_BODY',
            message: 'Body phải là JSON object.',
          })
        }
        input = Object.fromEntries(
          fields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]),
        )
      }

      const result = await operation({
        identity: request.identity,
        params: request.params,
        query: request.query,
        input,
        body: request.body,
      })

      return response.status(status).json({
        status: 'success',
        data: result,
      })
    } catch (error) {
      return sendServiceError(error, response, next)
    }
  }
}

// Public catalog giữ nguyên DTO hợp đồng { data: [...] }
export async function listServices(_request, response, next) {
  if (getDatabaseStatus() !== 'connected') {
    return response.status(503).json({
      status: 'error',
      code: 'DATABASE_UNAVAILABLE',
      message: 'Danh mục dịch vụ tạm thời chưa khả dụng.',
    })
  }

  try {
    const services = await listPublicServices()
    return response.status(200).json({ data: services })
  } catch (error) {
    return sendServiceError(error, response, next)
  }
}

export const getServiceDetailController = serviceHandler(
  ({ params }) => getServiceDetail(params.id),
)

export const listManageServicesController = serviceHandler(
  ({ identity }) => listManageServices(identity),
)

export const createServiceController = serviceHandler(
  ({ identity, input }) => createService(identity, input),
  {
    status: 201,
    fields: [
      'id',
      'slug',
      'name',
      'description',
      'category',
      'durationMinutes',
      'bookingDurationMinutes',
      'priceVnd',
      'imageUrl',
      'coverImageId',
      'images',
      'isActive',
      'displayOrder',
    ],
  },
)

export const updateServiceController = serviceHandler(
  ({ identity, params, input }) => updateService(identity, params.id, input),
  {
    status: 200,
    fields: [
      'name',
      'description',
      'category',
      'durationMinutes',
      'bookingDurationMinutes',
      'priceVnd',
      'imageUrl',
      'coverImageId',
      'images',
      'isActive',
      'displayOrder',
    ],
  },
)

export const uploadImageController = serviceHandler(
  ({ identity, input, body }) => uploadOrRegisterImage(identity, { ...input, ...body }),
  {
    status: 201,
    fields: [
      'dataUrl',
      'payload',
      'originalName',
      'cloudName',
      'cloudinaryAssetId',
      'publicId',
      'url',
      'width',
      'height',
      'bytes',
      'format',
    ],
  },
)
