import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearStoredSession,
  getStoredAccount,
  getStoredToken,
  setStoredSession,
} from '../storage/auth-storage.js'

describe('auth-storage (mobile)', () => {
  beforeEach(async () => {
    await clearStoredSession()
  })

  it('lưu và truy xuất token cùng account từ session store', async () => {
    expect(await getStoredToken()).toBeNull()
    expect(await getStoredAccount()).toBeNull()

    const mockAccount = { accountId: 'acc-1', email: 'mobile@sol.test', roles: ['customer'] }
    await setStoredSession({ token: 'jwt-token-abc', account: mockAccount })

    expect(await getStoredToken()).toBe('jwt-token-abc')
    expect(await getStoredAccount()).toEqual(mockAccount)
  })

  it('clearStoredSession xóa sạch token và account', async () => {
    await setStoredSession({ token: 'jwt-123', account: { email: 'test@sol.test' } })
    expect(await getStoredToken()).toBe('jwt-123')

    await clearStoredSession()
    expect(await getStoredToken()).toBeNull()
    expect(await getStoredAccount()).toBeNull()
  })
})
