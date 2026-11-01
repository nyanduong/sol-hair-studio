import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config/env.js'
import { errorHandler } from './middlewares/error-handler.js'
import { notFound } from './middlewares/not-found.js'
import { adminAppointmentsRouter } from './modules/admin/admin-appointments.routes.js'
import { apiRouter } from './routes/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const allowedOrigins =
  config.corsOrigin === '*' ? true : config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

export function createApp({ routes = apiRouter, logStream } = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.set('view engine', 'ejs')
  app.set('views', path.join(__dirname, 'views'))

  app.use('/admin-assets', express.static(path.join(__dirname, '../public')))

  // Log HTTP ra terminal; không ghi query, body hoặc Authorization.
  app.use(morgan((tokens, req, res) => [
    tokens.method(req, res), req.originalUrl.split('?')[0], tokens.status(req, res),
    tokens['response-time'](req, res), 'ms',
  ].join(' '), {
    skip: req => req.method === 'OPTIONS' || (config.nodeEnv === 'test' && !logStream),
    stream: logStream,
  }))

  app.use(cors({ origin: allowedOrigins }))
  app.use(express.json({ limit: '15mb' }))
  app.use(express.urlencoded({ extended: true, limit: '15mb' }))
  app.use(routes)
  app.use('/admin', adminAppointmentsRouter)
  // Giữ link lịch có sẵn của dashboard mà không sửa module Admin của thành viên khác.
  app.use('/owner/appointments', (req, res) => {
    return res.redirect(308, '/admin/appointments' + req.url)
  })
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export const app = createApp()
