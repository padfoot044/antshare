import { Injectable } from '@angular/core';
import { HubConnection, HubConnectionBuilder } from '@microsoft/signalr';
import { resolveTransferRuntimeConfig } from './transfer-endpoints';

@Injectable({ providedIn: 'root' })
export class TransferSignalrService {
  private readonly hubUrl = resolveTransferRuntimeConfig().signalRHubUrl;
  private connection?: HubConnection;

  async connect(): Promise<void> {
    if (this.connection && this.connection.state === 'Connected') return;

    this.connection = new HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .withAutomaticReconnect()
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

  onReceiverJoined(handler: (payload: { roomCode: string; deviceLabel: string }) => void): void {
    this.connection?.on('ReceiverJoined', handler);
  }

  onSenderApproved(handler: (payload: { roomCode: string }) => void): void {
    this.connection?.on('SenderApproved', handler);
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
