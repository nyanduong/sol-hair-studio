import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  authRevision: { type: Number, required: true, validate: Number.isSafeInteger, min: 0 },
  tokenDigest: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'auth_sessions' })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const AuthSessionModel = mongoose.models.AuthSession ?? mongoose.model('AuthSession', schema)
