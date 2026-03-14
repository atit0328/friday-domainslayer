CREATE TABLE `batch_attacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` varchar(64) NOT NULL,
	`totalDomains` int NOT NULL DEFAULT 0,
	`successCount` int NOT NULL DEFAULT 0,
	`failedCount` int NOT NULL DEFAULT 0,
	`skippedCount` int NOT NULL DEFAULT 0,
	`cancelled` boolean NOT NULL DEFAULT false,
	`redirectUrl` varchar(512),
	`source` varchar(32) NOT NULL DEFAULT 'telegram',
	`status` varchar(32) NOT NULL DEFAULT 'running',
	`domainResults` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`totalDurationMs` int,
	CONSTRAINT `batch_attacks_id` PRIMARY KEY(`id`),
	CONSTRAINT `batch_attacks_batchId_unique` UNIQUE(`batchId`)
);
