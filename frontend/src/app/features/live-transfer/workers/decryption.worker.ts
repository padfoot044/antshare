/// <reference lib="webworker" />

addEventListener('message', async ({ data }) => {
  const key = data.key as CryptoKey;
  const iv = data.iv as ArrayBuffer;
  const ciphertext = data.ciphertext as ArrayBuffer;
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  postMessage({ plaintext });
});
