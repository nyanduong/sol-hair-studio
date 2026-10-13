import { FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native'
import ServiceCard from './ServiceCard.jsx'
import ServicesStatus from './ServicesStatus.jsx'
import { useServices } from '../hooks/useServices.js'
import { serviceColumns } from '../service-presentation.js'
import styles from '../styles/ServicesScreen.styles.js'

export default function ServicesList({ navigation, header, footer, showToolbar = true }) {
  const { state, retry } = useServices()
  const { width, fontScale } = useWindowDimensions()
  const columns = serviceColumns(width, fontScale)
  const services = state.kind === 'success' ? state.data : []
  const isLoading = state.kind === 'loading'

  function renderService({ item, index }) {
    // Reserve the missing gap so the odd final card matches the complete rows.
    const isOddLastCard = columns === 2 && services.length % 2 === 1 && index === services.length - 1
    return (
      <View style={{ flex: 1 / columns, minWidth: 0, marginRight: isOddLastCard ? 12 : 0 }}>
        <ServiceCard service={item} />
      </View>
    )
  }

  return <FlatList
    key={columns} numColumns={columns} data={services}
    keyExtractor={service => service.id}
    renderItem={renderService}
    columnWrapperStyle={columns === 2 ? { gap: 12 } : undefined}
    ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
    contentContainerStyle={styles.container}
    refreshing={isLoading} onRefresh={retry}
    ListHeaderComponent={<View>{header}{showToolbar && <View style={styles.toolbar}>
      <Text style={styles.count}>{state.kind === 'success' ? `${services.length} dịch vụ` : 'Danh mục dịch vụ'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tải lại danh mục dịch vụ"
        accessibilityState={{ disabled: isLoading }}
        disabled={isLoading}
        onPress={retry}
        style={({ pressed }) => [styles.reloadButton, pressed && styles.pressed, isLoading && styles.disabled]}
      >
        <Text style={styles.reloadText}>Tải lại</Text>
      </Pressable>
    </View>}</View>}
    ListEmptyComponent={<ServicesStatus state={state} onRetry={retry} />}
    ListFooterComponent={<View>
      {footer}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Health')}
        style={({ pressed }) => [styles.healthButton, pressed && styles.pressed]}
      >
        <Text style={styles.healthText}>Kiểm tra kết nối</Text>
      </Pressable>
    </View>}
  />
}
