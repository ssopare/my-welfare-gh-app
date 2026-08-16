import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

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
        destination: join(process.cwd(), 'uploads', 'avatars'),
        filename: (_req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname).toLowerCase()}`);
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
