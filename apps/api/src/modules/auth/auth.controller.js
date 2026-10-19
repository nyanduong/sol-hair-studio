import { getDatabaseStatus } from '../../config/database.js'
import { sendAuthError } from '../../middlewares/auth.js'

// Only req.ip is trusted. Forwarded headers are ignored unless Express trust proxy is configured.
export function authHandler(operation, { status = 200, identity = false, fields = [] } = {}) {
  return async (request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (getDatabaseStatus() !== 'connected') {
      return response.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Cơ sở dữ liệu chưa sẵn sàng.' })
    }
    try {
      const body = request.body
      if (body !== undefined && (body === null || typeof body !== 'object' || Array.isArray(body))) {
        return response.status(400).json({ status: 'error', code: 'INVALID_BODY', message: 'Body phải là JSON object.' })
      }
      const input = Object.fromEntries(fields.filter((key) => body?.[key] !== undefined).map((key) => [key, body[key]]))
      input.ip = request.ip
      input.actorId = request.identity?.accountId
      input.actorRevision = request.identity?.authRevision
      const result = await (identity ? operation(request.identity, input) : operation(input))
      return response.status(status).json({ status: 'success', data: result })
    } catch (error) { return sendAuthError(error, response, next) }
  }
}
