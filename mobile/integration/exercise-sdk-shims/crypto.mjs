import { createHash } from 'node:crypto'
export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' }
export const digestStringAsync = async (_algorithm, text) => createHash('sha256').update(text, 'utf8').digest('hex')
