import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import * as admin from 'firebase-admin';
import { PrismaService } from '../../prisma/prisma.service';

export interface FcmSendResult {
  sent: boolean;
  stub: boolean;
}

/**
 * Pengirim Firebase Cloud Messaging (data message).
 * Bila FIREBASE_SERVICE_ACCOUNT_PATH kosong / tidak valid → mode stub:
 * hanya log, tidak pernah crash. Cocok untuk dev & CI.
 */
@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private ensureInitialized(): boolean {
    if (this.initialized) {
      return true;
    }
    const path = this.config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_PATH',
      '',
    );
    if (!path) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_PATH kosong — FCM berjalan dalam mode stub.',
      );
      return false;
    }
    try {
      if (!existsSync(path)) {
        this.logger.warn(
          `Service account FCM tidak ditemukan (${path}) — mode stub.`,
        );
        return false;
      }
      const serviceAccount = JSON.parse(readFileSync(path, 'utf8')) as Record<
        string,
        unknown
      >;
      if (
        !serviceAccount.project_id ||
        !serviceAccount.private_key ||
        !serviceAccount.client_email
      ) {
        this.logger.warn('Service account FCM tidak valid — mode stub.');
        return false;
      }
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(
            serviceAccount as admin.ServiceAccount,
          ),
        });
      }
      this.initialized = true;
      return true;
    } catch (err) {
      this.logger.warn(
        `Gagal inisialisasi Firebase Admin — mode stub: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /** Kirim data message FCM (semua nilai harus string). */
  async sendDataMessage(
    token: string,
    data: Record<string, string>,
  ): Promise<FcmSendResult> {
    if (!token) {
      return { sent: false, stub: true };
    }
    if (!this.ensureInitialized()) {
      this.logger.debug(
        `[FCM-STUB] token=${token.slice(0, 12)}… data=${JSON.stringify(data)}`,
      );
      return { sent: false, stub: true };
    }
    try {
      const messageId = await admin.messaging().send({ token, data });
      this.logger.debug(`FCM terkirim: ${messageId}`);
      return { sent: true, stub: false };
    } catch (err) {
      this.logger.error(`Gagal kirim FCM: ${(err as Error).message}`);
      return { sent: false, stub: false };
    }
  }

  /** Muat fcmToken user dari DB lalu kirim. Tanpa token → stub. */
  async notifyUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<FcmSendResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });
    if (!user?.fcmToken) {
      this.logger.debug(
        `[FCM-STUB] user ${userId} tanpa fcmToken — "${title}"`,
      );
      return { sent: false, stub: true };
    }
    return this.sendDataMessage(user.fcmToken, { ...data, title, body });
  }
}
