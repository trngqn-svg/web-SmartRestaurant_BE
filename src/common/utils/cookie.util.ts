import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CookieUtil {
  constructor(private readonly config: ConfigService) {}

  setRefreshCookie(res: Response, refreshToken: string) {
    const secure = this.config.get<boolean>('COOKIE_SECURE')!;
    res.cookie('rt', refreshToken, {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      path: '/api/auth/refresh',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  clearRefreshCookie(res: Response) {
    const secure = this.config.get<boolean>('COOKIE_SECURE')!;
    res.cookie('rt', '', {
      httpOnly: true,
      secure,
      sameSite: secure ? 'none' : 'lax',
      path: '/api/auth/refresh',
      maxAge: 0,
    });
  }
}
