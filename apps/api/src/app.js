import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { config } from './config/env.js'
import { errorHandler } from './middlewares/error-handler.js'
import { notFound } from './middlewares/not-found.js'
import { apiRouter } from './routes/index.js'
import { fileURLToPath } from 'node:url'
import { ownerWebRouter } from './modules/owner-web/owner-web.routes.js'
import { availabilityInvalidation } from './modules/availability/availability.realtime.js'

const allowedOrigins =
  config.corsOrigin === '*' ? true : config.corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

export function createApp({ routes = apiRouter, logStream } = {}) {
  const app = express()
  app.set('view engine', 'ejs')
  app.set('views', fileURLToPath(new URL('./views/', import.meta.url)))

  app.use('/owner-assets',express.static(fileURLToPath(new URL('../public/', import.meta.url))))

  app.disable('x-powered-by')
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
  app.use(availabilityInvalidation)
  app.use(routes)
  app.use('/owner', ownerWebRouter)
  app.use(notFound)
  app.use(errorHandler)

  return app
}

export const app = createApp()
