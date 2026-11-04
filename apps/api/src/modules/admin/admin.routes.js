import { listCategories } from '../services/categories.service.js'
import { renderCategories, categoryAction } from './categories.controller.js'
import { Router } from 'express'
import {
  renderLogin,
  handleLogout,
  renderDashboard,
  renderServices,
  createServiceAction,
  updateServiceAction,
  toggleServiceStatusAction,
} from './admin.controller.js'
import { renderRevenue } from './revenue.controller.js'
import { requireAdminAuth } from './admin.middleware.js'

export const adminRouter = Router()

// Authentication routes
adminRouter.get('/admin/login', renderLogin)
adminRouter.post('/admin/login', (req, res) => res.redirect(303, '/admin/login'))
adminRouter.post('/admin/session', (req, res, next) => {
  // Only this handoff endpoint accepts a token in the form body.
  if (typeof req.body?.token === 'string') {
    req.headers.authorization = `Bearer ${req.body.token}`
    delete req.headers.cookie
  }
  next()
}, requireAdminAuth, (req, res) => res.redirect(303, '/admin/dashboard'))
adminRouter.post('/admin/logout', requireAdminAuth, handleLogout)

// Default admin redirect
adminRouter.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard')
})

// Owner Dashboard routes (EJS)
adminRouter.get('/admin/dashboard', requireAdminAuth, renderDashboard)
adminRouter.get('/owner/dashboard', requireAdminAuth, renderDashboard)

adminRouter.get('/admin/revenue', requireAdminAuth, renderRevenue)

adminRouter.get('/admin/service-categories/options', requireAdminAuth, async (req, res, next) => { try { res.json({ data: await listCategories(req.identity) }) } catch (error) { next(error) } })
adminRouter.get('/admin/service-categories', requireAdminAuth, renderCategories)
adminRouter.post('/admin/service-categories', requireAdminAuth, categoryAction)
adminRouter.post('/admin/service-categories/:id', requireAdminAuth, categoryAction)

// Owner Services management routes (EJS)
adminRouter.get('/admin/services', requireAdminAuth, renderServices)
adminRouter.post('/admin/services', requireAdminAuth, createServiceAction)
adminRouter.post('/admin/services/:id/update', requireAdminAuth, updateServiceAction)
adminRouter.post('/admin/services/:id/toggle', requireAdminAuth, toggleServiceStatusAction)

// Backward compatibility / Owner aliases
adminRouter.get('/owner/services', requireAdminAuth, renderServices)
adminRouter.post('/owner/services', requireAdminAuth, createServiceAction)
adminRouter.post('/owner/services/:id/update', requireAdminAuth, updateServiceAction)
adminRouter.post('/owner/services/:id/toggle', requireAdminAuth, toggleServiceStatusAction)
