// Smoke test que reproduz exatamente o algoritmo de `src/lib/es3-crypto.ts`
// usando o Web Crypto API embutido no Node 22+ (mesma API do browser).
// Garante que:
//   1. O `MetaSave.es3` real do workspace e' descriptografado corretamente.
//   2. O round-trip (decrypt -> JSON.parse -> JSON.stringify -> encrypt -> decrypt)
//      retorna o mesmo objeto.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ENCRYPTION_KEY =
  "Why would you want to cheat?... :o It's no fun. :') :'D"

const IV_SIZE = 16
const PBKDF2_ITERATIONS = 100

async function deriveAesKey(password, iv, usage) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: iv, iterations: PBKDF2_ITERATIONS, hash: 'SHA-1' },
    baseKey,
    { name: 'AES-CBC', length: 128 },
    false,
    [usage],
  )
}

async function decryptEs3(data) {
  const iv = data.slice(0, IV_SIZE)
  const ct = data.slice(IV_SIZE)
  const key = await deriveAesKey(ENCRYPTION_KEY, iv, 'decrypt')
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ct)
  const plain = new Uint8Array(plainBuf)
  if (plain[0] === 0x1f && plain[1] === 0x8b) {
    const stream = new Blob([plain]).stream().pipeThrough(
      new DecompressionStream('gzip'),
    )
    return await new Response(stream).text()
  }
  return new TextDecoder('utf-8').decode(plain)
}

async function encryptEs3(payload) {
  const plain = new TextEncoder().encode(payload)
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE))
  const key = await deriveAesKey(ENCRYPTION_KEY, iv, 'encrypt')
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plain)
  const ct = new Uint8Array(ctBuf)
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0)
  out.set(ct, iv.length)
  return out
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sample = path.resolve(__dirname, '..', 'MetaSave.es3')
const encrypted = await readFile(sample)

const decrypted = await decryptEs3(new Uint8Array(encrypted))
const parsed = JSON.parse(decrypted)
console.log('decrypted length:', decrypted.length)
console.log('cosmeticUnlocks count:', parsed.cosmeticUnlocks.value.length)
console.log('cosmeticHistory count:', parsed.cosmeticHistory.value.length)
console.log('cosmeticEquipped:', parsed.cosmeticEquipped.value.join(', '))

const reEncrypted = await encryptEs3(JSON.stringify(parsed, null, 4))
const decryptedAgain = await decryptEs3(reEncrypted)
const parsedAgain = JSON.parse(decryptedAgain)
if (JSON.stringify(parsed) !== JSON.stringify(parsedAgain)) {
  console.error('round-trip mismatch')
  process.exit(1)
}
console.log('round-trip ok')
