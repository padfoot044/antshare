namespace AntShare.Api.Transfers;

public enum TransferStatus
{
    WaitingForReceiver = 0,
    PendingSenderApproval = 1,
    Approved = 2,
    Rejected = 3,
    Cancelled = 4,
    Completed = 5,
    Failed = 6,
    Expired = 7
}
