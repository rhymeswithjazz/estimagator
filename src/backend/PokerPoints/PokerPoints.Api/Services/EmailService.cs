using System.Net;
using System.Net.Mail;
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
                    <h1 style="color: #059669; margin: 0;">🐊 Estimagator</h1>
                    <p style="color: #666; margin-top: 5px;">Bite-sized estimation for agile teams</p>
                </div>

                <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
                    <h2 style="margin-top: 0;">Welcome, {WebUtility.HtmlEncode(displayName)}!</h2>
                    <p>Thanks for signing up for Estimagator. Please verify your email address to get started.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{verificationUrl}" style="background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email Address</a>
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

        await SendEmailAsync(toEmail, subject, htmlBody, textBody);
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string displayName, string token)
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
                    <h1 style="color: #059669; margin: 0;">🐊 Estimagator</h1>
                    <p style="color: #666; margin-top: 5px;">Bite-sized estimation for agile teams</p>
                </div>

                <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
                    <h2 style="margin-top: 0;">Password Reset Request</h2>
                    <p>Hi {WebUtility.HtmlEncode(displayName)},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password.</p>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="{resetUrl}" style="background: #059669; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
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
            Password Reset Request

            Hi {displayName},

            We received a request to reset your password. Visit the link below to create a new password:
            {resetUrl}

            This link will expire in {_config.PasswordResetTokenExpirationMinutes} minutes.

            If you didn't request a password reset, you can safely ignore this email.
            """;

        await SendEmailAsync(toEmail, subject, htmlBody, textBody);
    }

    private async Task SendEmailAsync(string toEmail, string subject, string htmlBody, string textBody)
    {
        if (string.IsNullOrEmpty(_config.SmtpHost))
        {
            _logger.LogWarning("SMTP not configured. Email would have been sent to {Email} with subject: {Subject}", toEmail, subject);
            _logger.LogDebug("Email body:\n{Body}", textBody);
            return;
        }

        using var message = new MailMessage();
        message.From = new MailAddress(_config.FromAddress, _config.FromName);
        message.To.Add(new MailAddress(toEmail));
        message.Subject = subject;
        message.IsBodyHtml = true;
        message.Body = htmlBody;

        var plainTextView = AlternateView.CreateAlternateViewFromString(textBody, null, "text/plain");
        var htmlView = AlternateView.CreateAlternateViewFromString(htmlBody, null, "text/html");
        message.AlternateViews.Add(plainTextView);
        message.AlternateViews.Add(htmlView);

        using var client = new SmtpClient(_config.SmtpHost, _config.SmtpPort);
        client.EnableSsl = _config.UseSsl;
        client.Credentials = new NetworkCredential(_config.SmtpUsername, _config.SmtpPassword);

        try
        {
            await client.SendMailAsync(message);
            _logger.LogInformation("Email sent successfully to {Email}", toEmail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send email to {Email}", toEmail);
            throw;
        }
    }
}
