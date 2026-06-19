using AntShare.Api.Transfers;

namespace AntShare.Api.Features.Transfers;

public sealed record CreateTransferResponse(Guid TransferId, string RoomCode, string Status, DateTime ExpiresAtUtc);
public sealed record GetTransferResponse(Guid TransferId, string RoomCode, string Status, DateTime ExpiresAtUtc);
public sealed record JoinTransferRequest(string DeviceLabel, string? ReceiverPublicKey);
public sealed record JoinTransferResponse(Guid TransferId, string RoomCode, string Status);
public sealed record CancelTransferResponse(string RoomCode, string Status, DateTime CancelledAtUtc);

public static class TransferDtoMapper
{
    public static CreateTransferResponse ToCreateResponse(this TransferSession session) =>
        new(session.Id, session.RoomCode, session.Status.ToString(), session.ExpiresAtUtc);

    public static GetTransferResponse ToGetResponse(this TransferSession session) =>
        new(session.Id, session.RoomCode, session.Status.ToString(), session.ExpiresAtUtc);
}
