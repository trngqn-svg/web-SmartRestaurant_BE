import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.log.warn('SMTP config missing. Emails will be logged to console only.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
      secure: false,
      auth: { user, pass },
    });
  }

  async sendOtpEmail(to: string, otp: string, minutes = 10) {
    const from = this.config.get<string>('SMTP_FROM') ?? 'no-reply@smartrestaurant.local';

    const subject = `Password reset OTP`;
    const text = `Your OTP is ${otp}. It expires in ${minutes} minutes.`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Password reset</h2>
        <p>Your OTP code is:</p>
        <div style="font-size:28px;font-weight:800;letter-spacing:4px">${otp}</div>
        <p>This code expires in <b>${minutes} minutes</b>.</p>
      </div>
    `;

    if (!this.transporter) {
      this.log.warn(`[DEV] sendOtpEmail to=${to} otp=${otp} exp=${minutes}m`);
      return;
    }

    await this.transporter.sendMail({ from, to, subject, text, html });
  }
}
