import { colors, displayFont } from '../../../theme/tokens.js'
import { StyleSheet } from 'react-native'

export default StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  container: {
    flexGrow: 1,
    padding: 16,
    paddingTop: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  header: {
    marginBottom: 20,
  },
  brand: {
    color: colors.copper,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 12,
  },
  title: {
    fontFamily: displayFont,
    color: colors.ink,
    fontSize: 36,
    fontWeight: '600',
    lineHeight: 44,
    letterSpacing: -1,
    marginBottom: 14,
  },
  intro: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  toolbar: {
    marginBottom: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '600',
  },
  reloadButton: {
    minHeight: 44,
    minWidth: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reloadText: {
    color: colors.copper,
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  separator: {
    height: 20,
  },
  status: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
  },
  statusTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  statusDescription: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
  },
  retryButton: {
    minHeight: 48,
    backgroundColor: colors.copper,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  healthButton: {
    minHeight: 48,
    padding: 14,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthText: {
    color: colors.muted,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
})
