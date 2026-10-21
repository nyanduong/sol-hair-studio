import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import {
  activateCustomer,
  completePassword,
  getMe,
  loginUser,
  logoutUser,
  registerCustomer,
  requestOtp,
  resendActivationOtp,
  updateMyProfile,
  verifyOtp,
} from '../api/auth.api.js'
import {
  clearStoredSession,
  getStoredAccount,
  getStoredToken,
  setStoredSession,
} from '../storage/auth-storage.js'
import { AuthContext } from './auth-context.js'

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null)
  const [account, setAccount] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize stored session on launch
  useEffect(() => {
    let cancelled = false

    async function initSession() {
      try {
        const [savedToken, savedAccount] = await Promise.all([
          getStoredToken(),
          getStoredAccount(),
        ])

        if (!cancelled && savedToken) {
          setToken(savedToken)
          setAccount(savedAccount)
          if (savedAccount?.customer) {
            setCustomer(savedAccount.customer)
          }

          // Validate token and sync profile with backend
          try {
            const data = await getMe(apiBaseUrl, savedToken)
            if (!cancelled && data) {
              const resolvedAccount = data.account || data
              setAccount(resolvedAccount)
              if (data.customer) {
                setCustomer(data.customer)
              }
              await setStoredSession({ token: savedToken, account: resolvedAccount })
            }
          } catch (err) {
            if (!cancelled && (err?.status === 401 || err?.status === 403)) {
              // Token revoked or invalidated
              await clearStoredSession()
              setToken(null)
              setAccount(null)
              setCustomer(null)
            }
          }
        }
      } catch {
        // Ignore initialization errors
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void initSession()

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const data = await loginUser(apiBaseUrl, { email, password })
    const authToken = data.token
    const authAccount = data.account

    setToken(authToken)
    setAccount(authAccount)
    await setStoredSession({ token: authToken, account: authAccount })

    // Fetch full profile (e.g. linked customer details)
    try {
      const profile = await getMe(apiBaseUrl, authToken)
      if (profile?.customer) {
        setCustomer(profile.customer)
      }
    } catch {
      // Profile fetch can fail safely without blocking login
    }

    return data
  }, [])

  const register = useCallback(async ({ email, password }) => {
    const data = await registerCustomer(apiBaseUrl, { email, password })
    return data
  }, [])

  const activate = useCallback(async ({ email, code, savedPassword }) => {
    const data = await activateCustomer(apiBaseUrl, { email, code })

    // If API directly returned a session token (e.g. direct-session on activation)
    if (data?.token && data?.account) {
      setToken(data.token)
      setAccount(data.account)
      await setStoredSession({ token: data.token, account: data.account })
      return data
    }

    // Auto-login fallback if saved password is provided
    if (savedPassword) {
      try {
        const loginData = await loginUser(apiBaseUrl, { email, password: savedPassword })
        setToken(loginData.token)
        setAccount(loginData.account)
        await setStoredSession({ token: loginData.token, account: loginData.account })
        return loginData
      } catch {
        // If auto-login fails, return original activation data
      }
    }

    return data
  }, [])

  const resendActivation = useCallback(async ({ email }) => {
    const data = await resendActivationOtp(apiBaseUrl, { email })
    return data
  }, [])

  const requestOtpForPurpose = useCallback(async ({ email, purpose }) => {
    const data = await requestOtp(apiBaseUrl, { email, purpose })
    return data
  }, [])

  const verifyOtpForPurpose = useCallback(async ({ email, purpose, code }) => {
    const data = await verifyOtp(apiBaseUrl, { email, purpose, code })
    return data
  }, [])

  const completePasswordForPurpose = useCallback(async ({ email, purpose, grant, password }) => {
    const data = await completePassword(apiBaseUrl, { email, purpose, grant, password })
    return data
  }, [])

  const updateCustomerProfile = useCallback(async ({ displayName, phone }) => {
    if (!token) throw new Error('Cần đăng nhập để cập nhật hồ sơ.')
    const data = await updateMyProfile(apiBaseUrl, token, { displayName, phone })

    const updatedAccount = data.account || data
    setAccount(updatedAccount)
    if (data.customer) {
      setCustomer(data.customer)
    }
    await setStoredSession({ token, account: updatedAccount })
    return data
  }, [token])

  const refreshProfile = useCallback(async () => {
    if (!token) return null
    try {
      const data = await getMe(apiBaseUrl, token)
      const resolved = data.account || data
      setAccount(resolved)
      if (data.customer) {
        setCustomer(data.customer)
      }
      await setStoredSession({ token, account: resolved })
      return data
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        await clearStoredSession()
        setToken(null)
        setAccount(null)
        setCustomer(null)
      }
      throw err
    }
  }, [token])

  const logout = useCallback(async () => {
    const currentToken = token
    await clearStoredSession()
    setToken(null)
    setAccount(null)
    setCustomer(null)

    if (currentToken) {
      void logoutUser(apiBaseUrl, currentToken)
    }
  }, [token])

  const isAuthenticated = Boolean(token && account)
  const isCustomer = Boolean(account?.roles?.includes('customer'))
  const isStylist = Boolean(account?.roles?.includes('stylist'))
  const isProfileComplete = Boolean(customer?.displayName && customer?.phone)

  const value = useMemo(() => ({
    token,
    account,
    customer,
    isLoading,
    isAuthenticated,
    isCustomer,
    isStylist,
    isProfileComplete,
    login,
    register,
    activate,
    resendActivation,
    requestOtpForPurpose,
    verifyOtpForPurpose,
    completePasswordForPurpose,
    updateCustomerProfile,
    refreshProfile,
    logout,
  }), [
    token,
    account,
    customer,
    isLoading,
    isAuthenticated,
    isCustomer,
    isStylist,
    isProfileComplete,
    login,
    register,
    activate,
    resendActivation,
    requestOtpForPurpose,
    verifyOtpForPurpose,
    completePasswordForPurpose,
    updateCustomerProfile,
    refreshProfile,
    logout,
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
