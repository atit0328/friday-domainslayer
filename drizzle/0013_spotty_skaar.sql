ALTER TABLE `domain_scans` ADD `globalRank` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `totalVisits` int;--> statement-breakpoint
ALTER TABLE `domain_scans` ADD `bounceRate` varchar(16);