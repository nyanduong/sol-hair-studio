const records = new Map()

const DEFAULT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_IP_REQUESTS = 20
const MAX_ACCOUNT_REQUESTS = 10

function pruneExpired(now) {
  for (const [key, record] of records.entries()) {
    if (record.resetAt <= now) {
      records.delete(key)
    }
  }
}

export function checkRateLimit(key, maxRequests, windowMs = DEFAULT_WINDOW_MS) {
  if (!key) return true

  const now = Date.now()
  pruneExpired(now)

  let record = records.get(key)
  if (!record || record.resetAt <= now) {
    record = { count: 1, resetAt: now + windowMs }
    records.set(key, record)
    return true
  }

  if (record.count >= maxRequests) {
    return false
  }

  record.count += 1
  return true
}

export function checkAuthRateLimits({ ip, email }) {
  if (ip && !checkRateLimit(`ip:${ip}`, MAX_IP_REQUESTS)) {
    return false
  }
  if (typeof email === 'string' && !checkRateLimit(`email:${email.toLowerCase().trim()}`, MAX_ACCOUNT_REQUESTS)) {
    return false
  }
  return true
}

export function resetRateLimits() {
  records.clear()
}
