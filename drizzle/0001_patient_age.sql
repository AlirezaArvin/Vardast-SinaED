ALTER TABLE `patients` ADD `age` integer;
--> statement-breakpoint
UPDATE `patients` SET `age` = CAST(strftime('%Y', 'now') AS INTEGER) - 621 - CAST(substr(`birth_date`, 1, 4) AS INTEGER) WHERE `birth_date` GLOB '1[0-9][0-9][0-9]*';
--> statement-breakpoint
ALTER TABLE `patients` DROP COLUMN `birth_date`;
