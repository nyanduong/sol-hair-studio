import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useFeatureUnavailable } from '../../../components/FeatureUnavailableProvider.jsx'
import { useAuth } from '../../auth/hooks/useAuth.js'
import { colors, displayFont } from '../../../theme/tokens.js'

export default function HomeHeader({ onServices, navigation }) {
  const showFeature = useFeatureUnavailable()
  const { isAuthenticated, isProfileComplete, customer } = useAuth()
  const { width, fontScale } = useWindowDimensions()
  const compact = width < 390 || fontScale > 1.15

  function handleBookingPress() {
    if (!isAuthenticated) {
      if (navigation) {
        navigation.navigate('Login', {
          notice: 'Vui lòng đăng nhập tài khoản trước khi đặt lịch hẹn.',
        })
      } else {
        showFeature('Đặt lịch')
      }
      return
    }

    if (!isProfileComplete) {
      if (navigation) {
        navigation.navigate('Profile')
      } else {
        showFeature('Đặt lịch')
      }
      return
    }

    showFeature('Đặt lịch')
  }

  const greetingText = customer?.displayName
    ? `Xin chào, ${customer.displayName}!`
    : 'Xin chào,'

  return (
    <View>
      <View style={styles.brandRow}>
        <Image
          source={require('../../../../assets/brand/sol-logo.png')}
          style={styles.logo}
          resizeMethod="scale"
          accessible={false}
        />
        <View style={styles.brandCopy}>
          <Text style={styles.brand}>SOL HAIR STUDIO</Text>
          <Text style={styles.tagline}>BEAUTY SHINES WITHIN</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Thông báo"
          onPress={() => showFeature('Thông báo')}
          style={styles.notification}
        >
          <Feather name="bell" size={26} color={colors.ink} />
        </Pressable>
      </View>

      <View style={[styles.hero, compact && styles.heroStack]}>
        <View style={styles.copy}>
          <Text style={styles.greeting}>{greetingText}</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Một phiên bản đẹp hơn của bạn bắt đầu từ hôm nay.
          </Text>
          <Text style={styles.intro}>
            Khám phá dịch vụ, phong cách và cảm hứng dành riêng cho mái tóc của bạn.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleBookingPress}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.buttonText}>Đặt lịch ngay →</Text>
          </Pressable>
        </View>
        <View style={[styles.media, compact && styles.mediaWide]}>
          <Image
            source={require('../../../../assets/brand/hero.jpg')}
            accessibilityLabel="Mái tóc nâu trong buổi tạo kiểu"
            style={styles.photo}
            resizeMode="cover"
          />
          <View style={styles.caption}>
            <Text style={styles.captionText}>Chạm vào phiên bản tự tin hơn.</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>DỊCH VỤ CỦA SOL</Text>
        <Pressable accessibilityRole="button" onPress={onServices} style={styles.all}>
          <Text style={styles.allText}>Xem tất cả →</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  notification: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 52, height: 52, resizeMode: 'contain', tintColor: colors.copper },
  brandCopy: { flex: 1 },
  brand: { color: colors.ink, fontFamily: displayFont, fontSize: 20, fontWeight: '700', letterSpacing: 1.2 },
  tagline: { color: colors.muted, fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 4 },
  hero: { flexDirection: 'row', gap: 16, paddingTop: 10, paddingBottom: 24, alignItems: 'stretch' },
  heroStack: { flexDirection: 'column' },
  copy: { flex: 1, justifyContent: 'center' },
  greeting: { color: colors.ink, fontSize: 15, marginBottom: 8 },
  title: { color: colors.ink, fontFamily: displayFont, fontSize: 30, lineHeight: 38, fontWeight: '700' },
  intro: { color: colors.muted, fontSize: 15, lineHeight: 23, fontWeight: '500', marginTop: 12 },
  button: { minHeight: 48, backgroundColor: colors.copper, borderRadius: 28, padding: 14, marginTop: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.surface, fontWeight: '700', fontSize: 14, textAlign: 'center' },
  media: { flex: 0.9, minHeight: 280, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.soft },
  mediaWide: { flex: undefined, minHeight: 0, height: 210 },
  photo: { width: '100%', height: '100%', position: 'absolute' },
  caption: { marginTop: 'auto', backgroundColor: '#24211fcc', padding: 14 },
  captionText: { color: colors.surface, fontFamily: displayFont, fontSize: 20, fontWeight: '700' },
  section: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 12 },
  sectionTitle: { color: colors.copper, fontSize: 13, letterSpacing: 2, fontWeight: '700' },
  all: { minHeight: 44, minWidth: 90, justifyContent: 'center' },
  allText: { color: colors.muted, fontSize: 14, fontWeight: '500' },
})
