using System.Net;
using System.Net.Http.Json;
using FluentAssertions;

namespace AntShare.Api.Tests;

public class CreateTransferEndpointTests(TestWebApplicationFactory factory) : IClassFixture<TestWebApplicationFactory>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Fact]
    public async Task Post_transfers_creates_waiting_room()
    {
        var response = await _client.PostAsJsonAsync("/api/transfers", new { });
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var payload = await response.Content.ReadFromJsonAsync<CreateTransferResponse>();
        payload.Should().NotBeNull();
        payload!.RoomCode.Should().NotBeNullOrWhiteSpace();
        payload.Status.Should().Be("WaitingForReceiver");
    }

    public sealed record CreateTransferResponse(string TransferId, string RoomCode, string Status, DateTime ExpiresAtUtc);
}
