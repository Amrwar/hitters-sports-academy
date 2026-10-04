-- A delivery is claimed before it is handed to a provider, so two workers (or the inline dispatch and a
-- cron pass) can never send the same message twice.
ALTER TYPE "NotificationStatus" ADD VALUE 'SENDING';
