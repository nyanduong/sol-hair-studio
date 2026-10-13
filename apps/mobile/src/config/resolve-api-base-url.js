import { normalizeBaseUrl } from '../lib/http.js'

export function resolveApiBaseUrl({ configuredUrl, hostUri, platform, isDevelopment }) {
  if (configuredUrl?.trim()) return normalizeBaseUrl(configuredUrl)

  if (isDevelopment && hostUri) {
    try {
      const { hostname } = new URL(
        hostUri.includes('://') ? hostUri : `http://${hostUri}`,
      )
      if (hostname) {
        const host = platform === 'android' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
          ? '10.0.2.2'
          : hostname
        return `http://${host}:4000`
      }
    } catch {
      // Some runtimes do not expose a usable Metro host; use the platform default.
    }
  }

  return isDevelopment && platform === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000'
}
