CREATE TABLE `algo_intel` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`signals` json NOT NULL,
	`analysis` text,
	`source` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `algo_intel_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `autobid_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT 'My Auto-Bid Rule',
	`autobidStatus` enum('active','paused','completed','exhausted') NOT NULL DEFAULT 'active',
	`keyword` varchar(255) NOT NULL DEFAULT '',
	`tld` varchar(32) NOT NULL DEFAULT '',
	`providers` json,
	`maxBidPerDomain` decimal(12,2) NOT NULL DEFAULT '100',
	`totalBudget` decimal(12,2) NOT NULL DEFAULT '1000',
	`spent` decimal(12,2) NOT NULL DEFAULT '0',
	`minTrustScore` int NOT NULL DEFAULT 50,
	`minGrade` varchar(2) NOT NULL DEFAULT 'C',
	`maxRisk` varchar(8) NOT NULL DEFAULT 'MED',
	`requiredVerdict` varchar(32) NOT NULL DEFAULT 'CONDITIONAL_BUY',
	`useCase` varchar(64) NOT NULL DEFAULT 'hold_flip',
	`bidStrategy` varchar(32) NOT NULL DEFAULT 'conservative',
	`domainsScanned` int NOT NULL DEFAULT 0,
	`domainsBid` int NOT NULL DEFAULT 0,
	`domainsWon` int NOT NULL DEFAULT 0,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `autobid_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`phase` int NOT NULL,
	`phaseName` varchar(255) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'started',
	`data` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaign_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`niche` varchar(255) NOT NULL,
	`keywords` text,
	`brandName` varchar(255),
	`targetGeo` varchar(64) NOT NULL DEFAULT 'global',
	`language` varchar(8) NOT NULL DEFAULT 'en',
	`aggressiveness` int NOT NULL DEFAULT 7,
	`aiStrategy` varchar(32) NOT NULL DEFAULT 'multi',
	`targetPosition` int NOT NULL DEFAULT 1,
	`campaignStatus` enum('PENDING','RUNNING','PAUSED','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
	`currentPhase` int NOT NULL DEFAULT 0,
	`totalPhases` int NOT NULL DEFAULT 16,
	`progress` int NOT NULL DEFAULT 0,
	`config` json,
	`algoScores` json,
	`rankingData` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` varchar(16) NOT NULL,
	`content` text NOT NULL,
	`provider` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `domain_scans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`useCase` varchar(64) NOT NULL DEFAULT 'hold_flip',
	`status` enum('pending','scanning','completed','failed') NOT NULL DEFAULT 'pending',
	`trustScore` int,
	`grade` varchar(2),
	`verdict` varchar(32),
	`riskLevel` varchar(16),
	`explanations` json,
	`metrics` json,
	`rawSignals` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `domain_scans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplace_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`keyword` varchar(255),
	`tld` varchar(32),
	`minPrice` decimal(12,2),
	`maxPrice` decimal(12,2),
	`providers` json,
	`results` json,
	`resultCount` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplace_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `module_executions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`moduleName` varchar(64) NOT NULL,
	`domain` varchar(255),
	`niche` varchar(255),
	`keywords` text,
	`result` text,
	`provider` varchar(32),
	`moduleStatus` enum('running','completed','failed') NOT NULL DEFAULT 'running',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `module_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`orderAction` enum('buy_now','bid','make_offer') NOT NULL DEFAULT 'buy_now',
	`amount` decimal(12,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`orderStatus` enum('pending','submitted','accepted','failed','cancelled') NOT NULL DEFAULT 'pending',
	`providerRef` text,
	`errorMessage` text,
	`autobidRuleId` int,
	`trustScore` int,
	`grade` varchar(2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pbn_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteId` int NOT NULL,
	`title` varchar(500) NOT NULL,
	`content` text NOT NULL,
	`targetUrl` text NOT NULL,
	`anchorText` varchar(255) NOT NULL,
	`keyword` varchar(255),
	`wpPostId` int,
	`wpPostUrl` text,
	`pbnPostStatus` enum('pending','published','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pbn_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pbn_sites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`username` varchar(255) NOT NULL,
	`appPassword` text NOT NULL,
	`pbnStatus` enum('active','inactive','error') NOT NULL DEFAULT 'active',
	`da` int,
	`pa` int,
	`lastPost` timestamp,
	`postCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pbn_sites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`domain` varchar(255) NOT NULL,
	`provider` varchar(64) NOT NULL DEFAULT '',
	`listingType` varchar(32) NOT NULL DEFAULT 'fixed',
	`initialPrice` decimal(12,2),
	`currentPrice` decimal(12,2),
	`targetPrice` decimal(12,2),
	`currency` varchar(8) NOT NULL DEFAULT 'USD',
	`auctionEnd` timestamp,
	`alertBeforeEndMinutes` int NOT NULL DEFAULT 30,
	`watchlistStatus` enum('watching','alerted','bought','expired','removed') NOT NULL DEFAULT 'watching',
	`trustScore` int,
	`grade` varchar(2),
	`verdict` text,
	`providerUrl` text,
	`notes` text,
	`priceAlertSent` boolean NOT NULL DEFAULT false,
	`timeAlertSent` boolean NOT NULL DEFAULT false,
	`lastCheckedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`watchlistId` int NOT NULL,
	`alertType` varchar(64) NOT NULL,
	`message` text NOT NULL,
	`oldPrice` decimal(12,2),
	`newPrice` decimal(12,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlist_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `plan` varchar(32) DEFAULT 'FREE' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `company` text;