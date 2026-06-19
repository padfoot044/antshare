using AntShare.Api.Transfers;
using Microsoft.AspNetCore.SignalR;

namespace AntShare.Api.Hubs;

public sealed class TransferHub(ITransferSessionStore store) : Hub
{
    public async Task JoinAsSender(string roomCode)
    {
        var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
        session.SenderConnectionId = Context.ConnectionId;
        store.Update(session);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        await Clients.Caller.SendAsync("RoomState", new { roomCode, status = session.Status.ToString() });
    }

    public async Task JoinAsReceiver(string roomCode, string deviceLabel)
    {
        var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
        session.ReceiverConnectionId = Context.ConnectionId;
        session.ReceiverDeviceLabel = deviceLabel;
        session.Status = TransferStatus.PendingSenderApproval;
        store.Update(session);

        await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);
        if (!string.IsNullOrWhiteSpace(session.SenderConnectionId))
        {
            await Clients.Client(session.SenderConnectionId).SendAsync("ReceiverJoined", new { roomCode, deviceLabel });
        }
    }

    public async Task ApproveReceiver(string roomCode)
    {
        var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
        session.Status = TransferStatus.Approved;
        store.Update(session);

        await Clients.Group(roomCode).SendAsync("SenderApproved", new { roomCode });
    }

    public async Task RejectReceiver(string roomCode)
    {
        var session = store.GetByRoomCode(roomCode) ?? throw new HubException("Room not found.");
        session.Status = TransferStatus.Rejected;
        store.Update(session);

        await Clients.Group(roomCode).SendAsync("SenderRejected", new { roomCode });
    }

    public Task RelayWebRtcOffer(string roomCode, string offerJson) =>
        Clients.OthersInGroup(roomCode).SendAsync("WebRtcOffer", offerJson);

    public Task RelayWebRtcAnswer(string roomCode, string answerJson) =>
        Clients.OthersInGroup(roomCode).SendAsync("WebRtcAnswer", answerJson);

    public Task RelayIceCandidate(string roomCode, string candidateJson) =>
        Clients.OthersInGroup(roomCode).SendAsync("IceCandidate", candidateJson);

    public Task RelayFallbackChunk(string roomCode, string chunkJson) =>
        Clients.OthersInGroup(roomCode).SendAsync("WebRtcChunkFallback", chunkJson);

    public Task StartHandshake(string roomCode, object payload) =>
        Clients.OthersInGroup(roomCode).SendAsync("HandshakeStarted", payload);

    public Task CompleteHandshake(string roomCode, object payload) =>
        Clients.OthersInGroup(roomCode).SendAsync("HandshakeCompleted", payload);
}
