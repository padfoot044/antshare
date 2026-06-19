import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { resolveTransferRuntimeConfig } from './transfer-endpoints';

@Injectable({ providedIn: 'root' })
export class TransferSignalrService {
  private readonly hubUrl = resolveTransferRuntimeConfig().signalRHubUrl;
  private connection?: HubConnection;

  get state(): HubConnectionState {
    return this.connection?.state ?? HubConnectionState.Disconnected;
  }

  async connect(): Promise<void> {
    if (this.connection && this.connection.state === HubConnectionState.Connected) return;

    this.connection = new HubConnectionBuilder()
      // ngrok-skip-browser-warning avoids the ngrok-free interstitial on the
      // negotiate request; harmless without ngrok.
      .withUrl(this.hubUrl, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      // Retry quickly at first, then back off, and keep trying for ~2 minutes so a
      // brief Wi-Fi/cellular blip doesn't kill an in-flight transfer.
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 15000, 30000, 30000, 30000])
      .build();

    await this.connection.start();
  }

  async joinAsSender(roomCode: string): Promise<void> {
    await this.connection?.invoke('JoinAsSender', roomCode);
  }

  async joinAsReceiver(roomCode: string, deviceLabel: string): Promise<void> {
    await this.connection?.invoke('JoinAsReceiver', roomCode, deviceLabel);
  }

  async approveReceiver(roomCode: string): Promise<void> {
    await this.connection?.invoke('ApproveReceiver', roomCode);
  }

  async rejectReceiver(roomCode: string): Promise<void> {
    await this.connection?.invoke('RejectReceiver', roomCode);
  }

  /** Best-effort, fire-and-forget notice that we are leaving (tab close/cancel). */
  async leaveRoom(roomCode: string): Promise<void> {
    if (this.connection?.state !== HubConnectionState.Connected) return;
    try {
      await this.connection.invoke('LeaveRoom', roomCode);
    } catch {
      // The socket may already be gone — the server's OnDisconnected covers it.
    }
  }

  async relayOffer(roomCode: string, offer: RTCSessionDescriptionInit): Promise<void> {
    await this.connection?.invoke('RelayWebRtcOffer', roomCode, JSON.stringify(offer));
  }

  async relayAnswer(roomCode: string, answer: RTCSessionDescriptionInit): Promise<void> {
    await this.connection?.invoke('RelayWebRtcAnswer', roomCode, JSON.stringify(answer));
  }

  async relayIceCandidate(roomCode: string, candidate: RTCIceCandidate): Promise<void> {
    await this.connection?.invoke('RelayIceCandidate', roomCode, JSON.stringify(candidate.toJSON()));
  }

  async relayFallbackChunk(roomCode: string, chunkJson: string): Promise<void> {
    await this.connection?.invoke('RelayFallbackChunk', roomCode, chunkJson);
  }

  async startHandshake(roomCode: string, payload: unknown): Promise<void> {
    await this.connection?.invoke('StartHandshake', roomCode, payload);
  }

  async completeHandshake(roomCode: string, payload: unknown): Promise<void> {
    await this.connection?.invoke('CompleteHandshake', roomCode, payload);
  }

  // --- Connection lifecycle (resilience) ---
  onReconnecting(handler: (error?: Error) => void): void {
    this.connection?.onreconnecting((error) => handler(error));
  }

  onReconnected(handler: (connectionId?: string) => void): void {
    this.connection?.onreconnected((connectionId) => handler(connectionId));
  }

  onClose(handler: (error?: Error) => void): void {
    this.connection?.onclose((error) => handler(error));
  }

  // --- Application events ---
  onReceiverJoined(handler: (payload: { roomCode: string; deviceLabel: string }) => void): void {
    this.connection?.on('ReceiverJoined', handler);
  }

  onSenderApproved(handler: (payload: { roomCode: string }) => void): void {
    this.connection?.on('SenderApproved', handler);
  }

  onSenderRejected(handler: (payload: { roomCode: string }) => void): void {
    this.connection?.on('SenderRejected', handler);
  }

  onPeerLeft(handler: (payload: { roomCode: string; role: string }) => void): void {
    this.connection?.on('PeerLeft', handler);
  }

  onOffer(handler: (offer: RTCSessionDescriptionInit) => void): void {
    this.connection?.on('WebRtcOffer', (offerJson: string) => handler(JSON.parse(offerJson)));
  }

  onAnswer(handler: (answer: RTCSessionDescriptionInit) => void): void {
    this.connection?.on('WebRtcAnswer', (answerJson: string) => handler(JSON.parse(answerJson)));
  }

  onIceCandidate(handler: (candidate: RTCIceCandidateInit) => void): void {
    this.connection?.on('IceCandidate', (candidateJson: string) => handler(JSON.parse(candidateJson)));
  }

  onFallbackChunk(handler: (chunkJson: string) => void): void {
    this.connection?.on('WebRtcChunkFallback', handler);
  }

  onHandshakeStarted(handler: (payload: unknown) => void): void {
    this.connection?.on('HandshakeStarted', handler);
  }

  onHandshakeCompleted(handler: (payload: unknown) => void): void {
    this.connection?.on('HandshakeCompleted', handler);
  }
}
