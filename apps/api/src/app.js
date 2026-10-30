import cors from 'cors'
import express from 'express'
import { fileURLToPath } from 'node:url'
import { config } from './config/env.js'
import { errorHandler } from './middlewares/error-handler.js'
import { notFound } from './middlewares/not-found.js'
import { apiRouter } from './routes/index.js'
import { adminRouter } from './routes/admin.routes.js'

const allowedOrigins =
  config.corsOrigin === '*' ? true : config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

export function createApp({ routes = apiRouter } = {}) {
  const app = express()

  app.disable('x-powered-by')
  app.set('view engine', 'ejs')
  app.set('views', fileURLToPath(new URL('./views', import.meta.url)))
  app.use(cors({ origin: allowedOrigins }))
  app.use(express.json())
  app.use('/admin/assets', express.static(fileURLToPath(new URL('./public/admin', import.meta.url))))
  app.use(adminRouter)
  app.use(routes)
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export const app = createApp()
