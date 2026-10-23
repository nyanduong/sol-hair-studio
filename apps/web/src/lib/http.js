export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000

export function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '')
}

export class HttpError extends Error {
  constructor(status, payload) {
    super(payload?.message || ('API trả về HTTP ' + status + '.'))
    this.name = 'HttpError'
    this.status = status
    this.code = typeof payload?.code === 'string' ? payload.code : undefined
    if (payload?.details && typeof payload.details === 'object' && !Array.isArray(payload.details)) this.details = payload.details
    this.conflicts = Array.isArray(payload?.conflicts) ? payload.conflicts : []
  }
}

export async function requestJson(path, { baseUrl, signal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, method = 'GET', headers = {}, body, fetchImpl = fetch } = {}) {
  const controller = new AbortController()
  let didTimeout = false
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })
  const timeoutId = setTimeout(() => { didTimeout = true; controller.abort() }, timeoutMs)
  try {
    const fetchOptions = { signal: controller.signal }
    let requestBody = body
    if (body !== undefined && typeof body === 'object' && !(body instanceof FormData)) {
      const fetchHeaders = new Headers(headers)
      if (!fetchHeaders.has('Content-Type')) fetchHeaders.set('Content-Type', 'application/json')
      fetchOptions.headers = fetchHeaders
      requestBody = JSON.stringify(body)
    } else if (Object.keys(headers).length) fetchOptions.headers = new Headers(headers)
    if (method !== 'GET') fetchOptions.method = method
    if (requestBody !== undefined) fetchOptions.body = requestBody
    const response = await fetchImpl(normalizeBaseUrl(baseUrl) + path, fetchOptions)
    if (!response.ok) {
      let payload = null
      try { payload = await response.json() } catch { /* Phản hồi không phải JSON vẫn báo mã HTTP. */ }
      throw new HttpError(response.status, payload)
    }
    return await response.json()
  } catch (error) {
    if (didTimeout) throw new Error('Yêu cầu kiểm tra API đã hết thời gian chờ. Vui lòng thử lại.', { cause: error })
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
