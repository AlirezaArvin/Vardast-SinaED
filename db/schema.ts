import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  nationalId: text('national_id').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  birthDate: text('birth_date').notNull(),
  sex: text('sex').notNull(),
  room: text('room').notNull(),
  bed: text('bed').notNull(),
  admittedAt: text('admitted_at').notNull(),
  status: text('status').notNull().default('active'),
  dischargedAt: text('discharged_at'),
  createdAt: text('created_at').notNull(),
});

export const histories = sqliteTable('histories', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull().unique(),
  payload: text('payload').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const orderBatches = sqliteTable('order_batches', {
  id: text('id').primaryKey(),
  patientId: text('patient_id').notNull(),
  impression: text('impression'),
  diet: text('diet'),
  activity: text('activity'),
  isInitial: integer('is_initial', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by').notNull(),
  approvedAt: text('approved_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const orderItems = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull(),
  patientId: text('patient_id').notNull(),
  text: text('text').notNull(),
  isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
  doneAt: text('done_at'),
  doneBy: text('done_by'),
  createdAt: text('created_at').notNull(),
});

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  patientId: text('patient_id'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  detail: text('detail'),
  createdAt: text('created_at').notNull(),
});
