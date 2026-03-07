ALTER TABLE `pbn_sites` ADD `dr` int;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `spamScore` int;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `domainAge` varchar(128);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `expireDate` varchar(32);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `theme` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `hostingProvider` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `hostingName` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `cpanelUrl` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `cpanelUser` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `cpanelPass` text;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `domainRegistrar` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `registrarEmail` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `registrarPass` text;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `hostingEmail` varchar(255);--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `hostingPass` text;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `wpAutomationKey` text;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `isBlog` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `parentSiteId` int;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `banned` text;--> statement-breakpoint
ALTER TABLE `pbn_sites` ADD `notes` text;