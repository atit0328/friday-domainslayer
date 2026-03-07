ALTER TABLE `domain_scans` ADD `da` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `dr` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `ss` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `bl` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `rf` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `tf` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `cf` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `indexedPages` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `waybackSnapshots` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `waybackFirstCapture` varchar(32);--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `waybackLastCapture` varchar(32);--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `domainAge` varchar(128);--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `isLive` boolean;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `hasSSL` boolean;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `loadTimeMs` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `healthScore` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `aiAnalysis` text;