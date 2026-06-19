import { Injectable, computed, signal } from '@angular/core';

export type TransferUiStatus =
  | 'idle'
  | 'waiting-for-receiver'
  | 'pending-approval'
  | 'approved'
  | 'handshake'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'disconnected';

export type SignalrState = 'connected' | 'reconnecting' | 'disconnected';

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

  // Connectivity / lifecycle awareness
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly signalrState = signal<SignalrState>('disconnected');
  readonly peerLeft = signal(false);

  // True-E2EE out-of-band verification (Short Authentication String).
  // Both peers derive the same code from the key material; if a relay tampered
  // with the public key, the codes diverge and the user can abort.
  readonly verificationCode = signal<string | null>(null);

  readonly canCancel = computed(() =>
    ['waiting-for-receiver', 'pending-approval', 'transferring'].includes(this.status())
  );

  /** True while the transfer is mid-flight and a dropped connection would be fatal. */
  readonly isActiveSession = computed(() =>
    ['waiting-for-receiver', 'pending-approval', 'approved', 'handshake', 'transferring'].includes(
      this.status()
    )
  );

  /** Connectivity trouble worth showing a banner for, without clobbering the flow. */
  readonly connectivityIssue = computed<'offline' | 'reconnecting' | null>(() => {
    if (!this.online()) return 'offline';
    if (this.signalrState() === 'reconnecting' && this.isActiveSession()) return 'reconnecting';
    return null;
  });

  /** Reset everything that is per-session so a fresh transfer can be started cleanly. */
  resetSession(): void {
    this.status.set('idle');
    this.progressPercent.set(0);
    this.transferSpeedBps.set(0);
    this.etaSeconds.set(0);
    this.errorMessage.set(null);
    this.downloadUrl.set(null);
    this.fileName.set(null);
    this.dataChannelReady.set(false);
    this.peerLeft.set(false);
    this.verificationCode.set(null);
    this.receiverDeviceLabel.set(null);
  }
}
