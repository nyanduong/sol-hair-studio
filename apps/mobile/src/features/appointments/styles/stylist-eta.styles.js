import { StyleSheet } from 'react-native'
import { colors } from '../../../theme/tokens.js'
export const styles = StyleSheet.create({
  keyboard: { flex: 1, justifyContent: 'center' },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, backgroundColor: colors.surface, color: colors.ink, fontSize: 15 },
  warning: { color: colors.ink, fontSize: 14, lineHeight: 22, marginTop: 14 },
  warningRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 12 },
  disabled: { opacity: 0.5 },
})
