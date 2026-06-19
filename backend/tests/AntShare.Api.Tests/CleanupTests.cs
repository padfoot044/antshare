using AntShare.Api.Transfers;
using FluentAssertions;

namespace AntShare.Api.Tests;

public class CleanupTests
{
    [Fact]
    public void Cleanup_removes_expired_sessions()
    {
        var store = new InMemoryTransferSessionStore();
        var session = store.Create();
        session.ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-1);
        store.Update(session);

        store.RemoveExpired(DateTime.UtcNow);
        store.GetByRoomCode(session.RoomCode).Should().BeNull();
    }
}
