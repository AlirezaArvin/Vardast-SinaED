import { audit, getDatabase } from '@/db/runtime';
import { activityOptions, conditionOptions, dietOptions } from '@/lib/clinical-types';

type RequestBody = Record<string, unknown> & { action?: string; actor?: string };

const patientSelect = `SELECT
  id, national_id AS nationalId, first_name AS firstName, last_name AS lastName,
  age, sex, room, bed, admitted_at AS admittedAt,
  status, discharged_at AS dischargedAt, is_trauma AS isTrauma FROM patients`;

type OrderHeader = { impression: string; diet: string; activity: string; condition: string };

const orderHeaderError = 'تکمیل تشخیص اولیه، رژیم غذایی، فعالیت و وضعیت الزامی است.';

function orderHeader(body: RequestBody): OrderHeader {
  const field = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return { impression: field(body.impression), diet: field(body.diet), activity: field(body.activity), condition: field(body.condition) };
}

function isCompleteHeader({ impression, diet, activity, condition }: OrderHeader) {
  const isOneOf = (value: string, options: readonly string[]) => options.includes(value);
  return Boolean(impression) && isOneOf(diet, dietOptions) && isOneOf(activity, activityOptions) && isOneOf(condition, conditionOptions);
}

const withTraumaFlag =(patient: Record<string, unknown> | null) => patient && { ...patient, isTrauma: Boolean(patient.isTrauma) };

export async function GET(request: Request) {
  const db = await getDatabase();
  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');
  const resource = url.searchParams.get('resource') ?? 'patients';

  if (resource === 'patient' && patientId) {
    const patient = await db.prepare(`${patientSelect} WHERE id = ?`).bind(patientId).first<Record<string, unknown>>();
    const historyRow = await db.prepare('SELECT payload FROM histories WHERE patient_id = ?').bind(patientId).first<{ payload: string }>();
    const traumaRow = await db.prepare('SELECT payload FROM trauma_forms WHERE patient_id = ?').bind(patientId).first<{ payload: string }>();
    const batches = await db.prepare(
      `SELECT id, impression, diet, activity, condition, is_initial AS isInitial, approved_at AS approvedAt
       FROM order_batches WHERE patient_id = ? ORDER BY created_at DESC`,
    ).bind(patientId).all<Record<string, unknown>>();
    const items = await db.prepare(
      `SELECT id, batch_id AS batchId, text, is_done AS isDone, done_at AS doneAt, created_at AS createdAt
       FROM order_items WHERE patient_id = ? ORDER BY created_at DESC`,
    ).bind(patientId).all<Record<string, unknown>>();
    const orderBatches = batches.results.map((batch) => ({
      ...batch,
      isInitial: Boolean(batch.isInitial),
      items: items.results.filter((item) => item.batchId === batch.id).map((item) => ({ ...item, isDone: Boolean(item.isDone) })),
    }));
    return Response.json({
      patient: withTraumaFlag(patient),
      history: historyRow ? JSON.parse(historyRow.payload) : null,
      traumaForm: traumaRow ? JSON.parse(traumaRow.payload) : null,
      orderBatches,
    });
  }

  // Patients the physician discharged stay listed until the ward desk approves the discharge.
  const patients = await db.prepare(`${patientSelect} WHERE status IN ('active', 'discharge_pending') ORDER BY admitted_at DESC`).all<Record<string, unknown>>();
  return Response.json({ patients: patients.results.map(withTraumaFlag) });
}

export async function POST(request: Request) {
  const db = await getDatabase();
  const body = (await request.json()) as RequestBody;
  const actor = String(body.actor ?? 'کاربر بخش');
  const now = new Date().toISOString();

  if (body.action === 'addPatient') {
    const patient = body.patient as Record<string, string>;
    const age = Number(patient.age);
    if (!Number.isInteger(age) || age < 0 || age > 130) {
      return Response.json({ error: 'سن واردشده معتبر نیست.' }, { status: 400 });
    }
    const id = crypto.randomUUID();
    const isTrauma = Boolean(patient.isTrauma);
    await db.prepare(
      `INSERT INTO patients (id, national_id, first_name, last_name, age, sex, room, bed, admitted_at, status, is_trauma, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(id, patient.nationalId, patient.firstName, patient.lastName, age, patient.sex, patient.room, patient.bed, now, isTrauma ? 1 : 0, now).run();
    await audit(id, actor, 'patient.created', `تخت ${patient.bed}${isTrauma ? ' · ترومایی' : ''}`);
    return Response.json({ ok: true, id });
  }

  // The physician's discharge sets the discharge time; the ward desk then approves it to close the admission.
  if (body.action === 'dischargePatient') {
    const patientId = String(body.patientId);
    const result = await db.prepare("UPDATE patients SET status = 'discharge_pending', discharged_at = ? WHERE id = ? AND status = 'active'").bind(now, patientId).run();
    if (!result.meta.changes) return Response.json({ error: 'این بیمار در وضعیت بستری فعال نیست.' }, { status: 409 });
    await audit(patientId, actor, 'patient.dischargeRequested');
    return Response.json({ ok: true });
  }

  if (body.action === 'approveDischarge') {
    const patientId = String(body.patientId);
    const result = await db.prepare("UPDATE patients SET status = 'discharged' WHERE id = ? AND status = 'discharge_pending'").bind(patientId).run();
    if (!result.meta.changes) return Response.json({ error: 'این بیمار در انتظار تأیید ترخیص نیست.' }, { status: 409 });
    await audit(patientId, actor, 'patient.discharged');
    return Response.json({ ok: true });
  }

  if (body.action === 'markTrauma') {
    const patientId = String(body.patientId);
    await db.prepare('UPDATE patients SET is_trauma = 1 WHERE id = ?').bind(patientId).run();
    await audit(patientId, actor, 'patient.traumaFormAdded');
    return Response.json({ ok: true });
  }

  if (body.action === 'saveTraumaForm') {
    const patientId = String(body.patientId);
    const payload = JSON.stringify(body.traumaForm);
    await db.prepare(
      `INSERT INTO trauma_forms (id, patient_id, payload, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id) DO UPDATE SET payload = excluded.payload, created_by = excluded.created_by, updated_at = excluded.updated_at`,
    ).bind(crypto.randomUUID(), patientId, payload, actor, now, now).run();
    await audit(patientId, actor, 'traumaForm.saved');
    return Response.json({ ok: true });
  }

  if (body.action === 'saveHistory') {
    const patientId = String(body.patientId);
    const existing = await db.prepare('SELECT id FROM histories WHERE patient_id = ?').bind(patientId).first<{ id: string }>();
    if (existing) {
      await db.prepare('UPDATE histories SET payload = ?, created_by = ?, updated_at = ? WHERE patient_id = ?')
        .bind(JSON.stringify(body.history), actor, now, patientId).run();
    } else {
      await db.prepare('INSERT INTO histories (id, patient_id, payload, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), patientId, JSON.stringify(body.history), actor, now, now).run();
    }
    await audit(patientId, actor, 'history.saved');
    return Response.json({ ok: true });
  }

  if (body.action === 'approveOrders') {
    const patientId = String(body.patientId);
    const isInitial = Boolean(body.isInitial);
    const { impression, diet, activity, condition } = orderHeader(body);
    const items = (body.items as string[]).filter((item) => item.trim());
    if (isInitial && !isCompleteHeader({ impression, diet, activity, condition })) {
      return Response.json({ error: orderHeaderError }, { status: 400 });
    }
    const batchId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO order_batches (id, patient_id, impression, diet, activity, condition, is_initial, created_by, approved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(batchId, patientId, impression || null, diet || null, activity || null, condition || null, isInitial ? 1 : 0, actor, now, now).run();
    if (items.length) {
      await db.batch(items.map((item) => db.prepare(
        `INSERT INTO order_items (id, batch_id, patient_id, text, is_done, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      ).bind(crypto.randomUUID(), batchId, patientId, item.trim(), now)));
    }
    await audit(patientId, actor, 'orders.approved', `${items.length} دستور`);
    return Response.json({ ok: true });
  }

  // Items can be reworded or removed; anything new goes in a new order. The audit keeps the old text.
  if (body.action === 'editOrderBatch') {
    const patientId = String(body.patientId);
    const batchId = String(body.batchId);
    const batch = await db.prepare(
      'SELECT is_initial AS isInitial, impression, diet, activity, condition FROM order_batches WHERE id = ? AND patient_id = ?',
    ).bind(batchId, patientId).first<OrderHeader & { isInitial: number }>();
    if (!batch) return Response.json({ error: 'این دستور پیدا نشد.' }, { status: 404 });
    const header = orderHeader(body);
    if (batch.isInitial && !isCompleteHeader(header)) return Response.json({ error: orderHeaderError }, { status: 400 });

    const current = await db.prepare('SELECT id, text FROM order_items WHERE batch_id = ?').bind(batchId).all<{ id: string; text: string }>();
    const currentText = new Map(current.results.map((item) => [item.id, item.text]));
    const kept = (Array.isArray(body.items) ? body.items as { id?: unknown; text?: unknown }[] : [])
      .map((item) => ({ id: String(item.id), text: typeof item.text === 'string' ? item.text.trim() : '' }))
      .filter((item) => item.text && currentText.has(item.id));
    if (!kept.length) {
      return Response.json({ error: 'حداقل یک آیتم باید بماند. برای حذف همه آیتم‌ها، کل دستور را حذف کنید.' }, { status: 400 });
    }
    const keptIds = new Set(kept.map((item) => item.id));
    const changed = kept.filter((item) => item.text !== currentText.get(item.id));
    const removed = current.results.filter((item) => !keptIds.has(item.id));
    const headerKeys = (['impression', 'diet', 'activity', 'condition'] as const).filter((key) => batch.isInitial && (batch[key] ?? '') !== header[key]);

    const statements = [
      ...changed.map((item) => db.prepare('UPDATE order_items SET text = ? WHERE id = ?').bind(item.text, item.id)),
      ...removed.map((item) => db.prepare('DELETE FROM order_items WHERE id = ?').bind(item.id)),
    ];
    if (headerKeys.length) {
      statements.push(db.prepare('UPDATE order_batches SET impression = ?, diet = ?, activity = ?, condition = ? WHERE id = ?')
        .bind(header.impression, header.diet, header.activity, header.condition, batchId));
    }
    if (!statements.length) return Response.json({ ok: true });
    await db.batch(statements);
    await audit(patientId, actor, 'orders.edited', [
      ...headerKeys.map((key) => `${key}: «${batch[key] ?? ''}» به «${header[key]}»`),
      ...changed.map((item) => `ویرایش: «${currentText.get(item.id)}» به «${item.text}»`),
      ...removed.map((item) => `حذف: «${item.text}»`),
    ].join(' · '));
    return Response.json({ ok: true });
  }

  if (body.action === 'deleteOrderBatch') {
    const patientId = String(body.patientId);
    const batchId = String(body.batchId);
    const batch = await db.prepare('SELECT is_initial AS isInitial FROM order_batches WHERE id = ? AND patient_id = ?')
      .bind(batchId, patientId).first<{ isInitial: number }>();
    if (!batch) return Response.json({ error: 'این دستور پیدا نشد.' }, { status: 404 });
    // The initial order holds the impression, diet, activity and condition the later orders build on.
    if (batch.isInitial) {
      const others = await db.prepare('SELECT COUNT(*) AS count FROM order_batches WHERE patient_id = ? AND id != ?').bind(patientId, batchId).first<{ count: number }>();
      if (others?.count) return Response.json({ error: 'تا وقتی دستور تکمیلی ثبت شده است، دستور اولیه حذف نمی‌شود. می‌توانید آن را ویرایش کنید.' }, { status: 409 });
    }
    const items = await db.prepare('SELECT text FROM order_items WHERE batch_id = ?').bind(batchId).all<{ text: string }>();
    await db.batch([
      db.prepare('DELETE FROM order_items WHERE batch_id = ?').bind(batchId),
      db.prepare('DELETE FROM order_batches WHERE id = ?').bind(batchId),
    ]);
    await audit(patientId, actor, 'orders.deleted', items.results.map((item) => `«${item.text}»`).join(' · '));
    return Response.json({ ok: true });
  }

  if (body.action === 'toggleOrder') {
    const orderId = String(body.orderId);
    const done = Boolean(body.done);
    const patientId = String(body.patientId);
    await db.prepare('UPDATE order_items SET is_done = ?, done_at = ?, done_by = ? WHERE id = ?')
      .bind(done ? 1 : 0, done ? now : null, done ? actor : null, orderId).run();
    await audit(patientId, actor, done ? 'order.completed' : 'order.reopened', orderId);
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'درخواست ناشناخته است.' }, { status: 400 });
}
