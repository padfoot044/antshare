import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CryptoChunkService } from '../services/crypto-chunk.service';
import { FileChunkService } from '../services/file-chunk.service';
import { TransferApiService } from '../services/transfer-api.service';
import { TransferSignalrService } from '../services/transfer-signalr.service';
import { TransferStateService } from '../services/transfer-state.service';
import { WebRtcTransferService } from '../services/webrtc-transfer.service';

const HANDSHAKE_TIMEOUT_MS = 25_000;

@Component({
  standalone: true,
  selector: 'app-sender-transfer-page',
  imports: [CommonModule, FormsModule],
  templateUrl: './sender-transfer.page.html',
  styleUrl: './sender-transfer.page.scss',
})
export class SenderTransferPage implements OnInit, OnDestroy {
  readonly state = inject(TransferStateService);
  private readonly api = inject(TransferApiService);
  private readonly signalr = inject(TransferSignalrService);
  private readonly webrtc = inject(WebRtcTransferService);
  private readonly crypto = inject(CryptoChunkService);
  private readonly fileChunk = inject(FileChunkService);

  readonly file = signal<File | null>(null);
  readonly shareUrl = signal<string | null>(null);
  readonly handshakeComplete = signal(false);

  // Custom states for premium UX
  readonly dragActive = signal(false);
  readonly linkCopied = signal(false);

  // Is the browser able to do end-to-end encryption at all? (false on insecure origins)
  readonly cryptoSupported = signal(this.isCryptoSupported());

  private fileKey: CryptoKey | null = null;
  private receiverPublicKey: CryptoKey | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onBeforeUnload = () => this.notifyLeaving();
  private readonly onOnline = () => this.state.online.set(true);
  private readonly onOffline = () => this.state.online.set(false);

  // Parsed receiver info
  readonly receiverDevice = computed(() => {
    const ua = this.state.receiverDeviceLabel();
    if (!ua) return null;
    return this.parseUserAgent(ua);
  });

  ngOnInit(): void {
    this.state.resetSession();
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    // beforeunload is unreliable on iOS Safari; pagehide is the supported signal.
    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('pagehide', this.onBeforeUnload);
  }

  ngOnDestroy(): void {
    this.clearHandshakeTimer();
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('pagehide', this.onBeforeUnload);
    this.notifyLeaving();
  }

  async createRoom(): Promise<void> {
    if (!this.cryptoSupported()) {
      this.state.status.set('failed');
      this.state.errorMessage.set(
        'This page is not running in a secure context, so end-to-end encryption is disabled. Open AntShare over HTTPS.'
      );
      return;
    }

    try {
      this.state.errorMessage.set(null);
      const result = await this.api.createTransfer();
      this.state.roomCode.set(result.roomCode);
      this.state.status.set('waiting-for-receiver');
      this.shareUrl.set(`${location.origin}/receive/${result.roomCode}`);

      await this.signalr.connect();
      this.state.signalrState.set('connected');
      this.wireSignalHandlers(result.roomCode);
      await this.signalr.joinAsSender(result.roomCode);
    } catch (error) {
      this.state.status.set('failed');
      this.state.errorMessage.set((error as Error).message);
    }
  }

  // File selection & drag drop
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.file.set(input.files[0]);
      this.state.errorMessage.set(null);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragActive.set(false);

    const droppedFile = event.dataTransfer?.files?.[0];
    if (droppedFile) {
      this.file.set(droppedFile);
      this.state.errorMessage.set(null);
    }
  }

  removeSelectedFile(event: Event): void {
    event.stopPropagation();
    this.file.set(null);
  }

  async copyLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Clipboard API is blocked (insecure context / Safari permissions). Fall back
      // to a manual selection prompt so the user can still copy the link.
      this.fallbackCopy(url);
    }
  }

  async approveReceiver(): Promise<void> {
    const roomCode = this.state.roomCode();
    if (!roomCode) return;
    try {
      await this.signalr.approveReceiver(roomCode);
      await this.webrtc.createSenderDataChannel();
      this.startHandshakeWatchdog();
    } catch (error) {
      this.state.status.set('failed');
      this.state.errorMessage.set((error as Error).message);
    }
  }

  async startTransfer(): Promise<void> {
    const selectedFile = this.file();
    if (!selectedFile || !this.fileKey || !this.handshakeComplete() || !this.state.dataChannelReady()) {
      this.state.errorMessage.set('Transfer is not ready yet. Wait for secure channel to finish connecting.');
      return;
    }

    try {
      this.state.errorMessage.set(null);
      this.state.status.set('transferring');
      const chunks = this.fileChunk.createChunks(selectedFile);
      const encryptedChunks: Array<{ iv: ArrayBuffer; ciphertext: ArrayBuffer }> = [];
      for (const chunk of chunks) {
        encryptedChunks.push(await this.crypto.encryptChunk(this.fileKey, await chunk.arrayBuffer()));
      }

      await this.webrtc.sendEncryptedChunks(selectedFile, encryptedChunks);
    } catch (error) {
      this.state.status.set('failed');
      this.state.errorMessage.set((error as Error).message);
    }
  }

  // Utilities for formatting
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

  private startHandshakeWatchdog(): void {
    this.clearHandshakeTimer();
    this.handshakeTimer = setTimeout(() => {
      if (!this.handshakeComplete() && this.state.status() !== 'failed') {
        this.state.status.set('failed');
        this.state.errorMessage.set(
          'The secure handshake timed out. The receiver may have lost connection or their browser blocked encryption. Ask them to reload and try again.'
        );
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  private clearHandshakeTimer(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private notifyLeaving(): void {
    const roomCode = this.state.roomCode();
    if (roomCode && this.state.isActiveSession()) {
      void this.signalr.leaveRoom(roomCode);
    }
  }

  private fallbackCopy(url: string): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    } catch {
      // Give up silently; the link text is visible for manual copy.
    }
  }

  private parseUserAgent(userAgent: string): { browser: string; os: string; isMobile: boolean } {
    const ua = userAgent.toLowerCase();
    let browser = 'Browser';
    let os = 'OS';
    let isMobile = false;

    if (ua.includes('mobi') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
      isMobile = true;
    }

    if (ua.includes('chrome')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge')) browser = 'Edge';
    else if (ua.includes('opr') || ua.includes('opera')) browser = 'Opera';

    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    else if (ua.includes('android')) os = 'Android';

    return { browser, os, isMobile };
  }

  private wireSignalHandlers(roomCode: string): void {
    this.webrtc.setSignalHandlers(
      async (offer) => this.signalr.relayOffer(roomCode, offer),
      async (answer) => this.signalr.relayAnswer(roomCode, answer),
      async (candidate) => this.signalr.relayIceCandidate(roomCode, candidate)
    );

    this.webrtc.setFallbackChunkHandler(
      async (chunkJson) => this.signalr.relayFallbackChunk(roomCode, chunkJson)
    );

    // Connection lifecycle (resilience)
    this.signalr.onReconnecting(() => this.state.signalrState.set('reconnecting'));
    this.signalr.onReconnected(async () => {
      this.state.signalrState.set('connected');
      // Re-establish room membership if we dropped while still waiting for a peer.
      if (this.state.status() === 'waiting-for-receiver') {
        try {
          await this.signalr.joinAsSender(roomCode);
        } catch {
          /* will surface via onClose if truly dead */
        }
      }
    });
    this.signalr.onClose(() => {
      this.state.signalrState.set('disconnected');
      if (this.state.isActiveSession() && this.state.status() !== 'transferring') {
        this.state.status.set('failed');
        this.state.errorMessage.set('Lost connection to the signaling server. Please start a new transfer.');
      }
    });

    this.signalr.onPeerLeft(({ role }) => {
      if (role !== 'receiver') return;
      if (this.state.status() === 'completed') return;

      // If bytes are flowing over a direct P2P channel, the receiver's signaling
      // drop is harmless — the WebRTC connection-state watcher will catch a real
      // P2P break. Only treat it as fatal when we depend on the relay.
      if (this.state.status() === 'transferring' && !this.webrtc.isUsingFallback()) return;

      this.clearHandshakeTimer();
      this.state.peerLeft.set(true);
      this.state.status.set('disconnected');
      this.state.errorMessage.set('The receiver disconnected (closed their tab or lost connection).');
    });

    this.signalr.onReceiverJoined(({ deviceLabel }) => {
      this.state.receiverDeviceLabel.set(deviceLabel);
      this.state.peerLeft.set(false);
      this.state.status.set('pending-approval');
    });

    this.signalr.onAnswer(async (answer) => {
      await this.webrtc.acceptAnswer(answer);
    });

    this.signalr.onIceCandidate(async (candidate) => {
      await this.webrtc.addIceCandidate(candidate);
    });

    this.signalr.onHandshakeStarted(async (payload) => {
      const value = payload as { type?: string; publicKey?: string };
      if (value.type !== 'receiverPublicKey' || !value.publicKey) return;

      try {
        this.receiverPublicKey = await this.crypto.importPublicKey(value.publicKey);
        this.fileKey = await this.crypto.createFileKey();
        const wrappedFileKey = await this.crypto.wrapFileKey(this.fileKey, this.receiverPublicKey);
        this.state.status.set('handshake');
        await this.signalr.completeHandshake(roomCode, { type: 'wrappedFileKey', wrappedFileKey });

        // Out-of-band verification code: identical on both peers unless tampered with.
        this.state.verificationCode.set(
          await this.crypto.deriveVerificationCode(value.publicKey, wrappedFileKey)
        );

        this.handshakeComplete.set(true);
        this.clearHandshakeTimer();
        this.state.status.set('approved');
      } catch (error) {
        this.clearHandshakeTimer();
        this.state.status.set('failed');
        this.state.errorMessage.set('Key exchange handshake failed: ' + (error as Error).message);
      }
    });

    this.signalr.onSenderApproved(() => {
      if (this.state.status() === 'pending-approval') {
        this.state.status.set('approved');
      }
    });
  }
}
