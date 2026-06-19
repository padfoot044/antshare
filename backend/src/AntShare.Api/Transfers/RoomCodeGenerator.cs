using System.Security.Cryptography;

namespace AntShare.Api.Transfers;

internal static class RoomCodeGenerator
{
    private const string AllowedChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    public static string Create(int length = 8)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = AllowedChars[RandomNumberGenerator.GetInt32(AllowedChars.Length)];
        }

        return new string(chars);
    }
}
