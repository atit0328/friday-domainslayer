ALTER TABLE `autobid_rules` ADD `requireWikiLink` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `linkTypeFilters` json;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `checkRedirect` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `autobid_rules` ADD `rejectRedirects` boolean DEFAULT true NOT NULL;