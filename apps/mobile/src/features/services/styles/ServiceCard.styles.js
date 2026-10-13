import { colors, displayFont } from '../../../theme/tokens.js'
import { StyleSheet } from 'react-native'

export default StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 7,
  },
  image: {
    width: '100%',
    aspectRatio: 1.55,
    borderRadius: 14,
    backgroundColor: colors.soft,
  },
  imageFallback: {
    aspectRatio: 1.55,
    borderRadius: 14,
    backgroundColor: colors.soft,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imageFallbackText: {
    color: colors.muted,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 5,
    paddingTop: 10,
  },
  category: {
    color: colors.copper,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  name: {
    color: colors.ink,
    fontSize: 22,
    fontFamily: displayFont,
    fontWeight: '600',
    marginBottom: 10,
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 12,
  },
  price: {
    color: colors.copper,
    fontSize: 16,
    fontWeight: '700',
  },
  duration: {
    color: colors.muted,
    fontSize: 12,
  },
})
