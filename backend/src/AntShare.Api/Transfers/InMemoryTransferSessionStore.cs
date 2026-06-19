using System.Collections.Concurrent;

namespace AntShare.Api.Transfers;

public sealed class InMemoryTransferSessionStore : ITransferSessionStore
{
    private readonly ConcurrentDictionary<string, TransferSession> _sessions = new(StringComparer.OrdinalIgnoreCase);

    public TransferSession Create()
    {
        TransferSession session;
        do
        {
            session = new TransferSession
            {
                RoomCode = RoomCodeGenerator.Create(),
                ExpiresAtUtc = DateTime.UtcNow.AddMinutes(15)
            };
        } while (!_sessions.TryAdd(session.RoomCode, session));

        return session;
    }

    public TransferSession? GetByRoomCode(string roomCode) =>
        _sessions.TryGetValue(roomCode, out var session) ? session : null;

    public IReadOnlyCollection<TransferSession> GetAll() => _sessions.Values.ToArray();

    public bool Update(TransferSession session)
    {
        if (string.IsNullOrWhiteSpace(session.RoomCode))
        {
            return false;
        }

        _sessions[session.RoomCode] = session;
        return true;
    }

    public bool Cancel(string roomCode)
    {
        if (!_sessions.TryGetValue(roomCode, out var session))
        {
            return false;
        }

        session.Status = TransferStatus.Cancelled;
        session.CancelledAtUtc = DateTime.UtcNow;
        session.ExpiresAtUtc = DateTime.UtcNow;
        return true;
    }

    public void RemoveExpired(DateTime utcNow)
    {
        foreach (var pair in _sessions)
        {
            if (pair.Value.ExpiresAtUtc > utcNow)
            {
                continue;
            }

            _sessions.TryRemove(pair.Key, out _);
        }
    }
}
