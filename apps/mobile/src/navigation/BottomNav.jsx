import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens.js'

export default function BottomNav({ navigation, active }) {
  return <View style={styles.bar} accessibilityLabel="Điều hướng chính">
    {[['Home', '⌂', 'Trang chủ'], ['Services', '▦', 'Dịch vụ']].map(([route, icon, label]) => (
      <Pressable key={route} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ selected: active === route }}
        onPress={() => { if (route !== active) { if (route === 'Home') navigation.popTo('Home'); else navigation.navigate('Services') } }}
        style={({ pressed }) => [styles.item, active === route && styles.selected, pressed && styles.pressed]}>
        <Text accessible={false} style={[styles.icon, active === route && styles.active]}>{icon}</Text>
        <Text style={[styles.label, active === route && styles.active]}>{label}</Text>
      </Pressable>
    ))}
  </View>
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas, paddingHorizontal: 16, paddingVertical: 8, gap: 12 },
  item: { flex: 1, minHeight: 56, padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  selected: { backgroundColor: colors.soft }, icon: { fontSize: 24, color: colors.muted },
  label: { fontSize: 12, color: colors.muted, fontWeight: '600', textAlign: 'center' },
  active: { color: colors.copper }, pressed: { opacity: 0.7 },
})
