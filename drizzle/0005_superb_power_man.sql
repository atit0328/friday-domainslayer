ALTER TABLE `pbn_sites` MODIFY COLUMN `pbnStatus` enum('active','inactive','error','down') NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `lastCheckedAt` timestamp;