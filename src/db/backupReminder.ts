// Séparé de backup.ts (qui dépend de zod) pour ne pas alourdir le premier affichage.
export const BACKUP_REMINDER_DAYS = 7;

export function needsBackupReminder(lastBackupAt: number | undefined, now = Date.now()): boolean {
  if (!lastBackupAt) return true;
  return now - lastBackupAt > BACKUP_REMINDER_DAYS * 86_400_000;
}
