export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000

export function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '')
}

export async function requestJson(
  path,
  {
    baseUrl,
    signal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    method = 'GET',
    headers = {},
    body,
  } = {},
) {
  const controller = new AbortController()
  let didTimeout = false
  const abortFromCaller = () => controller.abort()

  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abortFromCaller, { once: true })

  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  try {
    const fetchOptions = { signal: controller.signal }
    let requestBody = body

    if (body !== undefined && typeof body === 'object' && !(body instanceof FormData)) {
      const fetchHeaders = new Headers(headers || {})
      if (!fetchHeaders.has('Content-Type')) {
        fetchHeaders.set('Content-Type', 'application/json')
      }
      fetchOptions.headers = fetchHeaders
      requestBody = JSON.stringify(body)
    } else if (headers && Object.keys(headers).length > 0) {
      fetchOptions.headers = new Headers(headers)
    }

    if (method && method !== 'GET') {
      fetchOptions.method = method
    }

    if (requestBody !== undefined) {
      fetchOptions.body = requestBody
    }

    const response = await fetch(
      normalizeBaseUrl(baseUrl) + path,
      fetchOptions,
    )

    if (!response.ok) {
      let errorPayload = null
      try {
        errorPayload = await response.json()
      } catch {
        // response may not be JSON
      }
      const message = errorPayload?.message || ('API trả về HTTP ' + response.status + '.')
      const error = new Error(message)
      error.status = response.status
      error.code = errorPayload?.code
      throw error
    }

    return await response.json()
  } catch (error) {
    if (didTimeout) {
      throw new Error(
        'Yêu cầu kiểm tra API đã hết thời gian chờ. Vui lòng thử lại.',
        { cause: error },
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
