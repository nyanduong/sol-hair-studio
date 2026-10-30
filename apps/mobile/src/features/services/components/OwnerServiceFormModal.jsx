import { useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { slugify } from '../service-presentation.js'
import { styles } from '../styles/OwnerServiceFormModal.styles.js'

const DEFAULT_CATEGORIES = [
  'Cắt & Tạo kiểu',
  'Uốn & Nhuộm',
  'Chăm sóc & Phục hồi',
  'Gội đầu & Massage',
]

function ServiceFormInner({ service, categories, onClose, onSave }) {
  const isUpdate = Boolean(service?.id)

  const [name, setName] = useState(() => service?.name || '')
  const [id, setId] = useState(() => service?.id || '')
  const [idTouched, setIdTouched] = useState(() => Boolean(service?.id))
  const [category, setCategory] = useState(
    () => service?.category || categories.find((c) => c !== 'Tất cả') || DEFAULT_CATEGORIES[0],
  )
  const [priceVnd, setPriceVnd] = useState(() => String(service?.priceVnd ?? 150000))
  const [durationMin, setDurationMin] = useState(() => {
    const dur = service?.durationMinutes
    if (typeof dur === 'object' && dur !== null) return dur.min ?? 30
    if (typeof dur === 'number') return dur
    return 30
  })
  const [durationMax, setDurationMax] = useState(() => {
    const dur = service?.durationMinutes
    if (typeof dur === 'object' && dur !== null) return dur.max ?? 45
    if (typeof dur === 'number') return dur
    return 45
  })
  const [bookingDurationMinutes, setBookingDurationMinutes] = useState(
    () => service?.bookingDurationMinutes ?? 45,
  )
  const [description, setDescription] = useState(() => service?.description || '')
  const [imageUrl, setImageUrl] = useState(
    () =>
      service?.imageUrl ||
      'https://res.cloudinary.com/dqc4hufot/image/upload/v1729864500/sample.jpg',
  )
  const [isActive, setIsActive] = useState(() => service?.isActive ?? true)
  const [validationError, setValidationError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleNameChange(val) {
    setName(val)
    if (!isUpdate && !idTouched) {
      setId(slugify(val))
    }
  }

  function handleDurationMinChange(text) {
    const val = parseInt(text.replace(/[^0-9]/g, ''), 10) || 1
    setDurationMin(val)
    if (durationMax < val) setDurationMax(val)
    if (bookingDurationMinutes < val) setBookingDurationMinutes(val)
  }

  function handleDurationMaxChange(text) {
    const val = parseInt(text.replace(/[^0-9]/g, ''), 10) || 1
    setDurationMax(val)
    if (bookingDurationMinutes > val) setBookingDurationMinutes(val)
  }

  function handleBookingDurationChange(text) {
    const val = parseInt(text.replace(/[^0-9]/g, ''), 10) || 1
    setBookingDurationMinutes(val)
  }

  async function handleSubmit() {
    setValidationError('')

    const trimmedName = name.trim()
    const trimmedId = id.trim()
    const trimmedCat = category.trim()

    if (!trimmedName) {
      setValidationError('Vui lòng nhập tên dịch vụ.')
      return
    }

    if (!isUpdate) {
      if (!trimmedId) {
        setValidationError('Vui lòng nhập mã định danh (ID) dịch vụ.')
        return
      }
      if (!/^[a-z0-9-]+$/.test(trimmedId)) {
        setValidationError('Mã ID chỉ được chứa chữ thường không dấu, số và dấu gạch ngang.')
        return
      }
    }

    if (!trimmedCat) {
      setValidationError('Vui lòng chọn hoặc nhập danh mục dịch vụ.')
      return
    }

    const price = Number(priceVnd)
    if (isNaN(price) || price < 0 || price > 100_000_000) {
      setValidationError('Giá tiền phải là số hợp lệ từ 0 đến 100.000.000 VNĐ.')
      return
    }

    const dMin = Number(durationMin)
    const dMax = Number(durationMax)
    if (dMin < 1 || dMax < 1 || dMin > dMax || dMax > 480) {
      setValidationError('Thời lượng phải từ 1 đến 480 phút và thời lượng tối thiểu ≤ tối đa.')
      return
    }

    const bDur = Number(bookingDurationMinutes)
    if (bDur < dMin || bDur > dMax) {
      setValidationError(
        `Thời lượng đặt lịch (${bDur}p) phải nằm trong khoảng thời lượng (${dMin}p - ${dMax}p).`,
      )
      return
    }

    const trimmedImg = imageUrl.trim()
    if (!trimmedImg) {
      setValidationError('Vui lòng cung cấp URL ảnh Cloudinary cho dịch vụ.')
      return
    }
    if (!trimmedImg.startsWith('https://res.cloudinary.com/')) {
      setValidationError('URL ảnh phải bắt đầu bằng https://res.cloudinary.com/')
      return
    }

    const payload = {
      name: trimmedName,
      category: trimmedCat,
      priceVnd: price,
      durationMinutes: { min: dMin, max: dMax },
      bookingDurationMinutes: bDur,
      description: description.trim(),
      isActive,
      imageUrl: trimmedImg,
    }

    if (!isUpdate) {
      payload.id = trimmedId
    } else {
      payload.id = service.id
    }

    setIsSubmitting(true)
    const result = await onSave(payload, isUpdate)
    setIsSubmitting(false)

    if (result?.success) {
      onClose()
    } else if (result?.error) {
      setValidationError(result.error)
    }
  }

  const allCategorySuggestions = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...categories.filter((c) => c !== 'Tất cả')]),
  )

  return (
    <View style={styles.overlay}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheet}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtitle}>
              {isUpdate ? 'CHỈNH SỬA DỊCH VỤ' : 'THÊM DỊCH VỤ'}
            </Text>
            <Text style={styles.headerTitle}>
              {isUpdate ? `Sửa: ${service?.name}` : 'Tạo dịch vụ mới'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng modal"
            onPress={onClose}
            disabled={isSubmitting}
            style={styles.closeButton}
          >
            <Feather name="x" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          {/* Error Banner */}
          {validationError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{validationError}</Text>
            </View>
          ) : null}

          {/* Tên dịch vụ */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Tên dịch vụ <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={name}
              onChangeText={handleNameChange}
              placeholder="Ví dụ: Cắt tạo kiểu layer nữ"
              placeholderTextColor={colors.muted}
              editable={!isSubmitting}
              style={styles.input}
            />
          </View>

          {/* Mã ID */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Mã định danh (ID) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={id}
              onChangeText={(val) => {
                setId(val)
                setIdTouched(true)
              }}
              placeholder="cat-tao-kieu-layer"
              placeholderTextColor={colors.muted}
              editable={!isUpdate && !isSubmitting}
              autoCapitalize="none"
              style={[styles.input, isUpdate && styles.inputDisabled]}
            />
            <Text style={styles.helperText}>
              {isUpdate
                ? 'Mã ID dịch vụ cố định không được phép thay đổi.'
                : 'Mã định danh duy nhất (chữ thường không dấu, số, gạch ngang).'}
            </Text>
          </View>

          {/* Danh mục */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Danh mục <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              placeholder="Chọn hoặc nhập danh mục"
              placeholderTextColor={colors.muted}
              editable={!isSubmitting}
              style={styles.input}
            />
            <View style={styles.chipsRow}>
              {allCategorySuggestions.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[styles.chip, category === cat && styles.chipActive]}
                >
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Giá tiền */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Giá dịch vụ (VNĐ) <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              value={priceVnd}
              onChangeText={setPriceVnd}
              keyboardType="numeric"
              placeholder="150000"
              placeholderTextColor={colors.muted}
              editable={!isSubmitting}
              style={styles.input}
            />
          </View>

          {/* Cấu hình thời lượng */}
          <View style={styles.durationCard}>
            <Text style={styles.durationTitle}>Cấu hình thời lượng (Phút)</Text>
            <View style={styles.durationRow}>
              <View style={styles.durationCol}>
                <Text style={styles.durationLabel}>Tối thiểu</Text>
                <TextInput
                  value={String(durationMin)}
                  onChangeText={handleDurationMinChange}
                  keyboardType="number-pad"
                  editable={!isSubmitting}
                  style={styles.durationInput}
                />
              </View>

              <View style={styles.durationCol}>
                <Text style={styles.durationLabel}>Tối đa</Text>
                <TextInput
                  value={String(durationMax)}
                  onChangeText={handleDurationMaxChange}
                  keyboardType="number-pad"
                  editable={!isSubmitting}
                  style={styles.durationInput}
                />
              </View>

              <View style={styles.durationCol}>
                <Text style={styles.durationLabel}>Vào lịch</Text>
                <TextInput
                  value={String(bookingDurationMinutes)}
                  onChangeText={handleBookingDurationChange}
                  keyboardType="number-pad"
                  editable={!isSubmitting}
                  style={styles.durationInput}
                />
              </View>
            </View>
            <Text style={styles.helperText}>
              Thời lượng vào lịch ({bookingDurationMinutes}p) sẽ chiếm chỗ trên lịch của Stylist khi khách đặt.
            </Text>
          </View>

          {/* Mô tả */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Mô tả chi tiết</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Quy trình gồm gội, tạo kiểu chuẩn form, tư vấn sản phẩm chăm sóc..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              editable={!isSubmitting}
              style={[styles.input, styles.textArea]}
            />
          </View>

          {/* Ảnh đại diện Cloudinary */}
          <View style={styles.imageCard}>
            <Text style={styles.label}>
              Ảnh đại diện dịch vụ (Cloudinary) <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.imagePreviewRow}>
              {imageUrl && imageUrl.startsWith('https://res.cloudinary.com/') ? (
                <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePreviewFallback}>
                  <Feather name="image" size={18} color={colors.muted} />
                  <Text style={styles.imagePreviewFallbackText}>Chưa có ảnh</Text>
                </View>
              )}
              <View style={{ flex: 1, gap: 4 }}>
                <TextInput
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  placeholder="https://res.cloudinary.com/..."
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  editable={!isSubmitting}
                  style={[styles.input, { fontSize: 12, paddingVertical: 8 }]}
                />
              </View>
            </View>
            <Text style={styles.helperText}>
              Đường link ảnh phải bắt đầu bằng https://res.cloudinary.com/
            </Text>
          </View>

          {/* Công tắc hiển thị */}
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchTitle}>Hiển thị cho khách hàng</Text>
              <Text style={styles.switchSubtitle}>
                {isActive
                  ? 'Dịch vụ đang xuất hiện công khai trên bảng giá và trang đặt lịch.'
                  : 'Dịch vụ đang ẩn đối với khách hàng (chỉ quản trị viên thấy).'}
              </Text>
            </View>
            <Switch
              value={isActive}
              onValueChange={setIsActive}
              disabled={isSubmitting}
              trackColor={{ false: '#d1d5db', true: '#bbf7d0' }}
              thumbColor={isActive ? '#059669' : '#9ca3af'}
            />
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.actionsFooter}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            disabled={isSubmitting}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelButtonText}>Hủy</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.submitButtonText}>
                {isUpdate ? 'Cập nhật dịch vụ' : 'Lưu dịch vụ mới'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

export default function OwnerServiceFormModal({
  isOpen,
  service,
  categories = [],
  onClose,
  onSave,
}) {
  if (!isOpen) return null

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
      <ServiceFormInner
        key={service?.id || 'new'}
        service={service}
        categories={categories}
        onClose={onClose}
        onSave={onSave}
      />
    </Modal>
  )
}
