import { Platform } from 'react-native'

export const colors = {
  canvas: '#faf7f1', ink: '#24211f', muted: '#6f665e', copper: '#a14f3d',
  border: '#e7ddd2', surface: '#ffffff', soft: '#f3eee6',
}
// Native system serif fonts support Vietnamese without a network font dependency.
export const displayFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })
