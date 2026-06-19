using System.Net;
using System.Net.Http.Json;
using FluentAssertions;

namespace AntShare.Api.Tests;

public class JoinTransferEndpointTests(TestWebApplicationFactory factory) : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Join_marks_room_as_pending_approval()
    {
        var create = await _client.PostAsJsonAsync("/api/transfers", new { });
        var created = await create.Content.ReadFromJsonAsync<CreateTransferResponse>();
        created.Should().NotBeNull();

        var join = await _client.PostAsJsonAsync(
            $"/api/transfers/{created!.RoomCode}/join",
            new { DeviceLabel = "Chrome on Windows", ReceiverPublicKey = "key" });

        join.StatusCode.Should().Be(HttpStatusCode.OK);
        var joinPayload = await join.Content.ReadFromJsonAsync<JoinTransferResponse>();
        joinPayload!.Status.Should().Be("PendingSenderApproval");
    }

    [Fact]
    public async Task Cancel_marks_room_as_cancelled()
    {
        var create = await _client.PostAsJsonAsync("/api/transfers", new { });
        var created = await create.Content.ReadFromJsonAsync<CreateTransferResponse>();
        var cancel = await _client.PostAsync($"/api/transfers/{created!.RoomCode}/cancel", null);

        cancel.StatusCode.Should().Be(HttpStatusCode.OK);
        var payload = await cancel.Content.ReadFromJsonAsync<CancelTransferResponse>();
        payload!.Status.Should().Be("Cancelled");
    }

    public sealed record CreateTransferResponse(string TransferId, string RoomCode, string Status, DateTime ExpiresAtUtc);
    public sealed record JoinTransferResponse(string TransferId, string RoomCode, string Status);
    public sealed record CancelTransferResponse(string RoomCode, string Status, DateTime CancelledAtUtc);
}
