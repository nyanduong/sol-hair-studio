import { app } from './app.js'
import { config } from './config/env.js'
import { prepareBookingStorage } from './modules/appointments/booking.repository.js'
import { connectToDatabase, disconnectFromDatabase } from './config/database.js'

async function start() {
  await connectToDatabase(config.mongoUri)
  if (config.mongoUri) await prepareBookingStorage()

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`Sol Hair API đang chạy tại http://localhost:${config.port} (${config.nodeEnv}).`)
    if (!config.mongoUri) {
      console.log('Chưa cấu hình MONGODB_URI; chức năng truy cập cơ sở dữ liệu đang tắt.')
    }
  })

  const shutdown = async (signal) => {
    console.log(`Đã nhận ${signal}; đang dừng API.`)
    server.close(async () => {
      await disconnectFromDatabase()
      process.exit(0)
    })
  }

  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

start().catch((error) => {
  console.error('Không thể khởi động API.', error)
  process.exit(1)
})
