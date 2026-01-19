import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CookieUtil } from '../common/utils/cookie.util';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { ConfigService } from '@nestjs/config';

function sanitizeReturnTo(v?: string) {
  if (!v) return null;
  // only allow internal FE paths
  if (!v.startsWith('/')) return null;
  if (v.startsWith('//')) return null;
  return v;
}

@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookie: CookieUtil,
    private readonly config: ConfigService,
  ) {}

  @Post('/login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto.identifier, dto.password);
    this.cookie.setRefreshCookie(res, r.refreshToken);
    return { accessToken: r.accessToken, user: r.user, homePath: r.homePath };
  }

  @Post('/register')
  async register(@Body() dto: RegisterDto) {
    return this.auth.registerUser(dto);
  }

  @Post('/refresh')
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const rt = req.cookies?.rt;
    const result = await this.auth.refresh(rt);
    this.cookie.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('/logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    this.cookie.clearRefreshCookie(res);
    await this.auth.logout(req.user.subjectType, req.user.subjectId);
    return { ok: true };
  }

  @Get('/me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any) {
    return { user: req.user };
  }

  @Get('/google')
  @UseGuards(GoogleAuthGuard)
  googleStart(
    @Res({ passthrough: true }) res: Response,
    @Query('returnTo') returnTo?: string,
  ) {
    const rt = sanitizeReturnTo(returnTo);
    if (rt) {
      res.cookie('rt_to', rt, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000, // 5 minutes
        secure: true, // enable in HTTPS production
      });
    }
  }

  @Get('/google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const { accessToken, refreshToken, homePath } =
      await this.auth.loginWithGoogle(req.user);

    this.cookie.setRefreshCookie(res, refreshToken);

    const fe = this.config.get<string>('VITE_APP_URL')!;
    const url = new URL(`${fe}/oauth/callback`);
    url.searchParams.set('accessToken', accessToken);
    url.searchParams.set('homePath', homePath);

    const returnTo = sanitizeReturnTo(req.cookies?.rt_to);
    if (returnTo) url.searchParams.set('returnTo', returnTo);

    res.clearCookie('rt_to', { sameSite: 'lax' });

    return res.redirect(url.toString());
  }
}
