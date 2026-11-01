import { randomBytes } from 'node:crypto'

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
export function generateBookingReference() {
  return 'SOL-' + [...randomBytes(8)].map((byte) => alphabet[byte % 32]).join('')
}
