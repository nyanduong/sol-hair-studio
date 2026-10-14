import crypto from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(crypto.scrypt)

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 131072 // N; OWASP scrypt minimum with r=8, p=1
const SCRYPT_BLOCKSIZE = 8 // r
const SCRYPT_PARALLELIZATION = 1 // p

export async function hashPassword(password) {
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 128
  ) {
    throw new Error('Mật khẩu phải là chuỗi từ 8 đến 128 ký tự.')
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = await scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCKSIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 256 * 1024 * 1024,
  })

  return `$scrypt$N=${SCRYPT_COST},r=${SCRYPT_BLOCKSIZE},p=${SCRYPT_PARALLELIZATION}$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 128 || typeof hash !== 'string') {
    return false
  }

  const parts = hash.split('$')
  if (parts.length !== 5 || parts[1] !== 'scrypt' || !['N=16384,r=8,p=1', 'N=131072,r=8,p=1'].includes(parts[2]) || !/^[a-f0-9]{32}$/.test(parts[3]) || !/^[a-f0-9]{128}$/.test(parts[4])) {
    return false
  }

  const [, , , salt, storedKeyHex] = parts
  const storedBuffer = Buffer.from(storedKeyHex, 'hex')
  const derivedKey = await scryptAsync(password, salt, storedBuffer.length, {
    N: Number(parts[2].match(/^N=(\d+)/)[1]),
    r: SCRYPT_BLOCKSIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 256 * 1024 * 1024,
  })

  return crypto.timingSafeEqual(storedBuffer, derivedKey)
}
