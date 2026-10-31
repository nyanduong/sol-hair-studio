import { authenticate } from '../auth/auth.service.js'
import { getDatabaseStatus } from '../../config/database.js'

export function getAdminTokenFromRequest(req) {
  // 1. Check Query parameter (?token=...) for seamless SSO from React Web
  if (req.query?.token && typeof req.query.token === 'string') {
    return req.query.token.trim()
  }

  // 2. Check Cookie
  const cookieHeader = req.headers.cookie
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('sol_admin_token='))

    if (match) {
      return decodeURIComponent(match.split('=')[1])
    }
  }

  // 3. Check Authorization Header (supports tests / API fallback)
  const authHeader = req.get('authorization') || ''
  const bearerMatch =
    authHeader.length <= 2055 &&
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authHeader)

  if (bearerMatch) {
    return bearerMatch[1]
  }

  return null
}

export async function requireAdminAuth(req, res, next) {
  res.set('Cache-Control', 'no-store')

  if (getDatabaseStatus() !== 'connected') {
    return res.status(503).send('Cơ sở dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.')
  }

  const token = getAdminTokenFromRequest(req)
  if (!token) {
    return res.redirect('/admin/login')
  }

  try {
    const identity = await authenticate(token)
    if (!identity.roles || !identity.roles.includes('owner')) {
      return res.redirect('/admin/login?error=forbidden')
    }

    req.identity = identity
    res.locals.identity = identity

    // Set cookie sol_admin_token for seamless session
    res.cookie('sol_admin_token', token, {
      httpOnly: true,
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
      sameSite: 'lax',
    })

    // If token was passed via URL query, redirect to clean URL without token param
    if (req.query?.token) {
      const cleanUrl = req.originalUrl
        .replace(/([?&])token=[^&]+(&|$)/, '$1')
        .replace(/[?&]$/, '')
      return res.redirect(cleanUrl || '/admin/services')
    }

    next()
  } catch {
    res.clearCookie('sol_admin_token', { path: '/' })
    return res.redirect('/admin/login?error=session_expired')
  }
}
