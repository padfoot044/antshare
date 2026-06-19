using AntShare.Api.Transfers;

namespace AntShare.Api.Background;

public sealed class ExpiredTransferCleanupService(IServiceProvider services) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = services.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<ITransferSessionStore>();
            store.RemoveExpired(DateTime.UtcNow);
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }
    }
}
