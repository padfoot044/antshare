import { Injectable } from '@angular/core';

export interface EncryptedChunk {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

/**
 * Thrown when the Web Crypto API is unavailable. The most common real-world
 * cause is opening the app over an insecure origin (e.g. http://192.168.x.x on
 * an iPhone): Safari only exposes `crypto.subtle` in a secure context, so the
 * whole handshake silently dies. We turn that into an actionable message.
 */
export class InsecureContextError extends Error {
  constructor() {
    super(
      'Secure cryptography is unavailable. Open AntShare over HTTPS (or localhost). ' +
        'On iPhone/iPad, Safari blocks end-to-end encryption on plain-http addresses.'
    );
    this.name = 'InsecureContextError';
  }
}

// Curated, visually-distinct emoji alphabet for the verification code. 32 entries
// so each consumes exactly 5 bits and renders identically across platforms.
const EMOJI_ALPHABET = [
  '🐜', '🔒', '🌊', '⚡', '🔥', '🌙', '⭐', '🍀',
  '🎯', '🚀', '🛡️', '🔑', '🎲', '🧊', '🌈', '🦊',
  '🐢', '🐝', '🦉', '🌵', '🍋', '🍒', '🎈', '🧩',
  '🎵', '🏔️', '🌻', '🪐', '🦋', '🐙', '🌴', '💎',
];

@Injectable({ providedIn: 'root' })
export class CryptoChunkService {
  /** Guard used by every entry point so failures surface clearly and early. */
  ensureSecureCrypto(): void {
    const secure = typeof window === 'undefined' ? true : window.isSecureContext;
    if (!secure || typeof crypto === 'undefined' || !crypto.subtle) {
      throw new InsecureContextError();
    }
  }

  async createFileKey(): Promise<CryptoKey> {
    this.ensureSecureCrypto();
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async encryptChunk(key: CryptoKey, bytes: ArrayBuffer): Promise<EncryptedChunk> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { iv: iv.buffer, ciphertext: ciphertextBuffer };
  }

  async decryptChunk(key: CryptoKey, iv: ArrayBuffer, ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  }

  async createRsaKeyPair(): Promise<CryptoKeyPair> {
    this.ensureSecureCrypto();
    return crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
  }

  async exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    return this.toBase64(spki);
  }

  async importPublicKey(base64: string): Promise<CryptoKey> {
    this.ensureSecureCrypto();
    // Pass a fresh ArrayBuffer (not a typed-array view) — older WebKit builds are
    // picky about BufferSource subtypes in importKey.
    const bytes = this.fromBase64(base64);
    return crypto.subtle.importKey(
      'spki',
      bytes,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt', 'wrapKey']
    );
  }

  async wrapFileKey(fileKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
    const wrapped = await crypto.subtle.wrapKey('raw', fileKey, publicKey, { name: 'RSA-OAEP' });
    return this.toBase64(wrapped);
  }

  async unwrapFileKey(wrappedFileKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
    const wrapped = this.fromBase64(wrappedFileKeyBase64);
    return crypto.subtle.unwrapKey(
      'raw',
      wrapped,
      privateKey,
      { name: 'RSA-OAEP' },
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt']
    );
  }

  /**
   * Derive a short, human-comparable verification code from the exchanged key
   * material. Both peers feed it the same two base64 values, so the codes match
   * only when no relay has tampered with the public key or wrapped key. Compared
   * out-of-band (voice/visual), this defeats a man-in-the-middle on the signaler.
   */
  async deriveVerificationCode(publicKeyBase64: string, wrappedFileKeyBase64: string): Promise<string> {
    const data = new TextEncoder().encode(`${publicKeyBase64}|${wrappedFileKeyBase64}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));

    // Four emojis (20 bits) for memorability + four hex chars for precision.
    const emojis = [0, 1, 2, 3].map((i) => EMOJI_ALPHABET[digest[i] & 0x1f]).join(' ');
    const hex = Array.from(digest.slice(4, 6))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    return `${emojis} · ${hex}`;
  }

  private toBase64(value: ArrayBuffer): string {
    const bytes = new Uint8Array(value);
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }

  private fromBase64(value: string): ArrayBuffer {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0)).buffer;
  }
}
