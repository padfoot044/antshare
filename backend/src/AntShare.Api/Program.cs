using AntShare.Api.Background;
using AntShare.Api.Features.Transfers;
using AntShare.Api.Hubs;
using AntShare.Api.Transfers;
using FastEndpoints;
using FastEndpoints.Swagger;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddFastEndpoints()
    .SwaggerDocument();

builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 1024 * 1024; // 1 MB
});
builder.Services.AddSingleton<ITransferSessionStore, InMemoryTransferSessionStore>();
builder.Services.AddHostedService<ExpiredTransferCleanupService>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .SetIsOriginAllowed(_ => true)
            .AllowCredentials());
});

var app = builder.Build();

app.UseCors();
app.UseFastEndpoints();
app.UseOpenApi();
app.UseSwaggerUi();
app.MapHub<TransferHub>("/transfer-hub");

app.MapPost("/api/transfers", (ITransferSessionStore store) =>
{
    var session = store.Create();
    return Results.Ok(session.ToCreateResponse());
});

app.MapGet("/api/transfers/{roomCode}", (string roomCode, ITransferSessionStore store) =>
{
    var session = store.GetByRoomCode(roomCode);
    return session is null ? Results.NotFound() : Results.Ok(session.ToGetResponse());
});

app.MapPost("/api/transfers/{roomCode}/join", (string roomCode, JoinTransferRequest request, ITransferSessionStore store) =>
{
    var session = store.GetByRoomCode(roomCode);
    if (session is null) return Results.NotFound();

    session.Status = TransferStatus.PendingSenderApproval;
    session.ReceiverDeviceLabel = request.DeviceLabel;
    store.Update(session);
    return Results.Ok(new JoinTransferResponse(session.Id, session.RoomCode, session.Status.ToString()));
});

app.MapPost("/api/transfers/{roomCode}/cancel", (string roomCode, ITransferSessionStore store) =>
{
    var cancelled = store.Cancel(roomCode);
    if (!cancelled) return Results.NotFound();

    var session = store.GetByRoomCode(roomCode)!;
    return Results.Ok(new CancelTransferResponse(session.RoomCode, session.Status.ToString(), session.CancelledAtUtc ?? DateTime.UtcNow));
});

app.Run();

public partial class Program;
