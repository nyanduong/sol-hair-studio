import { memo, useState } from 'react'
import { Image, Pressable, Text, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { formatDuration, formatPrice } from '../service-presentation.js'
import { styles } from '../styles/OwnerServiceCard.styles.js'

function OwnerServiceCard({ service, onEdit, onToggleActive, isActionLoading }) {
  const [imgFailed, setImgFailed] = useState(false)

  const isActive = Boolean(service?.isActive)
  const durationText = formatDuration(service?.durationMinutes)
  const priceText = formatPrice(service?.priceVnd)
  const bookingDuration = service?.bookingDurationMinutes ?? service?.durationMinutes?.max ?? 45

  return (
    <View style={[styles.card, !isActive && styles.cardInactive]}>
      <View style={styles.mainRow}>
        {/* Image thumbnail */}
        {service?.imageUrl && !imgFailed ? (
          <Image
            source={{ uri: service.imageUrl }}
            style={styles.thumbnail}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={styles.thumbnailFallback}>
            <Feather name="image" size={20} color={colors.muted} />
            <Text style={styles.thumbnailFallbackText}>Chưa có ảnh</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{service?.category || 'Dịch vụ'}</Text>
          </View>

          <Text style={styles.name} numberOfLines={1}>
            {service?.name}
          </Text>

          <Text style={styles.idText}>ID: {service?.id}</Text>
        </View>

        {/* Status badge */}
        <View
          style={[
            styles.statusBadge,
            isActive ? styles.statusBadgeActive : styles.statusBadgeInactive,
          ]}
        >
          <View
            style={[
              styles.statusDot,
              isActive ? styles.statusDotActive : styles.statusDotInactive,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              isActive ? styles.statusTextActive : styles.statusTextInactive,
            ]}
          >
            {isActive ? 'Hiển thị' : 'Đã ẩn'}
          </Text>
        </View>
      </View>

      {/* Metrics: Price & Durations */}
      <View style={styles.metricsRow}>
        <Text style={styles.price}>{priceText}</Text>
        <View style={styles.metricItem}>
          <Feather name="clock" size={13} color={colors.muted} />
          <Text style={styles.metricText}>{durationText}</Text>
        </View>
        <View style={styles.metricItem}>
          <Feather name="calendar" size={13} color={colors.muted} />
          <Text style={styles.metricText}>{bookingDuration}p đặt lịch</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sửa dịch vụ ${service?.name}`}
          disabled={isActionLoading}
          onPress={() => onEdit(service)}
          style={styles.editButton}
        >
          <Feather name="edit-2" size={13} color={colors.ink} />
          <Text style={styles.editButtonText}>Sửa</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${isActive ? 'Ẩn' : 'Hiện'} dịch vụ ${service?.name}`}
          disabled={isActionLoading}
          onPress={() => onToggleActive(service)}
          style={[
            styles.toggleButton,
            isActive ? styles.toggleButtonHide : styles.toggleButtonShow,
          ]}
        >
          <Feather
            name={isActive ? 'eye-off' : 'eye'}
            size={13}
            color={isActive ? '#be123c' : '#15803d'}
          />
          <Text
            style={isActive ? styles.toggleButtonTextHide : styles.toggleButtonTextShow}
          >
            {isActive ? 'Ẩn dịch vụ' : 'Hiện công khai'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

export default memo(OwnerServiceCard)

