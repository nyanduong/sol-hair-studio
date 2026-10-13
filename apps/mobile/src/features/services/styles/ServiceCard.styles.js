import { StyleSheet } from 'react-native'

export default StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e5dcd1',
    padding: 12,
  },
  image: {
    width: '100%',
    aspectRatio: 1.55,
    borderRadius: 14,
    backgroundColor: '#ede6dc',
  },
  imageFallback: {
    aspectRatio: 1.55,
    borderRadius: 14,
    backgroundColor: '#ede6dc',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  imageFallbackText: {
    color: '#716d69',
    textAlign: 'center',
  },
  content: {
    padding: 8,
    paddingTop: 16,
  },
  category: {
    color: '#8d4939',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  name: {
    color: '#22201f',
    fontSize: 25,
    fontWeight: '600',
    marginBottom: 10,
  },
  description: {
    color: '#716d69',
    fontSize: 15,
    lineHeight: 23,
  },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 18,
  },
  price: {
    color: '#8d4939',
    fontSize: 18,
    fontWeight: '700',
  },
  duration: {
    color: '#716d69',
    fontSize: 14,
  },
})
