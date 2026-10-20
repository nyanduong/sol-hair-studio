import { requestJson } from '../../../lib/http.js'

export async function loginUser(apiBaseUrl, { email, password }, { signal } = {}) {
  const response = await requestJson('/api/auth/login', {
    baseUrl: apiBaseUrl,
    method: 'POST',
    body: { email, password },
    signal,
  })

  return response.data
}

export async function registerCustomer(apiBaseUrl, { email, password }, { signal } = {}) {
  const response = await requestJson('/api/auth/register', {
    baseUrl: apiBaseUrl,
    method: 'POST',
    body: { email, password },
    signal,
  })

  return response.data
}

export async function activateCustomer(apiBaseUrl, { email, code }, { signal } = {}) {
  const response = await requestJson('/api/auth/activate', {
    baseUrl: apiBaseUrl,
    method: 'POST',
    body: { email, code },
    signal,
  })

  return response.data
}

export async function resendActivationOtp(apiBaseUrl, { email }, { signal } = {}) {
  const response = await requestJson('/api/auth/resend-activation', {
    baseUrl: apiBaseUrl,
    method: 'POST',
    body: { email },
    signal,
  })

  return response.data
}

export async function getMe(apiBaseUrl, token, { signal } = {}) {
  const response = await requestJson('/api/auth/me', {
    baseUrl: apiBaseUrl,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    signal,
  })

  return response.data
}

export async function logoutUser(apiBaseUrl, token, { signal } = {}) {
  try {
    await requestJson('/api/auth/logout', {
      baseUrl: apiBaseUrl,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal,
    })
  } catch {
    // Ignore network error on logout so client session is always cleared
  }
}

export function getAuthErrorMessage(error) {
  if (error instanceof Error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      return 'Email hoặc mật khẩu không chính xác.'
    }
    if (error.code === 'ACCOUNT_NOT_ACTIVE') {
      return 'Tài khoản chưa được kích hoạt qua OTP email hoặc đã bị khóa.'
    }
    if (error.code === 'EMAIL_ALREADY_EXISTS') {
      return 'Email này đã được đăng ký tài khoản.'
    }
    if (error.code === 'INVALID_OTP') {
      return 'Mã OTP không chính xác. Vui lòng kiểm tra lại hộp thư.'
    }
    if (error.code === 'INVALID_CODE_FORMAT') {
      return 'Mã OTP phải gồm đúng 6 chữ số.'
    }
    if (error.code === 'CHALLENGE_EXPIRED') {
      return 'Mã OTP đã hết hạn (sau 5 phút). Vui lòng bấm gửi lại mã mới.'
    }
    if (error.code === 'MAX_ATTEMPTS_EXCEEDED') {
      return 'Mã xác thực đã bị vô hiệu sau 5 lần nhập sai. Vui lòng gửi lại mã mới.'
    }
    if (error.code === 'CHALLENGE_ALREADY_CONSUMED') {
      return 'Mã xác thực đã được sử dụng. Vui lòng đăng nhập.'
    }
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      return 'Bạn đã thực hiện quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút.'
    }
    if (error.message.includes('hết thời gian chờ')) {
      return 'Yêu cầu đăng nhập đã hết thời gian chờ. Vui lòng kiểm tra mạng và thử lại.'
    }
    if (error.message && !error.message.includes('HTTP')) {
      return error.message
    }
  }

  return 'Đã xảy ra lỗi khi kết nối với hệ thống. Vui lòng thử lại sau.'
}
