const TOKEN_STORAGE_KEY = 'sol_mobile_auth_token'
const ACCOUNT_STORAGE_KEY = 'sol_mobile_auth_account'

let memoryToken = null
let memoryAccount = null

export async function getStoredToken() {
  if (memoryToken) return memoryToken
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      memoryToken = globalThis.localStorage.getItem(TOKEN_STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors
  }
  return memoryToken
}

export async function getStoredAccount() {
  if (memoryAccount) return memoryAccount
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      const raw = globalThis.localStorage.getItem(ACCOUNT_STORAGE_KEY)
      if (raw) memoryAccount = JSON.parse(raw)
    }
  } catch {
    // Ignore storage errors
  }
  return memoryAccount
}

export async function setStoredSession({ token, account }) {
  memoryToken = token
  memoryAccount = account
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      if (token) globalThis.localStorage.setItem(TOKEN_STORAGE_KEY, token)
      else globalThis.localStorage.removeItem(TOKEN_STORAGE_KEY)

      if (account) globalThis.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account))
      else globalThis.localStorage.removeItem(ACCOUNT_STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}

export async function clearStoredSession() {
  memoryToken = null
  memoryAccount = null
  try {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.removeItem(TOKEN_STORAGE_KEY)
      globalThis.localStorage.removeItem(ACCOUNT_STORAGE_KEY)
    }
  } catch {
    // Ignore storage errors
  }
}
