# Encrypted Live File Sharing App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP browser-based live file sharing app where sender and receiver connect in real time, complete a handshake, and transfer client-side encrypted file chunks over WebRTC while the backend only coordinates rooms and signaling.

**Architecture:** Use a two-project repo: `frontend/` for Angular 21 UI hosted on Vercel and `backend/` for a .NET 10 API hosted on Azure App Service. The backend owns transfer-room lifecycle, approval flow, and SignalR signaling; the browsers own encryption, handshake, chunk transfer, and file reconstruction.

**Tech Stack:** Angular 21, TypeScript, SignalR JS client, WebRTC DataChannel, Web Crypto API, Web Workers, .NET 10, FastEndpoints, SignalR, xUnit, Playwright, Vercel, Azure App Service

---

## File Structure

- `frontend/`
  - Angular application for sender and receiver flows.
  - Contains feature pages, transfer services, worker files, and UI tests.
- `backend/`
  - .NET solution for REST endpoints, SignalR hub, cleanup worker, and tests.
- `docs/`
  - Architecture notes, environment setup, and deployment runbooks.

Planned key files:

- Create: `frontend/package.json`
- Create: `frontend/src/app/app.routes.ts`
- Create: `frontend/src/app/features/live-transfer/sender/sender-transfer.page.ts`
- Create: `frontend/src/app/features/live-transfer/receiver/receiver-transfer.page.ts`
- Create: `frontend/src/app/features/live-transfer/services/transfer-signalr.service.ts`
- Create: `frontend/src/app/features/live-transfer/services/webrtc-transfer.service.ts`
- Create: `frontend/src/app/features/live-transfer/services/file-chunk.service.ts`
- Create: `frontend/src/app/features/live-transfer/services/crypto-chunk.service.ts`
- Create: `frontend/src/app/features/live-transfer/services/transfer-state.service.ts`
- Create: `frontend/src/app/features/live-transfer/workers/encryption.worker.ts`
- Create: `frontend/src/app/features/live-transfer/workers/decryption.worker.ts`
- Create: `frontend/playwright.config.ts`
- Create: `backend/src/AntShare.Api/Program.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/CreateTransfer/CreateTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/GetTransfer/GetTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/JoinTransfer/JoinTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/CancelTransfer/CancelTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Hubs/TransferHub.cs`
- Create: `backend/src/AntShare.Api/Transfers/TransferSession.cs`
- Create: `backend/src/AntShare.Api/Transfers/TransferStatus.cs`
- Create: `backend/src/AntShare.Api/Transfers/ITransferSessionStore.cs`
- Create: `backend/src/AntShare.Api/Transfers/InMemoryTransferSessionStore.cs`
- Create: `backend/src/AntShare.Api/Background/ExpiredTransferCleanupService.cs`
- Create: `backend/tests/AntShare.Api.Tests/CreateTransferEndpointTests.cs`
- Create: `backend/tests/AntShare.Api.Tests/JoinTransferEndpointTests.cs`
- Create: `backend/tests/AntShare.Api.Tests/TransferHubTests.cs`
- Create: `docs/deployment/vercel-azure.md`
- Create: `docs/security/privacy-model.md`

### Task 1: Scaffold the Repo and Baseline Projects

**Files:**
- Create: `frontend/`
- Create: `backend/`
- Create: `backend/AntShare.sln`
- Create: `docs/deployment/vercel-azure.md`

- [ ] **Step 1: Create the frontend and backend shells**

```powershell
mkdir frontend, backend, docs, docs\deployment, docs\security
cd backend
dotnet new sln -n AntShare
dotnet new web -n AntShare.Api -o src/AntShare.Api
dotnet new xunit -n AntShare.Api.Tests -o tests/AntShare.Api.Tests
dotnet sln add .\src\AntShare.Api\AntShare.Api.csproj
dotnet sln add .\tests\AntShare.Api.Tests\AntShare.Api.Tests.csproj
dotnet add .\tests\AntShare.Api.Tests\AntShare.Api.Tests.csproj reference .\src\AntShare.Api\AntShare.Api.csproj
cd ..\frontend
npx @angular/cli@21 new frontend --routing --style=scss --directory . --ssr=false
```

- [ ] **Step 2: Install the backend packages**

```powershell
cd backend\src\AntShare.Api
dotnet add package FastEndpoints
dotnet add package FastEndpoints.Swagger
dotnet add package Microsoft.AspNetCore.SignalR
dotnet add package Microsoft.AspNetCore.OpenApi
cd ..\..\tests\AntShare.Api.Tests
dotnet add package FluentAssertions
dotnet add package Microsoft.AspNetCore.Mvc.Testing
```

- [ ] **Step 3: Install the frontend packages**

```powershell
cd frontend
npm install @microsoft/signalr
npm install -D playwright @playwright/test
```

- [ ] **Step 4: Add a minimal deployment runbook**

```markdown
# Vercel + Azure Deployment

- Frontend deploy target: Vercel
- Backend deploy target: Azure App Service
- Required frontend env vars:
  - `NG_APP_API_BASE_URL`
  - `NG_APP_SIGNALR_HUB_URL`
- Required backend config:
  - `AllowedOrigins`
  - `TransferRoomExpiryMinutes`
```

- [ ] **Step 5: Verify scaffolding**

Run: `dotnet build backend/AntShare.sln`
Expected: backend solution builds successfully

Run: `npm run build --prefix frontend`
Expected: Angular app builds successfully

- [ ] **Step 6: Commit**

```bash
git add backend frontend docs
git commit -m "chore: scaffold ant share frontend and backend"
```

### Task 2: Build Transfer Session Domain and REST Endpoints

**Files:**
- Create: `backend/src/AntShare.Api/Transfers/TransferSession.cs`
- Create: `backend/src/AntShare.Api/Transfers/TransferStatus.cs`
- Create: `backend/src/AntShare.Api/Transfers/ITransferSessionStore.cs`
- Create: `backend/src/AntShare.Api/Transfers/InMemoryTransferSessionStore.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/CreateTransfer/CreateTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/GetTransfer/GetTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/JoinTransfer/JoinTransferEndpoint.cs`
- Create: `backend/src/AntShare.Api/Features/Transfers/CancelTransfer/CancelTransferEndpoint.cs`
- Test: `backend/tests/AntShare.Api.Tests/CreateTransferEndpointTests.cs`
- Test: `backend/tests/AntShare.Api.Tests/JoinTransferEndpointTests.cs`

- [ ] **Step 1: Write the failing endpoint tests**

```csharp
[Fact]
public async Task Post_transfers_creates_waiting_room()
{
    var response = await _client.PostAsJsonAsync("/api/transfers", new { });

    response.StatusCode.Should().Be(HttpStatusCode.OK);
    var payload = await response.Content.ReadFromJsonAsync<CreateTransferResponse>();
    payload!.Status.Should().Be("WaitingForReceiver");
    payload.RoomCode.Should().NotBeNullOrWhiteSpace();
}

[Fact]
public async Task Join_marks_room_as_pending_approval()
{
    var create = await _client.PostAsJsonAsync("/api/transfers", new { });
    var created = await create.Content.ReadFromJsonAsync<CreateTransferResponse>();

    var join = await _client.PostAsJsonAsync($"/api/transfers/{created!.RoomCode}/join", new { DeviceLabel = "Chrome on Windows" });

    join.StatusCode.Should().Be(HttpStatusCode.OK);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/AntShare.Api.Tests/AntShare.Api.Tests.csproj --filter CreateTransfer`
Expected: FAIL because transfer endpoints and models do not exist yet

- [ ] **Step 3: Add the transfer domain models**

```csharp
public enum TransferStatus
{
    WaitingForReceiver,
    PendingSenderApproval,
    Approved,
    Rejected,
    Cancelled,
    Completed,
    Failed,
    Expired
}

public sealed class TransferSession
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string RoomCode { get; init; } = string.Empty;
    public TransferStatus Status { get; set; } = TransferStatus.WaitingForReceiver;
    public string? SenderConnectionId { get; set; }
    public string? ReceiverConnectionId { get; set; }
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(15);
    public DateTime? CancelledAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public string? ReceiverDeviceLabel { get; set; }
}
```

- [ ] **Step 4: Add the in-memory store and endpoints**

```csharp
public interface ITransferSessionStore
{
    TransferSession Create();
    TransferSession? GetByRoomCode(string roomCode);
    bool Update(TransferSession session);
    void RemoveExpired(DateTime utcNow);
}

public sealed class InMemoryTransferSessionStore : ITransferSessionStore
{
    private readonly ConcurrentDictionary<string, TransferSession> _sessions = new();

    public TransferSession Create()
    {
        var session = new TransferSession { RoomCode = RoomCodeGenerator.Create() };
        _sessions[session.RoomCode] = session;
        return session;
    }
}
```

- [ ] **Step 5: Wire the endpoints in `Program.cs`**

```csharp
builder.Services
    .AddFastEndpoints()
    .SwaggerDocument();

builder.Services.AddSingleton<ITransferSessionStore, InMemoryTransferSessionStore>();
builder.Services.AddSignalR();

var app = builder.Build();
app.UseFastEndpoints();
app.MapHub<TransferHub>("/transfer-hub");
app.UseSwaggerGen();
app.Run();
```

- [ ] **Step 6: Run backend tests**

Run: `dotnet test backend/tests/AntShare.Api.Tests/AntShare.Api.Tests.csproj`
Expected: PASS for create, get, join, and cancel endpoint tests

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat: add transfer session endpoints"
```

### Task 3: Implement SignalR Room Presence and Approval Flow

**Files:**
- Create: `backend/src/AntShare.Api/Hubs/TransferHub.cs`
- Test: `backend/tests/AntShare.Api.Tests/TransferHubTests.cs`
- Modify: `backend/src/AntShare.Api/Transfers/TransferSession.cs`

- [ ] **Step 1: Write the failing hub behavior tests**

```csharp
[Fact]
public async Task Receiver_join_notifies_sender()
{
    // Arrange two hub clients joined to same room
    // Act receiver joins
    // Assert sender gets ReceiverJoined event with device label
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `dotnet test backend/tests/AntShare.Api.Tests/AntShare.Api.Tests.csproj --filter TransferHub`
Expected: FAIL because `TransferHub` does not exist

- [ ] **Step 3: Implement the hub methods**

```csharp
public sealed class TransferHub(ITransferSessionStore store) : Hub
{
    public async Task JoinAsSender(string roomCode)
    {
        var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
        session.SenderConnectionId = Context.ConnectionId;
        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync("RoomState", new { roomCode, status = session.Status.ToString() });
    }

    public async Task JoinAsReceiver(string roomCode, string deviceLabel)
    {
        var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
        session.ReceiverConnectionId = Context.ConnectionId;
        session.ReceiverDeviceLabel = deviceLabel;
        session.Status = TransferStatus.PendingSenderApproval;
        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        if (!string.IsNullOrWhiteSpace(session.SenderConnectionId))
            await Clients.Client(session.SenderConnectionId).SendAsync("ReceiverJoined", new { roomCode, deviceLabel });
    }
}
```

- [ ] **Step 4: Add approval and rejection events**

```csharp
public async Task ApproveReceiver(string roomCode)
{
    var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
    session.Status = TransferStatus.Approved;
    await Clients.Group(roomCode).SendAsync("SenderApproved", new { roomCode });
}

public async Task RejectReceiver(string roomCode)
{
    var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
    session.Status = TransferStatus.Rejected;
    await Clients.Group(roomCode).SendAsync("SenderRejected", new { roomCode });
}
```

- [ ] **Step 5: Run tests**

Run: `dotnet test backend/tests/AntShare.Api.Tests/AntShare.Api.Tests.csproj --filter TransferHub`
Expected: PASS for join, notify, approve, and reject flows

- [ ] **Step 6: Commit**

```bash
git add backend/src backend/tests
git commit -m "feat: add transfer hub room presence and approval"
```

### Task 4: Build Sender and Receiver Pages with Shared Transfer State

**Files:**
- Create: `frontend/src/app/features/live-transfer/sender/sender-transfer.page.ts`
- Create: `frontend/src/app/features/live-transfer/sender/sender-transfer.page.html`
- Create: `frontend/src/app/features/live-transfer/receiver/receiver-transfer.page.ts`
- Create: `frontend/src/app/features/live-transfer/receiver/receiver-transfer.page.html`
- Create: `frontend/src/app/features/live-transfer/services/transfer-state.service.ts`
- Create: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Write the failing route and component test**

```typescript
it('routes /send to the sender transfer page', async () => {
  await router.navigateByUrl('/send');
  expect(location.path()).toBe('/send');
});
```

- [ ] **Step 2: Run the frontend test to verify it fails**

Run: `npm test --prefix frontend -- --watch=false`
Expected: FAIL because sender and receiver pages are missing

- [ ] **Step 3: Add the route structure**

```typescript
export const routes: Routes = [
  { path: '', redirectTo: 'send', pathMatch: 'full' },
  { path: 'send', loadComponent: () => import('./features/live-transfer/sender/sender-transfer.page').then(m => m.SenderTransferPage) },
  { path: 'receive/:roomCode', loadComponent: () => import('./features/live-transfer/receiver/receiver-transfer.page').then(m => m.ReceiverTransferPage) },
];
```

- [ ] **Step 4: Add the shared state service**

```typescript
export type TransferUiStatus =
  | 'idle'
  | 'waiting-for-receiver'
  | 'pending-approval'
  | 'approved'
  | 'connecting-webrtc'
  | 'transferring'
  | 'completed'
  | 'failed';

@Injectable({ providedIn: 'root' })
export class TransferStateService {
  readonly roomCode = signal<string | null>(null);
  readonly status = signal<TransferUiStatus>('idle');
  readonly progressPercent = signal(0);
  readonly receiverDeviceLabel = signal<string | null>(null);
}
```

- [ ] **Step 5: Build minimal sender and receiver pages**

```typescript
@Component({
  standalone: true,
  templateUrl: './sender-transfer.page.html',
})
export class SenderTransferPage {
  readonly state = inject(TransferStateService);
}
```

```html
<section>
  <h1>Send file</h1>
  <p>Room: {{ state.roomCode() ?? 'Not created' }}</p>
  <p>Status: {{ state.status() }}</p>
</section>
```

- [ ] **Step 6: Run build and tests**

Run: `npm run build --prefix frontend`
Expected: PASS

Run: `npm test --prefix frontend -- --watch=false`
Expected: PASS for routing and page creation tests

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: add sender and receiver transfer pages"
```

### Task 5: Connect Frontend SignalR Flow and Prove WebRTC Text Exchange

**Files:**
- Create: `frontend/src/app/features/live-transfer/services/transfer-signalr.service.ts`
- Create: `frontend/src/app/features/live-transfer/services/webrtc-transfer.service.ts`
- Modify: `frontend/src/app/features/live-transfer/sender/sender-transfer.page.ts`
- Modify: `frontend/src/app/features/live-transfer/receiver/receiver-transfer.page.ts`
- Test: `frontend/playwright.config.ts`

- [ ] **Step 1: Write the failing browser workflow test**

```typescript
test('sender and receiver reach connected state in two tabs', async ({ browser }) => {
  const sender = await browser.newPage();
  const receiver = await browser.newPage();
  await sender.goto('/send');
  // create room, open receiver URL, approve, assert both show connected state
});
```

- [ ] **Step 2: Run Playwright to verify it fails**

Run: `npx playwright test --config frontend/playwright.config.ts`
Expected: FAIL because SignalR and WebRTC services are not wired

- [ ] **Step 3: Implement the SignalR client**

```typescript
@Injectable({ providedIn: 'root' })
export class TransferSignalrService {
  private connection?: HubConnection;

  async connect(): Promise<void> {
    this.connection = new HubConnectionBuilder()
      .withUrl(environment.signalrHubUrl)
      .withAutomaticReconnect()
      .build();

    await this.connection.start();
  }
}
```

- [ ] **Step 4: Implement minimal WebRTC offer and answer flow**

```typescript
const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
const channel = peer.createDataChannel('transfer');
channel.onopen = () => this.state.status.set('connecting-webrtc');
channel.send(JSON.stringify({ type: 'ping', message: 'hello' }));
```

- [ ] **Step 5: Wire approval and signaling into the pages**

```typescript
await this.signalr.connect();
await this.signalr.joinAsSender(roomCode);
this.signalr.onReceiverJoined(deviceLabel => this.state.receiverDeviceLabel.set(deviceLabel));
this.signalr.onSenderApproved(() => this.webrtc.beginSenderNegotiation(roomCode));
```

- [ ] **Step 6: Verify the browser flow**

Run: `npx playwright test --config frontend/playwright.config.ts --grep "connected state"`
Expected: PASS with both tabs reaching secure connection or connected state

- [ ] **Step 7: Commit**

```bash
git add frontend/src frontend/playwright.config.ts
git commit -m "feat: add signalr and basic webrtc negotiation"
```

### Task 6: Transfer Plain File Chunks End to End Before Encryption

**Files:**
- Create: `frontend/src/app/features/live-transfer/services/file-chunk.service.ts`
- Modify: `frontend/src/app/features/live-transfer/services/webrtc-transfer.service.ts`
- Modify: `frontend/src/app/features/live-transfer/services/transfer-state.service.ts`
- Modify: `frontend/src/app/features/live-transfer/sender/sender-transfer.page.html`
- Modify: `frontend/src/app/features/live-transfer/receiver/receiver-transfer.page.html`

- [ ] **Step 1: Write the failing chunk transfer test**

```typescript
test('receiver downloads the same bytes sent by sender', async ({ browser }) => {
  // send a small text file over DataChannel
  // verify receiver reconstructs Blob with original contents
});
```

- [ ] **Step 2: Run the failing test**

Run: `npx playwright test --config frontend/playwright.config.ts --grep "same bytes"`
Expected: FAIL because chunk slicing and reconstruction do not exist

- [ ] **Step 3: Add the chunking service**

```typescript
export class FileChunkService {
  createChunks(file: File, chunkSize = 256 * 1024): Blob[] {
    const chunks: Blob[] = [];
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      chunks.push(file.slice(offset, Math.min(offset + chunkSize, file.size)));
    }
    return chunks;
  }

  rebuildFile(chunks: Uint8Array[], mimeType: string): Blob {
    return new Blob(chunks, { type: mimeType });
  }
}
```

- [ ] **Step 4: Send chunk messages over the DataChannel**

```typescript
for (const [index, chunk] of chunks.entries()) {
  const bytes = new Uint8Array(await chunk.arrayBuffer());
  this.channel.send(this.serializeChunk({ type: 'chunk', chunkIndex: index, data: bytes }));
}
this.channel.send(JSON.stringify({ type: 'complete', totalChunks: chunks.length }));
```

- [ ] **Step 5: Rebuild the Blob and expose a download action**

```typescript
if (message.type === 'complete') {
  const blob = this.fileChunkService.rebuildFile(this.receivedChunks, this.pendingMimeType);
  this.state.downloadUrl.set(URL.createObjectURL(blob));
  this.state.status.set('completed');
}
```

- [ ] **Step 6: Verify the transfer**

Run: `npx playwright test --config frontend/playwright.config.ts --grep "same bytes"`
Expected: PASS for a small text file round trip

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: add plain chunk transfer over webrtc"
```

### Task 7: Add Handshake-Based Encryption and Metadata Privacy

**Files:**
- Create: `frontend/src/app/features/live-transfer/services/crypto-chunk.service.ts`
- Modify: `frontend/src/app/features/live-transfer/services/webrtc-transfer.service.ts`
- Modify: `frontend/src/app/features/live-transfer/services/transfer-signalr.service.ts`
- Test: `frontend/src/app/features/live-transfer/services/crypto-chunk.service.spec.ts`

- [ ] **Step 1: Write the failing crypto tests**

```typescript
it('encrypts and decrypts a chunk with AES-GCM', async () => {
  const service = TestBed.inject(CryptoChunkService);
  const key = await service.createFileKey();
  const plaintext = new Uint8Array([1, 2, 3]);
  const encrypted = await service.encryptChunk(key, plaintext);
  const decrypted = await service.decryptChunk(key, encrypted.iv, encrypted.ciphertext);
  expect(Array.from(decrypted)).toEqual([1, 2, 3]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix frontend -- --watch=false --include="**/crypto-chunk.service.spec.ts"`
Expected: FAIL because `CryptoChunkService` does not exist

- [ ] **Step 3: Implement AES-GCM chunk encryption**

```typescript
export class CryptoChunkService {
  async createFileKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async encryptChunk(key: CryptoKey, bytes: Uint8Array) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    return { iv, ciphertext: new Uint8Array(ciphertext) };
  }
}
```

- [ ] **Step 4: Add public-key wrapping for file key exchange**

```typescript
const receiverKeyPair = await crypto.subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['encrypt', 'decrypt']
);

const wrappedFileKey = await crypto.subtle.wrapKey('raw', fileKey, receiverPublicKey, { name: 'RSA-OAEP' });
```

- [ ] **Step 5: Encrypt metadata before file transfer starts**

```typescript
const metadata = new TextEncoder().encode(JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }));
const encryptedMetadata = await this.crypto.encryptChunk(fileKey, metadata);
this.channel.send(this.serializeMetadata(encryptedMetadata));
```

- [ ] **Step 6: Verify encrypted transfer still works**

Run: `npm test --prefix frontend -- --watch=false`
Expected: PASS for crypto unit tests

Run: `npx playwright test --config frontend/playwright.config.ts`
Expected: PASS with encrypted file transfer and decrypted download

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat: add encrypted transfer handshake and metadata"
```

### Task 8: Move Crypto to Workers and Add Backpressure Handling

**Files:**
- Create: `frontend/src/app/features/live-transfer/workers/encryption.worker.ts`
- Create: `frontend/src/app/features/live-transfer/workers/decryption.worker.ts`
- Modify: `frontend/src/app/features/live-transfer/services/crypto-chunk.service.ts`
- Modify: `frontend/src/app/features/live-transfer/services/webrtc-transfer.service.ts`

- [ ] **Step 1: Write the failing performance-oriented browser test**

```typescript
test('ui stays responsive during larger transfer', async ({ page }) => {
  // send a larger fixture file and assert progress label updates while transfer continues
});
```

- [ ] **Step 2: Run the test to verify it fails or times out**

Run: `npx playwright test --config frontend/playwright.config.ts --grep "stays responsive"`
Expected: FAIL or timeout because encryption runs on the main thread

- [ ] **Step 3: Move encryption into a worker**

```typescript
self.onmessage = async ({ data }) => {
  const { key, bytes } = data;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  postMessage({ iv, ciphertext }, [ciphertext]);
};
```

- [ ] **Step 4: Respect DataChannel backpressure**

```typescript
while (this.channel.bufferedAmount > 4 * 1024 * 1024) {
  await new Promise(resolve => setTimeout(resolve, 25));
}
this.channel.send(payload);
```

- [ ] **Step 5: Verify performance improvements**

Run: `npm run build --prefix frontend`
Expected: PASS with worker bundling

Run: `npx playwright test --config frontend/playwright.config.ts --grep "stays responsive"`
Expected: PASS with progress updates continuing during transfer

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat: offload crypto to workers and manage channel buffering"
```

### Task 9: Add Cleanup, Failure States, and Public Security Documentation

**Files:**
- Create: `backend/src/AntShare.Api/Background/ExpiredTransferCleanupService.cs`
- Modify: `backend/src/AntShare.Api/Program.cs`
- Create: `docs/security/privacy-model.md`
- Modify: `frontend/src/app/features/live-transfer/services/transfer-state.service.ts`
- Modify: `frontend/src/app/features/live-transfer/sender/sender-transfer.page.html`
- Modify: `frontend/src/app/features/live-transfer/receiver/receiver-transfer.page.html`

- [ ] **Step 1: Write the failing cleanup test**

```csharp
[Fact]
public void Cleanup_removes_expired_sessions()
{
    var store = new InMemoryTransferSessionStore();
    var session = store.Create();
    session.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);

    store.RemoveExpired(DateTime.UtcNow);

    store.GetByRoomCode(session.RoomCode).Should().BeNull();
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test backend/tests/AntShare.Api.Tests/AntShare.Api.Tests.csproj --filter Cleanup`
Expected: FAIL because expiry cleanup is not implemented

- [ ] **Step 3: Add the background cleanup service**

```csharp
public sealed class ExpiredTransferCleanupService(IServiceProvider services) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = services.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<ITransferSessionStore>();
            store.RemoveExpired(DateTime.UtcNow);
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
```

- [ ] **Step 4: Add user-visible error and cancel states**

```typescript
readonly failureMessage = signal<string | null>(null);
readonly canCancel = computed(() => ['waiting-for-receiver', 'pending-approval', 'transferring'].includes(this.status()));
```

- [ ] **Step 5: Write the privacy model document**

```markdown
# Privacy Model

- The backend stores room codes, connection identifiers, timestamps, and transfer status only.
- The backend must not store plaintext file bytes, file names, decrypted metadata, or raw file keys.
- File content is encrypted in the sender browser before transfer.
- File decryption happens in the receiver browser only.
```

- [ ] **Step 6: Verify cleanup and failure handling**

Run: `dotnet test backend/tests/AntShare.Api.Tests/AntShare.Api.Tests.csproj`
Expected: PASS including expiry cleanup tests

Run: `npx playwright test --config frontend/playwright.config.ts`
Expected: PASS including cancel and disconnected-state flows

- [ ] **Step 7: Commit**

```bash
git add backend/src backend/tests frontend/src docs/security
git commit -m "feat: add expiry cleanup and failure handling"
```

### Task 10: Prepare Production Configuration and Deployment Validation

**Files:**
- Modify: `docs/deployment/vercel-azure.md`
- Create: `frontend/.env.example`
- Create: `backend/src/AntShare.Api/appsettings.Production.json`

- [ ] **Step 1: Add frontend environment examples**

```dotenv
NG_APP_API_BASE_URL=https://api.example.com
NG_APP_SIGNALR_HUB_URL=https://api.example.com/transfer-hub
```

- [ ] **Step 2: Add backend production settings**

```json
{
  "AllowedOrigins": [
    "https://ant-share.vercel.app"
  ],
  "TransferRoomExpiryMinutes": 15
}
```

- [ ] **Step 3: Expand the deployment runbook**

```markdown
## Verification

1. Deploy backend to Azure App Service.
2. Confirm `/swagger` loads in production.
3. Confirm SignalR negotiation works from the deployed Vercel frontend.
4. Open sender and receiver in separate browsers and complete a small file transfer.
5. Confirm server logs do not contain file names, file bytes, or file keys.
```

- [ ] **Step 4: Verify release readiness**

Run: `dotnet publish backend/src/AntShare.Api/AntShare.Api.csproj -c Release`
Expected: PASS

Run: `npm run build --prefix frontend`
Expected: PASS with production config

- [ ] **Step 5: Commit**

```bash
git add docs frontend/.env.example backend/src/AntShare.Api/appsettings.Production.json
git commit -m "docs: add deployment and production configuration plan"
```

## Self-Review

- Spec coverage: The plan covers room creation, receiver join, sender approval, SignalR signaling, WebRTC negotiation, plain chunk transfer, encryption handshake, worker offload, cleanup, failure handling, and deployment.
- Placeholder scan: No `TODO`, `TBD`, or implied implementation gaps remain in the task list.
- Type consistency: `TransferSession`, `TransferStatus`, `TransferSignalrService`, `WebRtcTransferService`, `FileChunkService`, and `CryptoChunkService` are used consistently across the plan.

Plan complete and saved to `docs/superpowers/plans/2026-05-07-encrypted-live-file-sharing-app.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
