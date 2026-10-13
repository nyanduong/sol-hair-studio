import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrl } from '../resolve-api-base-url.js'

const development = { isDevelopment: true, platform: 'android' }

describe('resolveApiBaseUrl', () => {
  it('ưu tiên API được cấu hình, kể cả khi host Expo khác', () => {
    expect(resolveApiBaseUrl({
      ...development,
      configuredUrl: ' https://api.example.com/v1/// ',
      hostUri: '192.168.10.20:8081',
    })).toBe('https://api.example.com/v1')
  })

  it.each(['android', 'ios'])('theo host LAN mới của Expo trên %s khi để trống cấu hình', (platform) => {
    for (const host of ['192.168.10.20', '10.20.30.40']) {
      expect(resolveApiBaseUrl({
        ...development,
        platform,
        configuredUrl: '  ',
        hostUri: `${host}:8081`,
      })).toBe(`http://${host}:4000`)
    }
  })

  it.each(['localhost', '127.0.0.1', '[::1]'])('đổi Expo loopback %s sang host máy tính của Android Emulator', (host) => {
    expect(resolveApiBaseUrl({ ...development, hostUri: `${host}:8081` }))
      .toBe('http://10.0.2.2:4000')
  })

  it('giữ loopback cho iOS Simulator', () => {
    expect(resolveApiBaseUrl({ ...development, platform: 'ios', hostUri: 'localhost:8081' }))
      .toBe('http://localhost:4000')
  })

  it('đọc hostUri có scheme và giữ địa chỉ IPv6 hợp lệ', () => {
    expect(resolveApiBaseUrl({ ...development, hostUri: 'exp://[fd00::20]:8081/path' }))
      .toBe('http://[fd00::20]:4000')
  })

  it.each([undefined, '', 'http://'])('dùng mặc định Android khi thiếu host Expo hợp lệ: %s', (hostUri) => {
    expect(resolveApiBaseUrl({ ...development, hostUri }))
      .toBe('http://10.0.2.2:4000')
  })

  it('không suy ra host Expo trong bản release', () => {
    expect(resolveApiBaseUrl({ ...development, isDevelopment: false, hostUri: '192.168.10.20:8081' }))
      .toBe('http://localhost:4000')
    expect(resolveApiBaseUrl({ ...development, isDevelopment: false, configuredUrl: 'https://api.example.com/' }))
      .toBe('https://api.example.com')
  })
})
