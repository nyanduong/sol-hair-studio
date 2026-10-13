import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFeatureUnavailable } from '../../../components/FeatureUnavailableProvider.jsx'
import { colors, displayFont } from '../../../theme/tokens.js'

export default function BookingBanner() {
  const showFeature = useFeatureUnavailable()
  return <View style={styles.banner}>
    <Text style={styles.eyebrow}>YOUR TIME AT SOL</Text>
    <Text accessibilityRole="header" style={styles.title}>Mái tóc mới, bắt đầu từ một cuộc hẹn.</Text>
    <Text style={styles.copy}>Chọn stylist và thời gian phù hợp với bạn.</Text>
    <Pressable accessibilityRole="button" onPress={() => showFeature('Đặt lịch')} style={({ pressed }) => [styles.badge, pressed && { opacity: 0.75 }]}><Text style={styles.badgeText}>Đặt lịch ngay →</Text></Pressable>
  </View>
}
const styles = StyleSheet.create({
  banner: { marginTop: 24, padding: 24, backgroundColor: colors.copper, borderRadius: 24 },
  eyebrow: { color: colors.surface, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.surface, fontFamily: displayFont, fontSize: 29, marginTop: 10 },
  copy: { color: colors.surface, fontSize: 14, lineHeight: 22, marginTop: 10 },
  badge: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', backgroundColor: colors.canvas, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12, marginTop: 18 },
  badgeText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
})
