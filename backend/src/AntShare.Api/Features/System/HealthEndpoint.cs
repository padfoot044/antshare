using FastEndpoints;

namespace AntShare.Api.Features.System;

public sealed class HealthEndpoint : EndpointWithoutRequest
{
    public override void Configure()
    {
        Get("/health");
        AllowAnonymous();
    }

    public override Task HandleAsync(CancellationToken ct)
    {
        HttpContext.Response.StatusCode = StatusCodes.Status200OK;
        return HttpContext.Response.WriteAsJsonAsync(new { status = "ok" }, ct);
    }
}
