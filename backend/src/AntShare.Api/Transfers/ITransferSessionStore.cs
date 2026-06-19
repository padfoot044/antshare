namespace AntShare.Api.Transfers;

public interface ITransferSessionStore
{
    TransferSession Create();
    TransferSession? GetByRoomCode(string roomCode);
    IReadOnlyCollection<TransferSession> GetAll();
    bool Update(TransferSession session);
    bool Cancel(string roomCode);
    void RemoveExpired(DateTime utcNow);
}
