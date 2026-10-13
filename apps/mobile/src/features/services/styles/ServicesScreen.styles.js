import { StyleSheet } from 'react-native'

export default StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f3ed',
  },
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 28,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: {
    marginBottom: 20,
  },
  brand: {
    color: '#8d4939',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.2,
    marginBottom: 22,
  },
  title: {
    color: '#22201f',
    fontSize: 36,
    fontWeight: '600',
    lineHeight: 44,
    letterSpacing: -1,
    marginBottom: 14,
  },
  intro: {
    color: '#716d69',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 26,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitle: {
    color: '#22201f',
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
    color: '#8d4939',
    fontSize: 14,
    fontWeight: '600',
  },
  count: {
    color: '#716d69',
    fontSize: 13,
    marginTop: 2,
  },
  separator: {
    height: 20,
  },
  status: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5dcd1',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
  },
  statusTitle: {
    color: '#22201f',
    fontSize: 21,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  statusDescription: {
    color: '#716d69',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 10,
  },
  retryButton: {
    minHeight: 48,
    backgroundColor: '#8d4939',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#ffffff',
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
    color: '#716d69',
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
