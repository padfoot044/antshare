# Vercel + Azure Deployment

Frontend target: Vercel  
Backend target: Azure App Service

## Frontend Environment Variables

- `NG_APP_API_BASE_URL=https://api.example.com`
- `NG_APP_SIGNALR_HUB_URL=https://api.example.com/transfer-hub`

## Backend Configuration

- `AllowedOrigins`
- `TransferRoomExpiryMinutes`

## Verification

1. Deploy backend to Azure App Service.
2. Verify `/swagger` is reachable.
3. Verify SignalR connection from deployed frontend.
4. Complete a transfer between sender and receiver tabs.
5. Verify logs do not contain file content, file names, or file keys.
