import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'avatars');

// multer's diskStorage never creates its destination directory — it's not
// tracked in git (nothing to commit, it's write-only user data), so a
// fresh checkout/container/deploy has no uploads/avatars/ at all until
// this runs. Without it, the very first avatar upload anywhere would
// 500 with ENOENT instead of ever reaching fileFilter/validation.
mkdirSync(UPLOAD_DIR, { recursive: true });

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  /**
   * POST /upload/avatar
   * Accepts multipart/form-data with a single field named "file".
   * Validates MIME type (jpeg/png/webp) and file size (≤ 2 MB).
   * Persists to uploads/avatars/ on the server filesystem.
   * Returns { url } — a path the client can store as avatarUrl/logoUrl and
   * the browser can resolve against the API base URL.
   *
   * Contract is intentionally narrow: upload returns the URL, the caller
   * is responsible for persisting it via PATCH /members/me or PATCH /organisation.
   * This decoupling makes swapping storage backends (to S3/GCS/Cloudinary) a
   * single-file change inside this module with no downstream API contract change.
   */
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          cb(
            null,
            `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
          );
        },
      }),
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          return cb(
            new BadRequestException(
              'Only JPEG, PNG, or WebP images are accepted',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return { url: `/uploads/avatars/${file.filename}` };
  }
}
