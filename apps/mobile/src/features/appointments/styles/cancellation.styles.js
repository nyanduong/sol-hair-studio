import { StyleSheet } from 'react-native'
import { colors, displayFont } from '../../../theme/tokens.js'

export const styles = StyleSheet.create({
  footer: { paddingHorizontal: 20, paddingBottom: 12, paddingTop: 8, backgroundColor: colors.canvas },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#24211f80' },
  dialog: { width: '100%', maxWidth: 400, maxHeight: '100%', alignSelf: 'center', backgroundColor: colors.canvas, borderRadius: 24, overflow: 'hidden' },
  content: { padding: 24, gap: 14 },
  title: { fontFamily: displayFont, fontSize: 27, color: colors.ink },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  summary: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft, padding: 14, borderRadius: 16, gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  message: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  confirm: { minHeight: 48, padding: 14, borderRadius: 26, backgroundColor: colors.copper, alignItems: 'center', justifyContent: 'center' },
  confirmText: { color: colors.surface, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  cancel: { minHeight: 48, padding: 14, borderRadius: 26, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.ink, fontWeight: '600', fontSize: 15, textAlign: 'center' },
  disabled: { opacity: 0.5 },
})
