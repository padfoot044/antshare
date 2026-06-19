import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CryptoChunkService } from '../services/crypto-chunk.service';
import { TransferSignalrService } from '../services/transfer-signalr.service';
import { TransferStateService } from '../services/transfer-state.service';
import { WebRtcTransferService } from '../services/webrtc-transfer.service';

@Component({
  standalone: true,
  selector: 'app-receiver-transfer-page',
  imports: [CommonModule],
  templateUrl: './receiver-transfer.page.html',
  styleUrl: './receiver-transfer.page.scss',
})
export class ReceiverTransferPage {
  readonly state = inject(TransferStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly signalr = inject(TransferSignalrService);
  private readonly webrtc = inject(WebRtcTransferService);
  private readonly crypto = inject(CryptoChunkService);
  private rsaKeyPair: CryptoKeyPair | null = null;
  private fileKey: CryptoKey | null = null;

  constructor() {
    void this.initialize();
  }

  async downloadFile(): Promise<void> {
    if (!this.fileKey) return;

    try {
      this.state.errorMessage.set(null);
      const encrypted = this.webrtc.consumeReceivedEncryptedChunks();
      const chunks: ArrayBuffer[] = [];
      for (const chunk of encrypted) {
        chunks.push(await this.crypto.decryptChunk(this.fileKey, chunk.iv, chunk.ciphertext));
      }

      const blob = new Blob(chunks, { type: this.webrtc.getMimeType() });
      const url = URL.createObjectURL(blob);
      this.state.downloadUrl.set(url);
    } catch (error) {
      this.state.errorMessage.set('Decryption failed: ' + (error as Error).message);
    }
  }

  // Utilities for formatting metrics
  formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec <= 0) return '0 B/s';
    return this.formatBytes(bytesPerSec) + '/s';
  }

  formatEta(seconds: number): string {
    if (!seconds || seconds === Infinity) return 'Calculating...';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.ceil(seconds % 60);
    return `${mins}m ${secs}s`;
  }

  private async initialize(): Promise<void> {
    try {
      const roomCode = this.route.snapshot.paramMap.get('roomCode');
      if (!roomCode) {
        this.state.status.set('failed');
        this.state.errorMessage.set('Room code is missing');
        return;
      }

      this.state.roomCode.set(roomCode);
      this.state.status.set('waiting-for-receiver');

      await this.signalr.connect();
      await this.signalr.joinAsReceiver(roomCode, navigator.userAgent);

      this.wireSignalHandlers(roomCode);
      this.webrtc.prepareReceiverChannel();
      this.state.status.set('pending-approval');
    } catch (error) {
      this.state.status.set('failed');
      this.state.errorMessage.set((error as Error).message);
    }
  }

  private wireSignalHandlers(roomCode: string): void {
    this.webrtc.setSignalHandlers(
      async (offer) => this.signalr.relayOffer(roomCode, offer),
      async (answer) => this.signalr.relayAnswer(roomCode, answer),
      async (candidate) => this.signalr.relayIceCandidate(roomCode, candidate)
    );

    this.signalr.onOffer(async (offer) => {
      await this.webrtc.acceptOffer(offer);
      this.state.status.set('approved');
    });

    this.signalr.onSenderApproved(async () => {
      this.state.status.set('handshake');
      this.rsaKeyPair = await this.crypto.createRsaKeyPair();
      const publicKey = await this.crypto.exportPublicKey(this.rsaKeyPair.publicKey);
      await this.signalr.startHandshake(roomCode, { type: 'receiverPublicKey', publicKey });
    });

    this.signalr.onIceCandidate(async (candidate) => {
      await this.webrtc.addIceCandidate(candidate);
    });

    this.signalr.onFallbackChunk((chunkJson) => {
      this.webrtc.handleFallbackChunk(chunkJson);
    });

    this.signalr.onHandshakeCompleted(async (payload) => {
      const value = payload as { type?: string; wrappedFileKey?: string };
      if (value.type !== 'wrappedFileKey' || !value.wrappedFileKey || !this.rsaKeyPair) return;
      
      try {
        this.fileKey = await this.crypto.unwrapFileKey(value.wrappedFileKey, this.rsaKeyPair.privateKey);
        this.state.status.set('approved');
      } catch (error) {
        this.state.status.set('failed');
        this.state.errorMessage.set('Handshake failed during decryption key unwrapping.');
      }
    });
  }
}

