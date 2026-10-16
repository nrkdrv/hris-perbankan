/**
 * Notifikasi FCM best-effort: kegagalan push tidak boleh menggagalkan request bisnis.
 * Diketik struktural agar tidak bergantung pada modul FcmService (dibuat agen lain).
 */
export interface Notifier {
  notifyUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<unknown>;
}

export async function notifySafe(
  notifier: Notifier,
  userId: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  if (!userId) return;
  try {
    await notifier.notifyUser(userId, title, body, data ?? {});
  } catch {
    // best-effort: push notification tidak kritis untuk keberhasilan request
  }
}
