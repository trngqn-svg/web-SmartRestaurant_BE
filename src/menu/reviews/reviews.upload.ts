import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function reviewPhotoStorage() {
  const uploadRoot = path.join(process.cwd(), 'uploads', 'review-photos');
  ensureDir(uploadRoot);

  return diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.jpg';
      const name = `rv_${Date.now()}_${Math.random().toString(16).slice(2)}${safeExt}`;
      cb(null, name);
    },
  });
}

export function imageFileFilter(_req: any, file: any, cb: any) {
  const ok = ['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype);
  if (!ok) return cb(new BadRequestException('Only png/jpg/webp are allowed'), false);
  cb(null, true);
}
