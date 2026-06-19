import { Injectable } from '@angular/core';

export interface EncryptedChunk {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

@Injectable({ providedIn: 'root' })
export class CryptoChunkService {
  async createFileKey(): Promise<CryptoKey> {
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
    return btoa(String.fromCharCode(...new Uint8Array(spki)));
  }

  async importPublicKey(base64: string): Promise<CryptoKey> {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
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
    return btoa(String.fromCharCode(...new Uint8Array(wrapped)));
  }

  async unwrapFileKey(wrappedFileKeyBase64: string, privateKey: CryptoKey): Promise<CryptoKey> {
    const wrapped = Uint8Array.from(atob(wrappedFileKeyBase64), (c) => c.charCodeAt(0));
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
}
