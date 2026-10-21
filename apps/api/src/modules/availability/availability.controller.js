import { AvailabilityError, getAvailability } from './availability.service.js'

export async function getAvailabilityController(request, response, next) {
  try {
    return response.json({ status: 'success', data: await getAvailability(request.identity, request.query) })
  } catch (error) {
    if (!(error instanceof AvailabilityError)) return next(error)
    return response.status(error.status).json({ status: 'error', code: error.code, message: error.message })
  }
}
