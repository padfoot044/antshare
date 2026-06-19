import { Injectable } from '@angular/core';
import { resolveTransferRuntimeConfig } from './transfer-endpoints';

export interface CreateTransferResponse {
  transferId: string;
  roomCode: string;
  status: string;
  expiresAtUtc: string;
}

export interface GetTransferResponse {
  transferId: string;
  roomCode: string;
  status: string;
  expiresAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class TransferApiService {
  private readonly baseUrl = resolveTransferRuntimeConfig().apiBaseUrl;

  // Skips the ngrok-free browser interstitial that otherwise returns HTML instead
  // of JSON on some clients (notably fresh mobile Safari sessions). Harmless when
  // the backend is not behind ngrok.
  private readonly headers = { 'ngrok-skip-browser-warning': 'true' };

  async createTransfer(): Promise<CreateTransferResponse> {
    const response = await fetch(`${this.baseUrl}/api/transfers`, {
      method: 'POST',
      headers: this.headers,
    });
    if (!response.ok) throw new Error('Failed to create transfer room');
    return response.json();
  }

  async getTransfer(roomCode: string): Promise<GetTransferResponse> {
    const response = await fetch(`${this.baseUrl}/api/transfers/${encodeURIComponent(roomCode)}`, {
      headers: this.headers,
    });
    if (!response.ok) throw new Error('Transfer room not found');
    return response.json();
  }
}
