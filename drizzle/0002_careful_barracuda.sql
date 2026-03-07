CREATE TABLE `bid_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`ruleId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`bidAction` enum('analyzed','recommended','approved','purchased','rejected','failed') NOT NULL DEFAULT 'analyzed',
	`askPrice` decimal(12,2),
	`bidAmount` decimal(12,2),
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`seoScore` int,
	`estimatedDA` int,
	`estimatedDR` int,
	`estimatedSpamScore` int,
	`estimatedBacklinks` int,
	`estimatedReferringDomains` int,
	`estimatedTrustFlow` int,
	`estimatedCitationFlow` int,
	`estimatedAge` varchar(32),
	`aiVerdict` enum('STRONG_BUY','BUY','CONDITIONAL_BUY','HOLD','PASS') NOT NULL DEFAULT 'HOLD',
	`aiConfidence` int,
	`aiReasoning` text,
	`seoAnalysis` json,
	`purchaseOrderId` varchar(64),
	`purchaseStatus` varchar(32),
	`errorMessage` text,
	`available` boolean,
	`provider` varchar(64) NOT NULL DEFAULT 'godaddy',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minDA` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minDR` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `maxSpamScore` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minBacklinks` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minReferringDomains` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minTrustFlow` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minCitationFlow` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `maxDomainAge` int;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `minDomainAge` int;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `preferredTLDs` json;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `excludePatterns` json;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `autoPurchase` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `requireApproval` boolean DEFAULT true NOT NULL;