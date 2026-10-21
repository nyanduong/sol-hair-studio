import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiBaseUrl } from '../../../config/env.js'
import {
  activateCustomer,
  getMe,
  loginUser,
  logoutUser,
  registerCustomer,
  resendActivationOtp,
} from '../api/auth.api.js'
import { AuthContext } from './auth-context.js'

const TOKEN_STORAGE_KEY = 'sol_auth_token'
const ACCOUNT_STORAGE_KEY = 'sol_auth_account'

function loadStoredAuth() {
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    const rawAccount = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    const account = rawAccount ? JSON.parse(rawAccount) : null
    if (token && account) {
      return { token, account }
    }
  } catch {
    // If parsing fails or localStorage is unavailable
  }
  return { token: null, account: null }
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(loadStoredAuth)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('login')
  const [promptNotice, setPromptNotice] = useState('')

  const openLoginModal = useCallback((notice = '') => {
    setPromptNotice(notice)
    setModalMode('login')
    setIsModalOpen(true)
  }, [])

  const openRegisterModal = useCallback((notice = '') => {
    setPromptNotice(notice)
    setModalMode('register')
    setIsModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsModalOpen(false)
    setPromptNotice('')
  }, [])

  const login = useCallback(async ({ email, password }) => {
    const data = await loginUser(apiBaseUrl, { email, password })
    const { token, account } = data

    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token)
      localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account))
    } catch {
      // Storage quota or disabled
    }

    setAuthState({ token, account })
    setIsModalOpen(false)
    setPromptNotice('')
    return data
  }, [])

  const register = useCallback(async ({ email, password }) => {
    const data = await registerCustomer(apiBaseUrl, { email, password })
    return data
  }, [])

  const activate = useCallback(async ({ email, code }) => {
    const data = await activateCustomer(apiBaseUrl, { email, code })
    if (data?.token && data?.account) {
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token)
        localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(data.account))
      } catch {
        // Storage quota or disabled
      }
      setAuthState({ token: data.token, account: data.account })
      setIsModalOpen(false)
      setPromptNotice('')
    }
    return data
  }, [])

  const resendActivation = useCallback(async ({ email }) => {
    const data = await resendActivationOtp(apiBaseUrl, { email })
    return data
  }, [])

  const logout = useCallback(async () => {
    const currentToken = authState.token
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY)
      localStorage.removeItem(ACCOUNT_STORAGE_KEY)
    } catch {
      // Storage unavailable
    }

    setAuthState({ token: null, account: null })

    if (currentToken) {
      void logoutUser(apiBaseUrl, currentToken)
    }
  }, [authState.token])

  // Verify session validity on initial load
  useEffect(() => {
    if (!authState.token) return

    let cancelled = false
    const controller = new AbortController()

    getMe(apiBaseUrl, authState.token, { signal: controller.signal })
      .then((data) => {
        const resolvedAccount = data?.account || (data?.accountId ? data : null)
        if (!cancelled && resolvedAccount) {
          setAuthState((prev) => ({
            ...prev,
            account: resolvedAccount,
          }))
          try {
            localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(resolvedAccount))
          } catch {
            // Ignore
          }
        }
      })
      .catch((error) => {
        if (!cancelled && (error?.status === 401 || error?.status === 403)) {
          // Token is expired or invalidated
          try {
            localStorage.removeItem(TOKEN_STORAGE_KEY)
            localStorage.removeItem(ACCOUNT_STORAGE_KEY)
          } catch {
            // Ignore
          }
          setAuthState({ token: null, account: null })
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [authState.token])

  const contextValue = useMemo(() => ({
    token: authState.token,
    account: authState.account,
    isAuthenticated: Boolean(authState.token && authState.account),
    isModalOpen,
    modalMode,
    promptNotice,
    openLoginModal,
    openRegisterModal,
    closeModal,
    setModalMode,
    login,
    register,
    activate,
    resendActivation,
    logout,
  }), [
    authState.token,
    authState.account,
    isModalOpen,
    modalMode,
    promptNotice,
    openLoginModal,
    openRegisterModal,
    closeModal,
    login,
    register,
    activate,
    resendActivation,
    logout,
  ])

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}
