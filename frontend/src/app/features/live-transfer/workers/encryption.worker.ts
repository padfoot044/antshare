/// <reference lib="webworker" />

addEventListener('message', async ({ data }) => {
  const key = data.key as CryptoKey;
  const bytes = data.bytes as ArrayBuffer;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  postMessage({ iv: iv.buffer, ciphertext });
});
