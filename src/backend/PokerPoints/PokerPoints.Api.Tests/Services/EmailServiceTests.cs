using System.Net.Mail;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using PokerPoints.Api.Authentication;
using PokerPoints.Api.Services;
using Xunit;

namespace PokerPoints.Api.Tests.Services;

public class EmailServiceTests
{
    [Theory]
    [InlineData(false, "verify-email", "24 hours")]
    [InlineData(true, "reset-password", "60 minutes")]
    public async Task AccountEmails_EmbedScoutAndPreserveLinksAndPlainText(bool reset, string route, string expiry)
    {
        var service = new EmailService(Options.Create(new EmailConfiguration
        {
            FromAddress = "hello@example.test",
            BaseUrl = "https://example.test"
        }), NullLogger<EmailService>.Instance);
        using var message = reset
            ? service.CreatePasswordResetEmail("member@example.test", "Alex <Team>", "a+b/c=?&")
            : service.CreateVerificationEmail("member@example.test", "Alex <Team>", "a+b/c=?&");
        var expectedUrl = $"https://example.test/{route}?token=a%2Bb%2Fc%3D%3F%26";
        Assert.Contains("Estimagator", message.Subject);
        Assert.Equal("Estimagator", message.From!.DisplayName);
        Assert.Contains(expectedUrl, message.Body);
        Assert.Contains(expiry, message.Body);
        Assert.False(message.IsBodyHtml);
        var view = Assert.Single(message.AlternateViews);
        using var reader = new StreamReader(view.ContentStream, Encoding.UTF8, leaveOpen: true);
        var html = await reader.ReadToEndAsync();
        view.ContentStream.Position = 0;
        Assert.Contains("Alex &lt;Team&gt;", html);
        Assert.Contains(expectedUrl, html);
        Assert.Contains(expiry, html);
        Assert.Contains("#47772C", html);
        Assert.DoesNotContain("🐊", html);
        var logo = Assert.Single(view.LinkedResources);
        Assert.Equal("image/png", logo.ContentType.MediaType);
        Assert.Contains($"src=\"cid:{logo.ContentId}\"", html);
        var signature = new byte[8];
        await logo.ContentStream.ReadExactlyAsync(signature);
        Assert.Equal(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }, signature);
        logo.ContentStream.Position = 0;

        // Exercise MIME serialization without sending to an SMTP server or real recipient.
        var directory = Path.Combine(Path.GetTempPath(), $"estimagator-email-{Guid.NewGuid()}");
        Directory.CreateDirectory(directory);
        try
        {
            using var client = new SmtpClient
            {
                DeliveryMethod = SmtpDeliveryMethod.SpecifiedPickupDirectory,
                PickupDirectoryLocation = directory
            };
            await client.SendMailAsync(message);
            var mime = await File.ReadAllTextAsync(Assert.Single(Directory.GetFiles(directory)));
            Assert.Contains("multipart/alternative", mime);
            Assert.Contains("multipart/related", mime);
            Assert.Contains("Content-ID: <estimagator-scout>", mime, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("image/png", mime);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task AccountEmails_StillSupportDevelopmentWithoutSmtpConfiguration()
    {
        var service = new EmailService(Options.Create(new EmailConfiguration()), NullLogger<EmailService>.Instance);
        await service.SendVerificationEmailAsync("member@example.test", "Alex", "token");
        await service.SendPasswordResetEmailAsync("member@example.test", "Alex", "token");
    }
}
