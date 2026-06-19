import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
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
export class ReceiverTransferPage implements OnDestroy {
  readonly state = inject(TransferStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly signalr = inject(TransferSignalrService);
  private readonly webrtc = inject(WebRtcTransferService);
  private readonly crypto = inject(CryptoChunkService);

  readonly cryptoSupported = signal(this.isCryptoSupported());

  private rsaKeyPair: CryptoKeyPair | null = null;
  private fileKey: CryptoKey | null = null;
  private receiverPublicKeyB64: string | null = null;
  private readonly onBeforeUnload = () => this.notifyLeaving();
  private readonly onOnline = () => this.state.online.set(true);
  private readonly onOffline = () => this.state.online.set(false);

  constructor() {
    this.state.resetSession();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    // beforeunload is unreliable on iOS Safari; pagehide is the supported signal.
    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onBeforeUnload);
    void this.initialize();
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('pagehide', this.onBeforeUnload);
    this.notifyLeaving();
  }

  async downloadFile(): Promise<void> {
    if (!this.fileKey) {
      this.state.errorMessage.set(
        'The secure key is not ready yet. Wait for the handshake to finish, or restart the transfer.'
      );
      return;
    }

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

  private isCryptoSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof crypto !== 'undefined' &&
      !!crypto.subtle
    );
  }

  private notifyLeaving(): void {
    const roomCode = this.state.roomCode();
    if (roomCode && this.state.isActiveSession()) {
      void this.signalr.leaveRoom(roomCode);
    }
  }

  private async initialize(): Promise<void> {
    try {
      const roomCode = this.route.snapshot.paramMap.get('roomCode');
      if (!roomCode) {
        this.state.status.set('failed');
        this.state.errorMessage.set('Room code is missing');
        return;
      }

      if (!this.cryptoSupported()) {
        this.state.roomCode.set(roomCode);
        this.state.status.set('failed');
        this.state.errorMessage.set(
          'This browser cannot run end-to-end encryption here. Safari blocks secure crypto on plain-http addresses — open this link over HTTPS.'
        );
        return;
      }

      this.state.roomCode.set(roomCode);
      this.state.status.set('waiting-for-receiver');

      await this.signalr.connect();
      this.state.signalrState.set('connected');
      this.wireSignalHandlers(roomCode);
      await this.signalr.joinAsReceiver(roomCode, navigator.userAgent);

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

    // Connection lifecycle (resilience)
    this.signalr.onReconnecting(() => this.state.signalrState.set('reconnecting'));
    this.signalr.onReconnected(async () => {
      this.state.signalrState.set('connected');
      if (this.state.status() === 'pending-approval') {
        try {
          await this.signalr.joinAsReceiver(roomCode, navigator.userAgent);
        } catch {
          /* surfaced via onClose if truly dead */
        }
      }
    });
    this.signalr.onClose(() => {
      this.state.signalrState.set('disconnected');
      if (this.state.isActiveSession() && this.state.status() !== 'transferring') {
        this.state.status.set('failed');
        this.state.errorMessage.set('Lost connection to the signaling server. Please reopen the link.');
      }
    });

    this.signalr.onPeerLeft(({ role }) => {
      if (role !== 'sender') return;
      if (this.state.status() === 'completed') return;

      // Over a direct P2P channel the sender's signaling drop is harmless — chunks
      // keep arriving and the WebRTC watcher catches a real P2P break. Only fatal
      // when the relay is the transport.
      if (this.state.status() === 'transferring' && !this.webrtc.isUsingFallback()) return;

      this.state.peerLeft.set(true);
      this.state.status.set('disconnected');
      this.state.errorMessage.set('The sender disconnected (closed their tab or lost connection).');
    });

    this.signalr.onOffer(async (offer) => {
      // Accept the WebRTC offer, but do NOT advance the UI here — the crypto
      // handshake owns the "approved" state so we never look ready before the
      // decryption key actually exists.
      await this.webrtc.acceptOffer(offer);
    });

    this.signalr.onSenderApproved(async () => {
      try {
        this.state.status.set('handshake');
        this.rsaKeyPair = await this.crypto.createRsaKeyPair();
        this.receiverPublicKeyB64 = await this.crypto.exportPublicKey(this.rsaKeyPair.publicKey);
        await this.signalr.startHandshake(roomCode, {
          type: 'receiverPublicKey',
          publicKey: this.receiverPublicKeyB64,
        });
      } catch (error) {
        this.state.status.set('failed');
        this.state.errorMessage.set('Could not start the secure handshake: ' + (error as Error).message);
      }
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
        if (this.receiverPublicKeyB64) {
          this.state.verificationCode.set(
            await this.crypto.deriveVerificationCode(this.receiverPublicKeyB64, value.wrappedFileKey)
          );
        }
        this.state.status.set('approved');
      } catch (error) {
        this.state.status.set('failed');
        this.state.errorMessage.set('Handshake failed during decryption key unwrapping.');
      }
    });
  }
}
