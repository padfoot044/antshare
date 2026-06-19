namespace AntShare.Api.Transfers;

public sealed class TransferSession
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string RoomCode { get; init; } = string.Empty;
    public TransferStatus Status { get; set; } = TransferStatus.WaitingForReceiver;
    public string? SenderConnectionId { get; set; }
    public string? ReceiverConnectionId { get; set; }
    public string? ReceiverDeviceLabel { get; set; }
    public DateTime CreatedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow.AddMinutes(15);
    public DateTime? CancelledAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
}
