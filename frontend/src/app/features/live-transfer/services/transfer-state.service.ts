import { Injectable, computed, signal } from '@angular/core';

export type TransferUiStatus =
  | 'idle'
  | 'waiting-for-receiver'
  | 'pending-approval'
  | 'approved'
  | 'handshake'
  | 'transferring'
  | 'completed'
  | 'failed';

@Injectable({ providedIn: 'root' })
export class TransferStateService {
  readonly roomCode = signal<string | null>(null);
  readonly status = signal<TransferUiStatus>('idle');
  readonly receiverDeviceLabel = signal<string | null>(null);
  readonly progressPercent = signal(0);
  readonly transferSpeedBps = signal(0);
  readonly etaSeconds = signal(0);
  readonly errorMessage = signal<string | null>(null);
  readonly downloadUrl = signal<string | null>(null);
  readonly fileName = signal<string | null>(null);
  readonly dataChannelReady = signal(false);
  readonly peerConnectionState = signal<RTCPeerConnectionState>('new');
  readonly iceConnectionState = signal<RTCIceConnectionState>('new');
  readonly canCancel = computed(() =>
    ['waiting-for-receiver', 'pending-approval', 'transferring'].includes(this.status())
  );
}
