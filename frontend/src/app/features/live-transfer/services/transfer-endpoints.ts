declare global {
  interface Window {
    __ANT_SHARE_CONFIG__?: {
      apiBaseUrl?: string;
      signalRHubUrl?: string;
    };
  }
}

export interface TransferRuntimeConfig {
  apiBaseUrl: string;
  signalRHubUrl: string;
}

function getWindow(): Window | undefined {
  return typeof window === 'undefined' ? undefined : window;
}

function isLocalHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function normalizeUrl(url: string, fallbackPath: string): string {
  const trimmed = url.trim();
  if (!trimmed) return fallbackPath;
  return trimmed.replace(/\/+$/, '');
}

export function resolveTransferRuntimeConfig(): TransferRuntimeConfig {
  return {
    apiBaseUrl: 'https://congruent-viviana-unsalubriously.ngrok-free.dev',
    signalRHubUrl: 'https://congruent-viviana-unsalubriously.ngrok-free.dev/transfer-hub',
  };
}
