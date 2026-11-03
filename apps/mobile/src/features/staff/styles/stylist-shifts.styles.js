import { StyleSheet } from 'react-native'
import { colors } from '../../../theme/tokens.js'

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 },
  brand: { color: colors.copper, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '700', marginTop: 8 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center' },
  weekControls: { alignItems: 'center', borderBottomColor: colors.border, borderTopColor: colors.border, borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  iconButton: { alignItems: 'center', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  weekLabel: { color: colors.ink, fontSize: 15, fontWeight: '600' },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  error: { color: '#9c2d2d', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  primaryButton: { backgroundColor: colors.copper, borderRadius: 24, marginTop: 20, paddingHorizontal: 22, paddingVertical: 12 },
  primaryButtonText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  list: { gap: 12, padding: 20 },
  staffName: { color: colors.muted, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  shiftCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  shiftDate: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  shiftTime: { color: colors.muted, fontSize: 15, marginTop: 5 },
  status: { backgroundColor: '#e7f4ea', borderRadius: 12, color: '#27733e', fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6 },
  cancelled: { backgroundColor: '#f9e6e3', color: '#9c2d2d' },
})
