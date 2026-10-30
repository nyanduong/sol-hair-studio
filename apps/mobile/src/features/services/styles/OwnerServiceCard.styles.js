import { Platform, StyleSheet } from 'react-native'
import { colors, displayFont } from '../../../theme/tokens.js'

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardInactive: {
    opacity: 0.75,
    backgroundColor: '#faf8f5',
  },
  mainRow: {
    flexDirection: 'row',
    gap: 12,
  },
  thumbnail: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.soft,
  },
  thumbnailFallback: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailFallbackText: {
    fontSize: 10,
    color: colors.muted,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.soft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.copper,
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 16,
    fontFamily: displayFont,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  idText: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: Platform?.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusBadgeActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusBadgeInactive: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: {
    backgroundColor: '#059669',
  },
  statusDotInactive: {
    backgroundColor: '#9ca3af',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#047857',
  },
  statusTextInactive: {
    color: '#6b7280',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1ede7',
  },
  price: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.copper,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: 12,
    color: colors.muted,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  toggleButtonHide: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  toggleButtonShow: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  toggleButtonTextHide: {
    fontSize: 12,
    fontWeight: '600',
    color: '#be123c',
  },
  toggleButtonTextShow: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
})

