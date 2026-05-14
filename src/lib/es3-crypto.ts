/**
 * Easy Save 3 (`.es3`) format implementation for R.E.P.O., 100% client-side via
 * the Web Crypto API.
 *
 * File layout:
 *   [0..16)  -> random IV (16 bytes)
 *   [16..)   -> AES-128-CBC ciphertext of UTF-8 payload (optionally gzip-compressed)
 *
 * Key derivation (matches `repo-save-editor-deprecated/src/lib/es3-crypto.ts`):
 *   PBKDF2(password = ENCRYPTION_KEY, salt = IV, iters = 100, hash = SHA-1, length = 16 bytes)
 */

import { ENCRYPTION_KEY } from './encryption-key'

const IV_SIZE = 16
const PBKDF2_ITERATIONS = 100
const KEY_SIZE_BITS = 128

async function deriveAesKey(
  password: string,
  iv: Uint8Array,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password)
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: iv as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-1',
    },
    baseKey,
    { name: 'AES-CBC', length: KEY_SIZE_BITS },
    false,
    [usage],
  )
}

function isGzipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

async function gunzipToString(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream('gzip'),
  )
  return await new Response(stream).text()
}

async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new CompressionStream('gzip'),
  )
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Decrypts an `.es3` buffer and returns the JSON as a UTF-8 string.
 *
 * @param data Full binary file contents.
 * @param password Password to use (default: REPO key).
 */
export async function decryptEs3(
  data: Uint8Array,
  password: string = ENCRYPTION_KEY,
): Promise<string> {
  if (data.length <= IV_SIZE) {
    throw new Error('Invalid .es3 file: IV header truncated')
  }
  const iv = data.slice(0, IV_SIZE)
  const cipherText = data.slice(IV_SIZE)
  const key = await deriveAesKey(password, iv, 'decrypt')
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    cipherText as BufferSource,
  )
  const plain = new Uint8Array(plainBuffer)
  if (isGzipMagic(plain)) {
    return await gunzipToString(plain)
  }
  return new TextDecoder('utf-8').decode(plain)
}

/**
 * Encrypts a UTF-8 string (typically JSON) into an `.es3` file buffer.
 *
 * @param payload Plain text to encrypt.
 * @param options.password Password to use (default: REPO key).
 * @param options.gzip If true, gzip-compress before encrypting (default: false).
 */
export async function encryptEs3(
  payload: string,
  options: { password?: string; gzip?: boolean } = {},
): Promise<Uint8Array> {
  const { password = ENCRYPTION_KEY, gzip = false } = options
  let plain: Uint8Array = new TextEncoder().encode(payload)
  if (gzip) {
    plain = await gzipBytes(plain)
  }
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE))
  const key = await deriveAesKey(password, iv, 'encrypt')
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv: iv as BufferSource },
    key,
    plain as BufferSource,
  )
  const cipherText = new Uint8Array(cipherBuffer)
  const out = new Uint8Array(iv.length + cipherText.length)
  out.set(iv, 0)
  out.set(cipherText, iv.length)
  return out
}
