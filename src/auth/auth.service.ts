import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountsService } from '../accounts/accounts.service';
import { UsersService } from '../users/users.service';
import { hashPassword, comparePassword, compareToken, hashToken } from '../common/utils/password.util';
import type { AppRole } from '../common/types/role.type';
import type { AuthSubjectType } from '../common/types/auth-user.type';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto';

function roleHome(role: AppRole) {
  if (role === 'WAITER') return '/waiter';
  if (role === 'KDS') return '/kds';
  return '/user';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly accounts: AccountsService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  private signAccessToken(sub: string, role: AppRole, typ: AuthSubjectType) {
    return this.jwt.signAsync(
      { sub, role, typ },
      {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('ACCESS_EXPIRES_IN'),
      },
    );
  }

  private signRefreshToken(sub: string, role: AppRole, typ: AuthSubjectType) {
    return this.jwt.signAsync(
      { sub, role, typ },
      {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('REFRESH_EXPIRES_IN'),
      },
    );
  }

  async registerUser(dto: RegisterDto) {
    const exists = await this.users.findByEmail(dto.email);
    if (exists) {
      throw new ForbiddenException('Email already registered');
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await this.users.create({
      email: dto.email.toLowerCase(),
      password: passwordHash,
      fullName: dto.fullName ?? '',
      role: 'USER',
      status: 'ACTIVE',
    });

    return { id: String(user._id) };
  }

  async login(identifier: string, password: string) {
    const acc = await this.accounts.findByUsername(identifier);
    if (acc) {
      if (acc.status == 'DISABLED') throw new ForbiddenException('Account disabled');
      if (acc.role !== 'WAITER' && acc.role !== 'KDS') {
        throw new ForbiddenException('Role not allowed in this app');
      }

      const ok = await comparePassword(password, acc.password);
      if (!ok) throw new UnauthorizedException('Invalid credentials');

      const role = acc.role as AppRole;
      const sub = String(acc._id);

      const accessToken = await this.signAccessToken(sub, role, 'ACCOUNT');
      const refreshToken = await this.signRefreshToken(sub, role, 'ACCOUNT');

      await this.accounts.updateRefreshTokenHash(sub, await hashToken(refreshToken));

      return {
        accessToken,
        refreshToken,
        user: { id: sub, role, subjectType: 'ACCOUNT' as const },
        homePath: roleHome(role),
      };
    }

    const user = await this.users.findByEmail(identifier); // ensure select +passwordHash
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status === 'DISABLED') throw new ForbiddenException('User disabled');
    if (!user.password) throw new UnauthorizedException('User password not set');

    const ok = await comparePassword(password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const role: AppRole = 'USER';
    const sub = String(user._id);

    const accessToken = await this.signAccessToken(sub, role, 'USER');
    const refreshToken = await this.signRefreshToken(sub, role, 'USER');

    await this.users.updateRefreshTokenHash(sub, await hashToken(refreshToken));

    return {
      accessToken,
      refreshToken,
      user: { id: sub, role, subjectType: 'USER' as const },
      homePath: roleHome(role),
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
      });

      const sub = String(payload.sub);
      const role = payload.role as AppRole;
      const typ = payload.typ as AuthSubjectType;

      if (typ === 'ACCOUNT') {
        const acc = await this.accounts.findById(sub);
        if (!acc?.refreshTokenHash) throw new UnauthorizedException('No refresh token');
        const ok = await compareToken(refreshToken, acc.refreshTokenHash);
        if (!ok) throw new UnauthorizedException('Refresh token invalid');
      } else {
        const user = await this.users.findById(sub);
        if (!user?.refreshTokenHash) throw new UnauthorizedException('No refresh token');
        const ok = await compareToken(refreshToken, user.refreshTokenHash);
        if (!ok) throw new UnauthorizedException('Refresh token invalid');
      }

      const newAccessToken = await this.signAccessToken(sub, role, typ);
      const newRefreshToken = await this.signRefreshToken(sub, role, typ);

      const newHash = await hashToken(newRefreshToken);
      if (typ === 'ACCOUNT') await this.accounts.updateRefreshTokenHash(sub, newHash);
      else await this.users.updateRefreshTokenHash(sub, newHash);

      return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Refresh failed');
    }
  }

  async logout(subjectType: AuthSubjectType, subjectId: string) {
    if (subjectType === 'ACCOUNT') await this.accounts.updateRefreshTokenHash(subjectId, null);
    else await this.users.updateRefreshTokenHash(subjectId, null);
  }

  async loginWithGoogle(payload: { googleId: string; email?: string; name?: string }) {
    const email = (payload.email ?? '').toLowerCase().trim();
    if (!email) throw new UnauthorizedException('Google account missing email');

    const user = await this.users.findOrCreateByGoogle({
      email,
      fullName: payload.name ?? '',
      googleId: payload.googleId,
    });

    const role: AppRole = 'USER';
    const sub = String(user._id);

    const accessToken = await this.signAccessToken(sub, role, 'USER');
    const refreshToken = await this.signRefreshToken(sub, role, 'USER');

    await this.users.updateRefreshTokenHash(sub, await hashToken(refreshToken));

    return { accessToken, refreshToken, homePath: '/user' };
  }
}
