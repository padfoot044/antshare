import { Injectable } from '@angular/core';
import { FileChunkService } from './file-chunk.service';
import { TransferStateService } from './transfer-state.service';

type ChunkMessage =
  | { type: 'metadata'; fileName: string; mimeType: string; totalChunks: number; fileSize: number }
  | { type: 'chunk'; chunkIndex: number; iv: string; ciphertext: string }
  | { type: 'complete' };

@Injectable({ providedIn: 'root' })
export class WebRtcTransferService {
  private readonly peer = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Place your TURN server configuration here to enable transfer across different networks (e.g. cellular data to Wi-Fi)
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'your-username',
      //   credential: 'your-password'
      // }
    ],
  });
  private channel?: RTCDataChannel;
  private readonly remoteCandidatesQueue: RTCIceCandidateInit[] = [];
  private onOfferHandler?: (offer: RTCSessionDescriptionInit) => Promise<void>;
  private onAnswerHandler?: (answer: RTCSessionDescriptionInit) => Promise<void>;
  private onIceHandler?: (candidate: RTCIceCandidate) => Promise<void>;
  private readonly encryptedChunks = new Map<number, { iv: string; ciphertext: string }>();
  private expectedChunks = 0;
  private mimeType = 'application/octet-stream';

  private useSignalrFallback = false;
  private onFallbackChunkHandler?: (chunkJson: string) => Promise<void>;

  private receiverStartTime = 0;
  private receiverReceivedBytes = 0;
  private fileSize = 0;

  constructor(
    private readonly fileChunkService: FileChunkService,
    private readonly state: TransferStateService,
  ) {
    this.peer.onicecandidate = (event) => {
      if (event.candidate && this.onIceHandler) void this.onIceHandler(event.candidate);
    };
    this.peer.onconnectionstatechange = () => {
      this.state.peerConnectionState.set(this.peer.connectionState);
    };
    this.peer.oniceconnectionstatechange = () => {
      this.state.iceConnectionState.set(this.peer.iceConnectionState);
    };
  }

  setSignalHandlers(
    onOffer: (offer: RTCSessionDescriptionInit) => Promise<void>,
    onAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>,
    onIce: (candidate: RTCIceCandidate) => Promise<void>,
  ): void {
    this.onOfferHandler = onOffer;
    this.onAnswerHandler = onAnswer;
    this.onIceHandler = onIce;
  }

  setFallbackChunkHandler(handler: (chunkJson: string) => Promise<void>): void {
    this.onFallbackChunkHandler = handler;
  }

  handleFallbackChunk(chunkJson: string): void {
    this.useSignalrFallback = true;
    this.state.dataChannelReady.set(true);
    if (this.state.status() !== 'transferring') {
      this.state.status.set('approved');
    }
    this.processIncomingMessage(chunkJson);
  }

  async createSenderDataChannel(): Promise<void> {
    this.state.dataChannelReady.set(false);
    this.channel = this.peer.createDataChannel('transfer');
    this.attachChannelHandlers(this.channel);
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    if (this.onOfferHandler) await this.onOfferHandler(offer);
  }

  prepareReceiverChannel(): void {
    this.peer.ondatachannel = (event) => {
      this.channel = event.channel;
      this.attachChannelHandlers(event.channel);
    };
  }

  async acceptOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    await this.peer.setRemoteDescription(offer);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    if (this.onAnswerHandler) await this.onAnswerHandler(answer);
    await this.processQueuedCandidates();
  }

  async acceptAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.peer.setRemoteDescription(answer);
    await this.processQueuedCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peer.remoteDescription) {
      this.remoteCandidatesQueue.push(candidate);
      return;
    }
    try {
      await this.peer.addIceCandidate(candidate);
    } catch (error) {
      console.warn('Failed to add ICE candidate:', error);
    }
  }

  private async processQueuedCandidates(): Promise<void> {
    while (this.remoteCandidatesQueue.length > 0) {
      const candidate = this.remoteCandidatesQueue.shift();
      if (candidate) {
        try {
          await this.peer.addIceCandidate(candidate);
        } catch (error) {
          console.warn('Failed to add queued ICE candidate:', error);
        }
      }
    }
  }

  async sendEncryptedChunks(
    file: File,
    encryptedChunks: Array<{ iv: ArrayBuffer; ciphertext: ArrayBuffer }>,
  ): Promise<void> {
    try {
      await this.waitForDataChannelOpen(4000); // Wait 4 seconds for P2P connection
    } catch (error) {
      console.warn('P2P connection timed out, falling back to Server Relay (SignalR):', error);
      this.useSignalrFallback = true;
      this.state.dataChannelReady.set(true); // Fake readiness for UI
    }

    if (!this.useSignalrFallback && !this.channel) {
      throw new Error('Data channel is not ready');
    }

    const chunks = this.fileChunkService.createChunks(file);
    this.state.status.set('transferring');
    this.state.fileName.set(file.name);

    await this.sendPayload({
      type: 'metadata',
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      totalChunks: chunks.length,
      fileSize: file.size,
    });

    const start = performance.now();
    let totalSentBytes = 0;

    for (let i = 0; i < encryptedChunks.length; i++) {
      if (!this.useSignalrFallback && this.channel) {
        while (this.channel.bufferedAmount > 4 * 1024 * 1024) {
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
      } else {
        // Small throttle for SignalR relay to prevent queue backing up too fast
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const payload: ChunkMessage = {
        type: 'chunk',
        chunkIndex: i,
        iv: this.toBase64(encryptedChunks[i].iv),
        ciphertext: this.toBase64(encryptedChunks[i].ciphertext),
      };

      await this.sendPayload(payload);

      // Calculate sent bytes (approximated by chunk sizes)
      totalSentBytes += chunks[i].size;
      const elapsedSeconds = (performance.now() - start) / 1000;
      const speed = elapsedSeconds > 0 ? totalSentBytes / elapsedSeconds : 0;
      this.state.transferSpeedBps.set(Math.round(speed));

      const remainingBytes = Math.max(file.size - totalSentBytes, 0);
      const eta = speed > 0 ? remainingBytes / speed : 0;
      this.state.etaSeconds.set(Math.round(eta));

      this.state.progressPercent.set(Math.round(((i + 1) / encryptedChunks.length) * 100));
    }

    await this.sendPayload({ type: 'complete' });

    const seconds = Math.max((performance.now() - start) / 1000, 0.001);
    this.state.transferSpeedBps.set(Math.round(file.size / seconds));
    this.state.etaSeconds.set(0);
    this.state.status.set('completed');
  }

  private async sendPayload(payload: ChunkMessage): Promise<void> {
    const json = JSON.stringify(payload);
    if (this.useSignalrFallback) {
      if (this.onFallbackChunkHandler) {
        await this.onFallbackChunkHandler(json);
      } else {
        throw new Error('SignalR fallback chunk handler is not registered');
      }
    } else {
      if (!this.channel) {
        throw new Error('Data channel is not open');
      }
      this.channel.send(json);
    }
  }

  consumeReceivedEncryptedChunks(): Array<{ iv: ArrayBuffer; ciphertext: ArrayBuffer }> {
    return Array.from(this.encryptedChunks.entries())
      .sort(([a], [b]) => a - b)
      .map(([, value]) => ({
        iv: this.fromBase64(value.iv),
        ciphertext: this.fromBase64(value.ciphertext),
      }));
  }

  private attachChannelHandlers(channel: RTCDataChannel): void {
    channel.onopen = () => {
      this.state.dataChannelReady.set(true);
      if (this.state.status() !== 'transferring') {
        this.state.status.set('approved');
      }
    };
    channel.onclose = () => {
      this.state.dataChannelReady.set(false);
      if (this.state.status() === 'transferring') {
        this.state.status.set('failed');
        this.state.errorMessage.set('Data channel closed during transfer.');
      }
    };
    channel.onerror = () => {
      this.state.dataChannelReady.set(false);
      this.state.status.set('failed');
      this.state.errorMessage.set('Data channel failed during transfer.');
    };

    channel.onmessage = (event) => {
      this.processIncomingMessage(event.data);
    };
  }

  private processIncomingMessage(data: string): void {
    const message = JSON.parse(data) as ChunkMessage;
    if (message.type === 'metadata') {
      this.state.fileName.set(message.fileName);
      this.expectedChunks = message.totalChunks;
      this.mimeType = message.mimeType;
      this.fileSize = message.fileSize;
      this.receiverStartTime = performance.now();
      this.receiverReceivedBytes = 0;
      this.state.status.set('transferring');
      return;
    }

    if (message.type === 'chunk') {
      this.encryptedChunks.set(message.chunkIndex, {
        iv: message.iv,
        ciphertext: message.ciphertext,
      });

      // Approximate bytes received (base64 string is ~1.33x the raw size, so length * 0.75 is raw size)
      const chunkLen = message.ciphertext.length * 0.75;
      this.receiverReceivedBytes += chunkLen;

      const elapsed = (performance.now() - this.receiverStartTime) / 1000;
      const speed = elapsed > 0 ? this.receiverReceivedBytes / elapsed : 0;
      this.state.transferSpeedBps.set(Math.round(speed));

      const remainingBytes = Math.max(this.fileSize - this.receiverReceivedBytes, 0);
      const eta = speed > 0 ? remainingBytes / speed : 0;
      this.state.etaSeconds.set(Math.round(eta));

      if (this.expectedChunks > 0) {
        this.state.progressPercent.set(
          Math.min(Math.round((this.encryptedChunks.size / this.expectedChunks) * 100), 100),
        );
      }
      return;
    }

    if (message.type === 'complete') {
      this.state.status.set('completed');
      this.state.transferSpeedBps.set(0);
      this.state.etaSeconds.set(0);
    }
  }

  getMimeType(): string {
    return this.mimeType;
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

  private async waitForDataChannelOpen(timeoutMs = 10000): Promise<void> {
    if (this.channel?.readyState === 'open') {
      return;
    }

    const channel = this.channel;
    if (!channel) {
      throw new Error('Data channel is not ready');
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Data channel did not open in time'));
      }, timeoutMs);

      const onOpen = () => {
        cleanup();
        resolve();
      };

      const onClose = () => {
        cleanup();
        reject(new Error('Data channel closed before opening'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        channel.removeEventListener('open', onOpen);
        channel.removeEventListener('close', onClose);
      };

      channel.addEventListener('open', onOpen);
      channel.addEventListener('close', onClose);
    });
  }
}
