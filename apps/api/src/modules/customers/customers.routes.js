import { Router } from 'express'
import { requireAuth, requireRoles } from '../../middlewares/auth.js'
import { CustomerError, listCustomers, customerDetail, saveCustomer, uploadCustomerAvatar } from './customers.service.js'
export const customersRouter = Router()
customersRouter.use('/customer-management', requireAuth, requireRoles('owner'))
const handle = (operation, status = 200) => async (req, res, next) => {
  try { res.status(status).json({ status: 'success', data: await operation(req) }) }
  catch (error) {
    if (error instanceof CustomerError) return res.status(error.status).json({ status: 'error', code: 'CUSTOMER_ERROR', message: error.message })
    next(error)
  }
}
customersRouter.get('/customer-management', handle(req => listCustomers(req.query)))
customersRouter.get('/customer-management/:id', handle(req => customerDetail(req.params.id, req.query)))
customersRouter.post('/customer-management', handle(req => saveCustomer(null, req.body), 201))
customersRouter.patch('/customer-management/:id', handle(req => saveCustomer(req.params.id, req.body)))

customersRouter.put('/customer-management/:id/avatar', handle(req => uploadCustomerAvatar(req.params.id, req.body)))
