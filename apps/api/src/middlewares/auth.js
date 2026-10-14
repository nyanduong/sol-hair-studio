import { authenticate, AuthError } from '../modules/auth/auth.service.js'
import { getDatabaseStatus } from '../config/database.js'

export function sendAuthError(error, response, next) {
  if (!(error instanceof AuthError)) return next(error)
  return response.status(error.status).json({ status: 'error', code: error.code, message: error.message })
}

export async function requireAuth(request, response, next) {
  response.set('Cache-Control', 'no-store')
  if (getDatabaseStatus() !== 'connected') {
    return response.status(503).json({ status: 'error', code: 'DATABASE_UNAVAILABLE', message: 'Cơ sở dữ liệu chưa sẵn sàng.' })
  }
  try {
    const header = request.get('authorization') || ''
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header)
    request.identity = await authenticate(match?.[1])
    next()
  } catch (error) { return sendAuthError(error, response, next) }
}

export function requireRoles(...roles) {
  return (request, response, next) => {
    if (!request.identity) return response.status(401).json({ status: 'error', code: 'UNAUTHORIZED', message: 'Cần đăng nhập.' })
    if (!roles.some((role) => request.identity.roles.includes(role))) {
      return response.status(403).json({ status: 'error', code: 'FORBIDDEN', message: 'Không có quyền thực hiện.' })
    }
    next()
  }
}
