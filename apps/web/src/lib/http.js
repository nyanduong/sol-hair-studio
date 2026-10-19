export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000

export function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, '')
}

export class HttpError extends Error {
  constructor(status, payload) {
    super('API trả về HTTP ' + status + '.')
    this.name = 'HttpError'
    this.status = status
    this.code = typeof payload?.code === 'string' ? payload.code : undefined
    this.apiMessage = typeof payload?.message === 'string' ? payload.message : undefined
    this.conflicts = Array.isArray(payload?.conflicts) ? payload.conflicts : []
  }
}

export async function requestJson(
  path,
  {
    baseUrl,
    signal,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    method,
    headers,
    body,
    fetchImpl = fetch,
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
    const response = await fetchImpl(
      normalizeBaseUrl(baseUrl) + path,
      { signal: controller.signal, ...(method && { method }), ...(headers && { headers }), ...(body !== undefined && { body: JSON.stringify(body) }) },
    )

    if (!response.ok) {
      let payload
      try { payload = await response.json() } catch { /* Phản hồi không phải JSON vẫn báo mã HTTP. */ }
      throw new HttpError(response.status, payload)
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
