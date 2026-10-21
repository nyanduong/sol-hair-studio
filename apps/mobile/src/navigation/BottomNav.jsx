import { Pressable, StyleSheet, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { useFeatureUnavailable } from '../components/FeatureUnavailableProvider.jsx'
import { useAuth } from '../features/auth/hooks/useAuth.js'
import { colors } from '../theme/tokens.js'

const items = [
  { route: 'Home', icon: 'home', label: 'Trang chủ' },
  { route: 'Services', icon: 'grid', label: 'Dịch vụ' },
  { icon: 'calendar', label: 'Đặt lịch', booking: true },
  { icon: 'clock', label: 'Lịch hẹn' },
  { route: 'Profile', icon: 'user', label: 'Tài khoản' },
]

export default function BottomNav({ navigation, active }) {
  const showFeature = useFeatureUnavailable()
  const { isAuthenticated, isProfileComplete } = useAuth()

  function handlePress(item) {
    if (item.label === 'Tài khoản') {
      if (active === 'Profile') return
      if (isAuthenticated) {
        navigation.navigate('Profile')
      } else {
        navigation.navigate('Login', {
          notice: 'Vui lòng đăng nhập để xem thông tin tài khoản.',
        })
      }
      return
    }

    if (item.label === 'Đặt lịch') {
      if (!isAuthenticated) {
        navigation.navigate('Login', {
          notice: 'Vui lòng đăng nhập tài khoản trước khi đặt lịch hẹn.',
        })
        return
      }
      if (!isProfileComplete) {
        navigation.navigate('Profile')
        return
      }
      return showFeature(item.label)
    }

    if (item.label === 'Lịch hẹn') {
      if (!isAuthenticated) {
        navigation.navigate('Login', {
          notice: 'Vui lòng đăng nhập để theo dõi lịch hẹn của bạn.',
        })
        return
      }
      return showFeature(item.label)
    }

    if (!item.route) return showFeature(item.label)
    if (item.route === active) return
    if (item.route === 'Home') navigation.popTo('Home')
    else navigation.navigate(item.route)
  }

  return (
    <View style={styles.bar} accessibilityLabel="Điều hướng chính">
      {items.map(item => {
        const selected = active === item.route
        return (
          <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label}
            accessibilityState={{ selected }} onPress={() => handlePress(item)}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
            <View style={[styles.icon, item.booking && styles.booking]}>
              <Feather name={item.icon} size={25} color={item.booking ? colors.surface : selected ? colors.copper : colors.ink} />
            </View>
            <Text style={[styles.label, selected && styles.active]}>{item.label}</Text>
            <View style={[styles.dot, selected && styles.activeDot]} />
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 4 },
  item: { flex: 1, minWidth: 44, minHeight: 64, alignItems: 'center', paddingHorizontal: 2 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  booking: { backgroundColor: colors.copper, borderRadius: 28, marginTop: -12, marginBottom: 12, borderWidth: 2, borderColor: colors.canvas },
  label: { fontSize: 12, fontWeight: '500', color: colors.muted, textAlign: 'center' },
  active: { color: colors.copper, fontWeight: '600' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  activeDot: { backgroundColor: colors.copper },
  pressed: { opacity: 0.7 },
})
