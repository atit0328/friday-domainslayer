CREATE TABLE `serp_discovered_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`domain` varchar(512) NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`snippet` text,
	`serpPosition` int,
	`keyword` varchar(512) NOT NULL,
	`keywordId` int,
	`cms` varchar(64),
	`serverType` varchar(128),
	`waf` varchar(128),
	`vulnScore` int,
	`sdtStatus` enum('discovered','queued','scanning','attacking','success','failed','blacklisted','skipped') NOT NULL DEFAULT 'discovered',
	`attackSessionId` int,
	`attackedAt` timestamp,
	`attackResult` text,
	`deployedUrls` json,
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serp_discovered_targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serp_keywords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(512) NOT NULL,
	`category` varchar(128) NOT NULL DEFAULT 'lottery',
	`language` varchar(16) NOT NULL DEFAULT 'th',
	`country` varchar(16) NOT NULL DEFAULT 'th',
	`isActive` boolean NOT NULL DEFAULT true,
	`lastSearchedAt` timestamp,
	`totalSearches` int NOT NULL DEFAULT 0,
	`totalTargetsFound` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `serp_keywords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serp_search_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ssrStatus` enum('running','completed','error','cancelled') NOT NULL DEFAULT 'running',
	`keywordsSearched` int NOT NULL DEFAULT 0,
	`totalKeywords` int NOT NULL DEFAULT 0,
	`rawResultsFound` int NOT NULL DEFAULT 0,
	`uniqueDomainsFound` int NOT NULL DEFAULT 0,
	`newTargetsAdded` int NOT NULL DEFAULT 0,
	`duplicatesSkipped` int NOT NULL DEFAULT 0,
	`blacklistedSkipped` int NOT NULL DEFAULT 0,
	`errors` json,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`triggeredBy` varchar(64) NOT NULL DEFAULT 'manual',
	CONSTRAINT `serp_search_runs_id` PRIMARY KEY(`id`)
);
