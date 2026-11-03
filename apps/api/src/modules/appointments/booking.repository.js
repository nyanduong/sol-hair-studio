import { BookingRequestModel } from './booking-requests.model.js'
import { AppointmentModel } from './appointments.model.js'
import { AppointmentEventModel } from './appointment-events.model.js'

// Must finish before accepting booking traffic. No syncIndexes/drop of existing indexes.
export async function prepareBookingStorage() {
  for (const model of [AppointmentModel, AppointmentEventModel, BookingRequestModel]) {
    await model.createCollection()
    await model.createIndexes()
  }
}
