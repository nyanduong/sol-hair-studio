import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors, displayFont } from '../theme/tokens.js'

export default function FeatureUnavailableModal({ feature, onClose }) {
  return (
    <Modal visible={Boolean(feature)} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={styles.dialog} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.icon}><Feather name="clock" size={28} color={colors.copper} /></View>
            <Text accessibilityRole="header" style={styles.title}>Tính năng đang phát triển</Text>
            <Text style={styles.description}>{feature} chưa khả dụng ở phiên bản hiện tại. Sol sẽ cập nhật tính năng này trong thời gian tới.</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Đã hiểu</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#24211f80' },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '100%', alignSelf: 'center', backgroundColor: colors.canvas, borderRadius: 24, overflow: 'hidden' },
  content: { padding: 24, alignItems: 'center' },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: displayFont, fontSize: 25, color: colors.ink, textAlign: 'center', marginTop: 18 },
  description: { fontSize: 15, lineHeight: 23, color: colors.muted, textAlign: 'center', marginTop: 12 },
  button: { minHeight: 48, width: '100%', padding: 14, borderRadius: 28, backgroundColor: colors.copper, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { color: colors.surface, fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.75 },
})
