import { config } from '../src/config/env.js'
import { connectToDatabase, disconnectFromDatabase } from '../src/config/database.js'
import { AppointmentModel } from '../src/modules/appointments/appointments.model.js'
import { generateBookingReference } from '../src/modules/appointments/booking-reference.js'
import { prepareBookingStorage } from '../src/modules/appointments/booking.repository.js'

try {
  if (!config.mongoUri) throw new Error('Cần cấu hình MongoDB trước khi bổ sung mã lịch.')
  await connectToDatabase(config.mongoUri)
  await prepareBookingStorage()
  let updated = 0
  for await (const appointment of AppointmentModel.find({ referenceCode: { $exists: false } })
    .select('_id')
    .lean()
    .cursor()) {
    let saved = false
    for (let attempt = 0; attempt < 10 && !saved; attempt++) {
      try {
        // Metadata-only backfill: never replace an existing reference or modify booking revisions.
        const result = await AppointmentModel.collection.updateOne(
          { _id: appointment._id, referenceCode: { $exists: false } },
          { $set: { referenceCode: generateBookingReference() } },
        )
        updated += result.modifiedCount
        saved = true
      } catch (error) {
        if (error.code !== 11000 || !error.keyPattern?.referenceCode) throw error
      }
    }
    if (!saved) throw new Error('Chưa cấp được mã duy nhất. Có thể chạy lại để tiếp tục.')
  }
  console.log(`Đã bổ sung mã cho ${updated} lịch; không thay đổi mã đã có.`)
} finally {
  await disconnectFromDatabase()
}
