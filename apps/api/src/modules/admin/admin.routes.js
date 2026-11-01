import { Router } from 'express'
import {
  renderLogin,
  handleLogin,
  handleLogout,
  renderDashboard,
  renderServices,
  createServiceAction,
  updateServiceAction,
  toggleServiceStatusAction,
} from './admin.controller.js'
import { requireAdminAuth } from './admin.middleware.js'

export const adminRouter = Router()

// Authentication routes
adminRouter.get('/admin/login', renderLogin)
adminRouter.post('/admin/login', handleLogin)
adminRouter.post('/admin/logout', requireAdminAuth, handleLogout)

// Default admin redirect
adminRouter.get('/admin', (req, res) => {
  res.redirect('/admin/dashboard')
})

// Owner Dashboard routes (EJS)
adminRouter.get('/admin/dashboard', requireAdminAuth, renderDashboard)
adminRouter.get('/owner/dashboard', requireAdminAuth, renderDashboard)

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
