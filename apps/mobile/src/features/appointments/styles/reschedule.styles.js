import { StyleSheet } from 'react-native'
import { colors, displayFont } from '../../../theme/tokens.js'

export const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 36,
    gap: 16,
  },

  // Service Banner
  serviceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  serviceIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#f5ebe6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceBannerInfo: { flex: 1 },
  serviceTag: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.copper,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  serviceBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 2,
  },
  serviceBannerMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Sections
  section: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionHint: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },

  // Stylist Cards
  stylistOption: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surface,
  },
  stylistOptionSelected: {
    borderColor: colors.copper,
    backgroundColor: '#fbf9f5',
  },
  stylistOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#b8aca2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: colors.copper,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.copper,
  },
  stylistOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  stylistContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingLeft: 28,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f0e8dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.copper,
  },
  stylistName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  stylistDesc: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  otherStylistsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingLeft: 28,
  },
  otherStylistChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  otherStylistChipSelected: {
    borderColor: colors.copper,
    backgroundColor: colors.soft,
  },
  otherStylistChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
  },
  otherStylistChipTextSelected: {
    color: colors.copper,
  },

  // Date Navigation
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  monthTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navArrow: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 7-day strip
  datesRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  dateCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  dateCardSelected: {
    backgroundColor: colors.copper,
    borderColor: colors.copper,
  },
  dateWeekday: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
  },
  dateWeekdaySelected: {
    color: '#ffffff',
    opacity: 0.85,
  },
  dateNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 2,
    marginBottom: 2,
  },
  dateNumberSelected: {
    color: '#ffffff',
  },
  dateDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },

  // Slots Legend & Grid
  slotsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  slotsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: colors.muted,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotCard: {
    width: '48.5%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotCardSelected: {
    backgroundColor: colors.copper,
    borderColor: colors.copper,
  },
  slotCardCurrent: {
    backgroundColor: colors.soft,
    borderColor: colors.border,
    opacity: 0.6,
  },
  slotTimeText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  slotTimeTextSelected: {
    color: '#ffffff',
  },
  slotStatusText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.muted,
    marginTop: 3,
  },
  slotStatusTextSelected: {
    color: '#fdf3ed',
  },
  emptySlotsBox: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.soft,
    alignItems: 'center',
  },
  emptySlotsText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },

  // Summary Card
  summaryCard: {
    backgroundColor: '#fbf9f5',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.copper,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'right',
    flex: 1,
  },
  summaryValueHighlight: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.copper,
    textAlign: 'right',
    flex: 1,
  },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  message: {
    color: colors.copper,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },

  // Action Buttons
  primaryBtn: {
    minHeight: 48,
    backgroundColor: colors.copper,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    minHeight: 46,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },

  // ==================== SUCCESS SCREEN ====================
  successContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 20,
  },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ecfdf5',
    borderWidth: 2,
    borderColor: '#a7f3d0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successHeader: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  successTitle: {
    fontFamily: displayFont,
    fontSize: 26,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  successCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  successCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  successCodeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  successCodeValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.copper,
  },
  successItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  successItemIcon: {
    marginTop: 2,
  },
  successItemContent: { flex: 1 },
  successItemLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  successItemValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    marginTop: 2,
  },
  successItemValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.copper,
    marginTop: 2,
  },
  successActions: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
})
