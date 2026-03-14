CREATE TABLE `telegram_conversation_state` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chatId` bigint NOT NULL,
	`state` varchar(64) NOT NULL,
	`pendingDomain` varchar(255),
	`pendingMethod` varchar(64),
	`lastActiveDomain` varchar(255),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `telegram_conversation_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `telegram_conversation_state_chatId_unique` UNIQUE(`chatId`)
);
--> statement-breakpoint
CREATE TABLE `telegram_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chatId` bigint NOT NULL,
	`role` enum('system','user','assistant','tool') NOT NULL,
	`content` text,
	`toolCalls` json,
	`toolCallId` varchar(128),
	`name` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `telegram_conversations_id` PRIMARY KEY(`id`)
);
