import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from '../../common/services/storage.service';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
};

function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf('.');
  const ext = dot >= 0 ? key.slice(dot).toLowerCase() : '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/**
 * Unduh berkas dari StorageService. Wajib autentikasi (tanpa @Public).
 * Key disanitasi di StorageService (menolak path traversal).
 * Key yang mengandung '/' harus di-encode dengan encodeURIComponent oleh klien.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':key')
  async download(
    @Param('key') key: string,
    @Res() res: Response,
  ): Promise<void> {
    let data: Buffer;
    try {
      data = await this.storage.getBuffer(key);
    } catch {
      throw new NotFoundException('Berkas tidak ditemukan');
    }
    res.setHeader('Content-Type', contentTypeFor(key));
    res.setHeader('Content-Length', String(data.length));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${key.split('/').pop() ?? 'file'}"`,
    );
    res.send(data);
  }
}
