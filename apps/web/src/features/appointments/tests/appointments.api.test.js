import { afterEach, describe, expect, it, vi } from 'vitest'
import { listCustomerAppointments } from '../api/appointments.api.js'

afterEach(() => vi.unstubAllGlobals())
function respond(data, status = 200) {
  return vi.fn().mockResolvedValue({ ok: status === 200, status, json: async () => data })
}
describe('customer appointment API', () => {
  it('uses the shared HTTP helper, bearer session and only limit/cursor', async () => {
    const fetch = respond({ data: { items: [], pagination: { hasNextPage: false, nextCursor: null } } })
    vi.stubGlobal('fetch', fetch)
    await listCustomerAppointments('https://api.example.test/', 'customer-token', 'opaque+/=', new AbortController().signal)
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.example.test/api/appointments?limit=20&cursor=opaque%2B%2F%3D')
    expect(options.headers.get('Authorization')).toBe('Bearer customer-token')
    expect(options.body).toBeUndefined()
  })
  it('omits the first-page cursor', async () => {
    const fetch = respond({ data: { items: [], pagination: { hasNextPage: false } } })
    vi.stubGlobal('fetch', fetch)
    await listCustomerAppointments('https://api.example.test', 'token')
    expect(fetch.mock.calls[0][0]).toBe('https://api.example.test/api/appointments?limit=20')
  })
  it.each([400, 401, 403, 503])('preserves HTTP %s and business error codes', async status => {
    vi.stubGlobal('fetch', respond({ code: 'FIXTURE_ERROR', message: 'fixture' }, status))
    await expect(listCustomerAppointments('https://api.example.test', 'token')).rejects.toMatchObject({ status, code: 'FIXTURE_ERROR' })
  })
  it.each([
    null,
    { items: [], pagination: { hasNextPage: true, nextCursor: null } },
    { items: [{ id: '1', items: [], customerId: 'private' }], pagination: { hasNextPage: false } },
    { items: [{ id: '1', items: [], customerSnapshot: {} }], pagination: { hasNextPage: false } },
  ])('rejects malformed or non-customer payloads', async data => {
    vi.stubGlobal('fetch', respond({ data }))
    await expect(listCustomerAppointments('https://api.example.test', 'token')).rejects.toThrow('Không đọc được')
  })
})
