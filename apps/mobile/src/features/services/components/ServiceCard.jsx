import { useState } from 'react'
import { Image, Text, View } from 'react-native'
import styles from '../styles/ServiceCard.styles.js'

const currencyFormatter = new Intl.NumberFormat('vi-VN')

export default function ServiceCard({ service }) {
  const [failedImageUrl, setFailedImageUrl] = useState(null)
  const { min, max } = service.durationMinutes

  return (
    <View style={styles.card}>
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
          <Text style={styles.price}>{currencyFormatter.format(service.priceVnd)}đ</Text>
          <Text style={styles.duration}>
            {min === max ? min : `${min}–${max}`} phút
          </Text>
        </View>
      </View>
    </View>
  )
}
