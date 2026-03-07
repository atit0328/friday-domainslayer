CREATE TABLE `pipeline_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deployId` int NOT NULL,
	`phase` varchar(64) NOT NULL,
	`step` varchar(64) NOT NULL,
	`detail` text NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`data` json,
	`eventCreatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pipeline_events_id` PRIMARY KEY(`id`)
);
