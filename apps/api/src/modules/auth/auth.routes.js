import { Router } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import { authHandler } from './auth.controller.js'
import * as auth from './auth.service.js'

export const authRouter = Router()
const post = (path, fn, fields) => authRouter.post(`/auth/${path}`, authHandler(fn, { fields }))
authRouter.post('/auth/register', authHandler(auth.registerCustomer, { status: 201, fields: ['email', 'password'] }))
post('activate', auth.verifyCustomerActivation, ['email', 'code'])
post('resend-activation', auth.resendCustomerActivationOtp, ['email'])
post('otp/request', auth.requestOtp, ['email', 'purpose'])
post('otp/verify', auth.verifyOtp, ['email', 'purpose', 'code'])
post('password/complete', auth.completePassword, ['email', 'purpose', 'grant', 'password'])
post('forgot-password', (input) => auth.requestOtp({ ...input, purpose: 'reset_password' }), ['email'])
post('reset-password', (input) => auth.completePassword({ ...input, purpose: 'reset_password' }), ['email', 'grant', 'password'])
post('login', auth.login, ['email', 'password'])
authRouter.post('/auth/logout', requireAuth, authHandler(auth.logout, { identity: true }))
authRouter.get('/auth/me', requireAuth, authHandler(auth.getMyProfile, { identity: true }))
authRouter.patch('/auth/me', requireAuth, requireRoles('customer'), authHandler(auth.updateMyProfile, { identity: true, fields: ['displayName', 'phone'] }))
authRouter.post('/auth/staff', requireAuth, requireRoles('owner'), authHandler(auth.createStaffAccount, { status: 201, fields: ['email'] }))
