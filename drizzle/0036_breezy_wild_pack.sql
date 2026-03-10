ALTER TABLE `hacked_site_detections` ADD `verificationStatus` enum('not_verified','pending','verified_success','verified_reverted','verified_partial','verification_failed') DEFAULT 'not_verified' NOT NULL;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `verificationStage` enum('none','immediate','short_term','medium_term','long_term') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `verifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `verificationAttempts` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `verificationHistory` json;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `nextVerificationAt` timestamp;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `autoRetryCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `hacked_site_detections` ADD `ourRedirectUrl` text;