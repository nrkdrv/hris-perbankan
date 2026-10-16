import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';

/**
 * Penyimpanan berkas generik. Driver dipilih lewat env STORAGE_DRIVER:
 * - "local": simpan di STORAGE_DIR (relatif terhadap cwd proses)
 * - "s3":    MinIO / S3-compatible (S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY)
 *
 * save() mengembalikan key yang dipakai untuk getBuffer()/delete().
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 's3';
  private readonly baseDir: string;
  private readonly s3?: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.driver =
      this.config.get<string>('STORAGE_DRIVER', 'local') === 's3'
        ? 's3'
        : 'local';
    this.baseDir = resolve(
      process.cwd(),
      this.config.get<string>('STORAGE_DIR', './storage'),
    );
    this.bucket = this.config.get<string>('S3_BUCKET', 'hris-bank');
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        endpoint: this.config.get<string>('S3_ENDPOINT'),
        region: this.config.get<string>('S3_REGION', 'ap-southeast-3'),
        forcePathStyle: true,
        credentials: {
          accessKeyId: this.config.getOrThrow<string>('S3_ACCESS_KEY'),
          secretAccessKey: this.config.getOrThrow<string>('S3_SECRET_KEY'),
        },
      });
    }
    this.logger.log(`Storage driver aktif: ${this.driver}`);
  }

  /** Sanitasi key — menolak path traversal untuk kedua driver. */
  private assertSafeKey(key: string): string {
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('Key berkas tidak valid');
    }
    const cleaned = key.replace(/\\/g, '/').trim();
    if (
      cleaned.length === 0 ||
      cleaned.startsWith('/') ||
      cleaned === '.' ||
      cleaned.includes('..')
    ) {
      throw new BadRequestException('Key berkas tidak valid');
    }
    return normalize(cleaned);
  }

  private localPath(key: string): string {
    const safe = this.assertSafeKey(key);
    const full = resolve(this.baseDir, safe);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + '/')) {
      throw new BadRequestException('Key berkas tidak valid');
    }
    return full;
  }

  async save(
    buffer: Buffer,
    key: string,
    contentType = 'application/octet-stream',
  ): Promise<string> {
    if (this.driver === 's3' && this.s3) {
      const safe = this.assertSafeKey(key);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: safe,
          Body: buffer,
          ContentType: contentType,
        }),
      );
      return safe;
    }
    const full = this.localPath(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buffer);
    return this.assertSafeKey(key);
  }

  async getBuffer(key: string): Promise<Buffer> {
    if (this.driver === 's3' && this.s3) {
      const safe = this.assertSafeKey(key);
      const out = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: safe }),
      );
      const body = out.Body as AsyncIterable<Uint8Array> | undefined;
      if (!body) {
        throw new BadRequestException('Berkas tidak ditemukan');
      }
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    return readFile(this.localPath(key));
  }

  async delete(key: string): Promise<void> {
    if (this.driver === 's3' && this.s3) {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.assertSafeKey(key),
        }),
      );
      return;
    }
    try {
      await unlink(this.localPath(key));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw err;
      }
    }
  }
}
