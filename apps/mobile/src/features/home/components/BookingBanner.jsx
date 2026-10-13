import { StyleSheet, Text, View } from 'react-native'
import { colors, displayFont } from '../../../theme/tokens.js'

export default function BookingBanner() {
  return <View style={styles.banner}>
    <Text style={styles.eyebrow}>YOUR TIME AT SOL</Text>
    <Text accessibilityRole="header" style={styles.title}>Mái tóc mới, bắt đầu từ một cuộc hẹn.</Text>
    <Text style={styles.copy}>Đặt lịch trực tuyến chưa khả dụng. Sol sẽ cập nhật khi sẵn sàng.</Text>
    <View style={styles.badge}><Text style={styles.badgeText}>Sắp mở đặt lịch</Text></View>
  </View>
}
const styles = StyleSheet.create({
  banner: { marginTop: 24, padding: 24, backgroundColor: colors.copper, borderRadius: 24 },
  eyebrow: { color: colors.surface, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.surface, fontFamily: displayFont, fontSize: 29, marginTop: 10 },
  copy: { color: colors.surface, fontSize: 14, lineHeight: 22, marginTop: 10 },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.canvas, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  badgeText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
})
