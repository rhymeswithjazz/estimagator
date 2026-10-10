using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using Microsoft.Extensions.Options;
using PokerPoints.Api.Authentication;

namespace PokerPoints.Api.Services;

public interface IEmailService
{
    Task SendVerificationEmailAsync(string toEmail, string displayName, string token);
    Task SendPasswordResetEmailAsync(string toEmail, string displayName, string token);
}

public class EmailService : IEmailService
{
    private readonly EmailConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IOptions<EmailConfiguration> config, ILogger<EmailService> logger)
    {
        _config = config.Value;
        _logger = logger;
    }

    public async Task SendVerificationEmailAsync(string toEmail, string displayName, string token)
    {
        using var message = CreateVerificationEmail(toEmail, displayName, token);
        await SendEmailAsync(message);
    }

    internal MailMessage CreateVerificationEmail(string toEmail, string displayName, string token)
    {
        var verificationUrl = $"{_config.BaseUrl}/verify-email?token={Uri.EscapeDataString(token)}";

        var subject = "Verify your Estimagator account";
        var htmlBody = $"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    {BrandHeader}
                </div>

                <div style="background: #F4F8EF; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
                    <h2 style="margin-top: 0;">Welcome, {WebUtility.HtmlEncode(displayName)}!</h2>
                    <p>Thanks for signing up for Estimagator. Please verify your email address to get started.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{verificationUrl}" style="background: #47772C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
                    </div>

                    <p style="font-size: 14px; color: #666;">This link will expire in {_config.VerificationTokenExpirationHours} hours.</p>
                </div>

                <div style="font-size: 12px; color: #999; text-align: center;">
                    <p>If you didn't create an account, you can safely ignore this email.</p>
                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all;">{verificationUrl}</p>
                </div>
            </body>
            </html>
            """;

        var textBody = $"""
            Welcome to Estimagator, {displayName}!

            Thanks for signing up. Please verify your email address by visiting:
            {verificationUrl}

            This link will expire in {_config.VerificationTokenExpirationHours} hours.

            If you didn't create an account, you can safely ignore this email.
            """;

        return CreateMessage(toEmail, subject, htmlBody, textBody);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string displayName, string token)
    {
        using var message = CreatePasswordResetEmail(toEmail, displayName, token);
        await SendEmailAsync(message);
    }

    internal MailMessage CreatePasswordResetEmail(string toEmail, string displayName, string token)
    {
        var resetUrl = $"{_config.BaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";

        var subject = "Reset your Estimagator password";
        var htmlBody = $"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    {BrandHeader}
                </div>

                <div style="background: #F4F8EF; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
                    <h2 style="margin-top: 0;">Password Reset Request</h2>
                    <p>Hi {WebUtility.HtmlEncode(displayName)},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{resetUrl}" style="background: #47772C; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
                    </div>

                    <p style="font-size: 14px; color: #666;">This link will expire in {_config.PasswordResetTokenExpirationMinutes} minutes.</p>
                </div>

                <div style="font-size: 12px; color: #999; text-align: center;">
                    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
                    <p>If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all;">{resetUrl}</p>
                </div>
            </body>
            </html>
            """;

        var textBody = $"""
            Reset your Estimagator password

            Hi {displayName},

            We received a request to reset your password. Visit the link below to create a new password:
            {resetUrl}

            This link will expire in {_config.PasswordResetTokenExpirationMinutes} minutes.

            If you didn't request a password reset, you can safely ignore this email.
            """;

        return CreateMessage(toEmail, subject, htmlBody, textBody);
    }

    private const string LogoContentId = "estimagator-scout";
    private const string BrandHeader = """
        <img src="cid:estimagator-scout" width="102" height="96" alt="Estimagator Scout alligator logo" style="display: block; width: 102px; height: 96px; margin: 0 auto 12px; border: 0;">
        <h1 style="font-family: 'Segoe UI', Arial, sans-serif; font-size: 28px; font-weight: 700; letter-spacing: -1px; color: #233D22; margin: 0;">Estima<span style="color: #47772C;">gator</span></h1>
        <p style="color: #666; margin-top: 5px;">Bite-sized estimation for agile teams</p>
        """;

    private MailMessage CreateMessage(string toEmail, string subject, string htmlBody, string textBody)
    {
        var message = new MailMessage
        {
            Subject = subject,
            SubjectEncoding = Encoding.UTF8,
            Body = textBody,
            BodyEncoding = Encoding.UTF8,
            IsBodyHtml = false
        };
        if (!string.IsNullOrEmpty(_config.FromAddress))
            message.From = new MailAddress(_config.FromAddress, _config.FromName);
        message.To.Add(new MailAddress(toEmail));
        var htmlView = AlternateView.CreateAlternateViewFromString(htmlBody, Encoding.UTF8, MediaTypeNames.Text.Html);
        // Embed the PNG so the logo works without remote image downloads or SVG support.
        var logoStream = typeof(EmailService).Assembly.GetManifestResourceStream("Estimagator.Brand.Logo.png")
            ?? throw new InvalidOperationException("The Estimagator email logo resource is missing.");
        htmlView.LinkedResources.Add(new LinkedResource(logoStream, MediaTypeNames.Image.Png)
        {
            ContentId = LogoContentId,
            TransferEncoding = TransferEncoding.Base64
        });
        message.AlternateViews.Add(htmlView);
        return message;
    }

    private async Task SendEmailAsync(MailMessage message)
    {
        if (string.IsNullOrEmpty(_config.SmtpHost))
        {
            _logger.LogWarning("SMTP not configured. Email would have been sent to {Email} with subject: {Subject}", message.To[0].Address, message.Subject);
            _logger.LogDebug("Email body:\n{Body}", message.Body);
            return;
        }

        using var client = new SmtpClient(_config.SmtpHost, _config.SmtpPort);
        client.EnableSsl = _config.UseSsl;
        client.Credentials = new NetworkCredential(_config.SmtpUsername, _config.SmtpPassword);

        try
        {
            await client.SendMailAsync(message);
            _logger.LogInformation("Email sent successfully to {Email}", message.To[0].Address);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Email}", message.To[0].Address);
            throw;
        }
    }
}
