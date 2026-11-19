ALTER TABLE `patients` ADD `is_trauma` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `trauma_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trauma_forms_patient_id_unique` ON `trauma_forms` (`patient_id`);
