import {
  BadRequestException,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';

import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

function getUserIdFromReq(req: any): string {
  const u = req?.user;
  return String(u?.subjectId ?? u?.userId ?? u?.id ?? '');
}

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function avatarStorage() {
  const uploadRoot = path.join(process.cwd(), 'uploads', 'avatars');
  ensureDir(uploadRoot);

  return diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
      const name = `avt_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
      cb(null, name);
    },
  });
}

function imageFileFilter(_req: any, file: any, cb: any) {
  const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
  if (!ok) return cb(new BadRequestException('Only png/jpg/webp are allowed'), false);
  cb(null, true);
}

@Controller('/api/users/me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getMe(@Req() req: Request) {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new BadRequestException('Missing user id in token');
    return this.users.getMe(userId);
  }

  @Patch()
  async updateMe(@Req() req: Request, @Body() dto: UpdateMyProfileDto) {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new BadRequestException('Missing user id in token');

    return this.users.updateMe(userId, {
      fullName: dto.fullName,
      address: (dto as any).address,
      phoneNumber: (dto as any).phoneNumber,
    });
  }

  @Post('/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: avatarStorage(),
      fileFilter: imageFileFilter,
      limits: { fileSize: 3 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(@Req() req: Request, @UploadedFile() file?: Express.Multer.File) {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new BadRequestException('Missing user id in token');
    if (!file) throw new BadRequestException('Missing file');

    const publicPath = `/uploads/avatars/${file.filename}`;
    return this.users.setAvatarUrl(userId, publicPath);
  }

  @Post('/change-password')
  async changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new BadRequestException('Missing user id in token');
    return this.users.changePassword(userId, dto.oldPassword, dto.newPassword);
  }

  @Post('/set-password')
  async setPassword(@Req() req: Request, @Body() dto: SetPasswordDto) {
    const userId = getUserIdFromReq(req);
    if (!userId) throw new BadRequestException('Missing user id in token');
    return this.users.setPassword(userId, dto.newPassword);
  }
}
