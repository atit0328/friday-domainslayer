CREATE TABLE `attack_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deployId` int,
	`userId` int NOT NULL,
	`logDomain` varchar(255) NOT NULL,
	`logPhase` varchar(64) NOT NULL,
	`logStep` varchar(128) NOT NULL,
	`logDetail` text NOT NULL,
	`logSeverity` enum('info','success','warning','error','critical') NOT NULL DEFAULT 'info',
	`logProgress` int NOT NULL DEFAULT 0,
	`logData` json,
	`logMethod` varchar(64),
	`httpStatus` int,
	`responseTime` int,
	`logTimestamp` timestamp NOT NULL DEFAULT (now()),
	`logCreatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attack_logs_id` PRIMARY KEY(`id`)
);
