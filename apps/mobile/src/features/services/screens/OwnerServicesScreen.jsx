import { useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import { colors } from '../../../theme/tokens.js'
import { useAuth } from '../../auth/hooks/useAuth.js'
import OwnerServiceCard from '../components/OwnerServiceCard.jsx'
import OwnerServiceFormModal from '../components/OwnerServiceFormModal.jsx'
import { useOwnerServices } from '../hooks/useOwnerServices.js'
import { styles } from '../styles/OwnerServicesScreen.styles.js'

export default function OwnerServicesScreen({ navigation }) {
  const { account, isAuthenticated, isLoading: authLoading, token } = useAuth()
  const isOwner = Boolean(account?.roles?.includes('owner'))

  const {
    actionError,
    actionLoading,
    actionSuccess,
    categories,
    clearActionFeedback,
    error,
    filteredServices,
    loading,
    refresh,
    refreshing,
    reload,
    saveService,
    searchQuery,
    selectedCategory,
    setSearchQuery,
    setSelectedCategory,
    stats,
    toggleActive,
  } = useOwnerServices(token)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingService, setEditingService] = useState(null)

  // 1. Loading auth state
  if (authLoading) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.copper} />
          <Text style={styles.subtitle}>Đang kiểm tra quyền truy cập…</Text>
        </View>
      </SafeAreaView>
    )
  }

  // 2. Chặn truy cập nếu chưa đăng nhập hoặc không phải chủ tiệm
  if (!isAuthenticated || !isOwner) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
        <View style={styles.center}>
          <Feather name="shield-off" size={48} color={colors.copper} />
          <Text accessibilityRole="alert" style={styles.gateTitle}>
            Không có quyền truy cập
          </Text>
          <Text style={styles.gateCopy}>
            Khu vực Quản lý dịch vụ &amp; hình ảnh chỉ dành riêng cho tài khoản có vai trò Chủ tiệm (Owner).
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (!isAuthenticated) {
                navigation.navigate('Login', {
                  notice: 'Vui lòng đăng nhập bằng tài khoản chủ tiệm.',
                })
              } else {
                navigation.navigate('Home')
              }
            }}
            style={styles.gateButton}
          >
            <Text style={styles.gateButtonText}>
              {!isAuthenticated ? 'Đăng nhập ngay' : 'Về trang chủ'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  function handleOpenCreate() {
    clearActionFeedback()
    setEditingService(null)
    setModalOpen(true)
  }

  function handleOpenEdit(service) {
    clearActionFeedback()
    setEditingService(service)
    setModalOpen(true)
  }

  return (
    <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={18} color={colors.ink} />
            <Text style={styles.backButtonText}>Quay lại</Text>
          </Pressable>
          <Text style={styles.brand}>SOL HAIR STUDIO · CHỦ TIỆM</Text>
        </View>

        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>
            Quản lý dịch vụ
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Thêm dịch vụ mới"
            onPress={handleOpenCreate}
            style={styles.addButton}
          >
            <Feather name="plus" size={16} color={colors.surface} />
            <Text style={styles.addButtonText}>Thêm mới</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Cấu hình danh mục dịch vụ, thời lượng và ảnh hiển thị.
        </Text>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>TỔNG CỘNG</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#047857' }]}>{stats.activeCount}</Text>
          <Text style={styles.statLabel}>ĐANG HIỆN</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#6b7280' }]}>{stats.inactiveCount}</Text>
          <Text style={styles.statLabel}>ĐÃ ẨN</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Feather name="search" size={16} color={colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Tìm theo tên dịch vụ, ID..."
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')}>
              <Feather name="x-circle" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Category Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {categories.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => setSelectedCategory(cat)}
            style={[styles.catChip, selectedCategory === cat && styles.catChipActive]}
          >
            <Text
              style={[
                styles.catChipText,
                selectedCategory === cat && styles.catChipTextActive,
              ]}
            >
              {cat}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Action Feedbacks */}
      {actionSuccess ? (
        <View style={[styles.feedbackBanner, styles.feedbackBannerSuccess]}>
          <Text style={styles.feedbackTextSuccess}>✓ {actionSuccess}</Text>
        </View>
      ) : null}

      {actionError ? (
        <View style={[styles.feedbackBanner, styles.feedbackBannerError]}>
          <Text style={styles.feedbackTextError}>✕ {actionError}</Text>
        </View>
      ) : null}

      {/* Main List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.copper} />
          <Text style={styles.subtitle}>Đang tải danh sách dịch vụ…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text accessibilityRole="alert" style={styles.feedbackTextError}>
            {error}
          </Text>
          <Pressable onPress={reload} style={styles.gateButton}>
            <Text style={styles.gateButtonText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredServices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OwnerServiceCard
              service={item}
              onEdit={handleOpenEdit}
              onToggleActive={toggleActive}
              isActionLoading={actionLoading}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.copper]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="inbox" size={36} color={colors.muted} />
              <Text style={styles.emptyTitle}>Không có dịch vụ phù hợp</Text>
              <Text style={styles.emptySubtitle}>
                Thử đổi từ khóa tìm kiếm hoặc bấm &ldquo;Thêm mới&rdquo; để tạo dịch vụ.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal Form Thêm / Sửa */}
      <OwnerServiceFormModal
        isOpen={modalOpen}
        service={editingService}
        categories={categories}
        onClose={() => setModalOpen(false)}
        onSave={saveService}
      />
    </SafeAreaView>
  )
}

