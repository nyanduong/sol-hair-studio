import { useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import styles from '../styles/ServiceCard.styles.js'
import { formatDuration, formatPrice } from '../service-presentation.js'

export default function ServiceCard({ service, onPress }) {
  const [failedImageUrl, setFailedImageUrl] = useState(null)

  const cardContent = (
    <>
      {failedImageUrl === service.imageUrl ? (
        <View style={styles.imageFallback}>
          <Text style={styles.imageFallbackText}>Chưa tải được ảnh dịch vụ</Text>
        </View>
      ) : (
        <Image
          source={{ uri: service.imageUrl }}
          accessibilityLabel={`Ảnh ${service.name}`}
          resizeMode="cover"
          style={styles.image}
          onError={() => setFailedImageUrl(service.imageUrl)}
        />
      )}
      <View style={styles.content}>
        <Text style={styles.category}>{service.category}</Text>
        <Text accessibilityRole="header" style={styles.name}>{service.name}</Text>
        <Text style={styles.description}>{service.description}</Text>
        <View style={styles.details}>
          <Text style={styles.price}>{formatPrice(service.priceVnd)}</Text>
          <Text style={styles.duration}>
            {formatDuration(service.durationMinutes)}
          </Text>
        </View>
      </View>
    </>
  )

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Xem chi tiết dịch vụ ${service.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      >
        {cardContent}
      </Pressable>
    )
  }

  return (
    <View style={styles.card}>
      {cardContent}
    </View>
  )
}
