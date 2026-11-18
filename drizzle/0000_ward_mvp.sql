CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`national_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_date` text NOT NULL,
	`sex` text NOT NULL,
	`room` text NOT NULL,
	`bed` text NOT NULL,
	`admitted_at` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`discharged_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patients_national_id_unique` ON `patients` (`national_id`);
--> statement-breakpoint
CREATE INDEX `idx_patients_status` ON `patients` (`status`);
--> statement-breakpoint
CREATE TABLE `histories` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `histories_patient_id_unique` ON `histories` (`patient_id`);
--> statement-breakpoint
CREATE TABLE `order_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`impression` text,
	`diet` text,
	`activity` text,
	`is_initial` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`approved_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_batches_patient` ON `order_batches` (`patient_id`);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`text` text NOT NULL,
	`is_done` integer DEFAULT false NOT NULL,
	`done_at` text,
	`done_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_orders_patient` ON `order_items` (`patient_id`);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`created_at` text NOT NULL
);
