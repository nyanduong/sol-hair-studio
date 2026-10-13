import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { resolveApiBaseUrl } from './resolve-api-base-url.js'

export const apiBaseUrl = resolveApiBaseUrl({
  configuredUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  hostUri: Constants.expoConfig?.hostUri,
  platform: Platform.OS,
  isDevelopment: __DEV__,
})
