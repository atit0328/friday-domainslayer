CREATE TABLE `attack_blacklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`domain` varchar(512) NOT NULL,
	`reason` text NOT NULL,
	`failCount` int NOT NULL DEFAULT 1,
	`lastFailedAt` timestamp NOT NULL DEFAULT (now()),
	`firstFailedAt` timestamp NOT NULL DEFAULT (now()),
	`errors` json,
	`cooldownUntil` timestamp,
	`isPermaBanned` boolean NOT NULL DEFAULT false,
	`totalAttempts` int NOT NULL DEFAULT 0,
	`totalDurationMs` bigint NOT NULL DEFAULT 0,
	`cms` varchar(64),
	`serverType` varchar(128),
	`waf` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attack_blacklist_id` PRIMARY KEY(`id`)
);
