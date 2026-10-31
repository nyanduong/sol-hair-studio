import { Server } from 'socket.io'
import { config } from '../../config/env.js'
import { authenticate } from '../auth/auth.service.js'

export const AVAILABILITY_CHANGED = 'availability:changed'

// Only a signal to re-read the API: no appointment, customer or token data is broadcast.
export function availabilityInvalidation(req, res, next) {
  if (
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
    /^\/(?:api\/(?:appointments|staff|services)|owner\/appointments)(?:\/|$)/.test(req.path)
  ) {
    res.once('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        req.app.locals.bookingRealtime?.emit(AVAILABILITY_CHANGED)
      }
    })
  }
  next()
}

export function attachBookingRealtime(server, app, { authenticateSocket = authenticate } = {}) {
  const origins =
    config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((x) => x.trim())
  const io = new Server(server, { cors: { origin: origins }, maxHttpBufferSize: 4096 })
  io.use(async (socket, next) => {
    try {
      const identity = await authenticateSocket(socket.handshake.auth?.token)
      if (!identity.roles.some((role) => ['customer', 'owner'].includes(role))) throw new Error()
      next()
    } catch {
      next(new Error('Cần đăng nhập tài khoản đặt lịch.'))
    }
  })
  // No client event can change availability or trigger a broadcast.
  app.locals.bookingRealtime = io
  return io
}
