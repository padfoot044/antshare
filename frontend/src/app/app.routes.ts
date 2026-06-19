import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'send' },
  {
    path: 'send',
    loadComponent: () =>
      import('./features/live-transfer/sender/sender-transfer.page').then(
        (m) => m.SenderTransferPage
      ),
  },
  {
    path: 'receive/:roomCode',
    loadComponent: () =>
      import('./features/live-transfer/receiver/receiver-transfer.page').then(
        (m) => m.ReceiverTransferPage
      ),
  },
];
