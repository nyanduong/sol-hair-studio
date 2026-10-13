import { StatusBar } from 'expo-status-bar'
import { FlatList, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ServiceCard from '../components/ServiceCard.jsx'
import ServicesStatus from '../components/ServicesStatus.jsx'
import { useServices } from '../hooks/useServices.js'
import styles from '../styles/ServicesScreen.styles.js'

export default function ServicesScreen({ navigation }) {
  const { state, retry } = useServices()
  const services = state.kind === 'success' ? state.data : []
  const isLoading = state.kind === 'loading'

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      <FlatList
        data={services}
        keyExtractor={(service) => service.id}
        renderItem={({ item }) => <ServiceCard service={item} />}
        contentContainerStyle={styles.container}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.brand}>SOL HAIR STUDIO</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Dành một chút{'\n'}cho chính mình.
            </Text>
            <Text style={styles.intro}>
              Khám phá dịch vụ chăm sóc tóc, chọn phong cách phù hợp với bạn.
            </Text>
            <View style={styles.toolbar}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Dịch vụ của Sol
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tải lại danh mục dịch vụ"
                accessibilityState={{ disabled: isLoading }}
                disabled={isLoading}
                onPress={retry}
                style={({ pressed }) => [
                  styles.reloadButton,
                  pressed && styles.pressed,
                  isLoading && styles.disabled,
                ]}
              >
                <Text style={styles.reloadText}>Tải lại</Text>
              </Pressable>
            </View>
            {state.kind === 'success' && services.length > 0 && (
              <Text style={styles.count}>{services.length} dịch vụ dành cho bạn</Text>
            )}
          </View>
        }
        ListEmptyComponent={<ServicesStatus state={state} onRetry={retry} />}
        ListFooterComponent={
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Health')}
            style={({ pressed }) => [styles.healthButton, pressed && styles.pressed]}
          >
            <Text style={styles.healthText}>Kiểm tra kết nối</Text>
          </Pressable>
        }
      />
      <StatusBar style="dark" />
    </SafeAreaView>
  )
}
