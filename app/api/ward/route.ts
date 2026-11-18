import { audit, getDatabase } from '@/db/runtime';

type RequestBody = Record<string, unknown> & { action?: string; actor?: string };

const patientSelect = `SELECT
  id, national_id AS nationalId, first_name AS firstName, last_name AS lastName,
  birth_date AS birthDate, sex, room, bed, admitted_at AS admittedAt,
  status, discharged_at AS dischargedAt FROM patients`;

export async function GET(request: Request) {
  const db = await getDatabase();
  const url = new URL(request.url);
  const patientId = url.searchParams.get('patientId');
  const resource = url.searchParams.get('resource') ?? 'patients';

  if (resource === 'patient' && patientId) {
    const patient = await db.prepare(`${patientSelect} WHERE id = ?`).bind(patientId).first();
    const historyRow = await db.prepare('SELECT payload FROM histories WHERE patient_id = ?').bind(patientId).first<{ payload: string }>();
    const batches = await db.prepare(
      `SELECT id, impression, diet, activity, is_initial AS isInitial, approved_at AS approvedAt
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
    return Response.json({ patient, history: historyRow ? JSON.parse(historyRow.payload) : null, orderBatches });
  }

  const patients = await db.prepare(`${patientSelect} WHERE status = 'active' ORDER BY admitted_at DESC`).all();
  return Response.json({ patients: patients.results });
}

export async function POST(request: Request) {
  const db = await getDatabase();
  const body = (await request.json()) as RequestBody;
  const actor = String(body.actor ?? 'کاربر بخش');
  const now = new Date().toISOString();

  if (body.action === 'addPatient') {
    const patient = body.patient as Record<string, string>;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO patients (id, national_id, first_name, last_name, birth_date, sex, room, bed, admitted_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    ).bind(id, patient.nationalId, patient.firstName, patient.lastName, patient.birthDate, patient.sex, patient.room, patient.bed, now, now).run();
    await audit(id, actor, 'patient.created', `تخت ${patient.bed}`);
    return Response.json({ ok: true, id });
  }

  if (body.action === 'dischargePatient') {
    const patientId = String(body.patientId);
    await db.prepare("UPDATE patients SET status = 'discharged', discharged_at = ? WHERE id = ?").bind(now, patientId).run();
    await audit(patientId, actor, 'patient.discharged');
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
    const impression = typeof body.impression === 'string' ? body.impression : '';
    const diet = typeof body.diet === 'string' ? body.diet : '';
    const activity = typeof body.activity === 'string' ? body.activity : '';
    const items = (body.items as string[]).filter((item) => item.trim());
    if (isInitial && (!impression || !diet || !activity)) {
      return Response.json({ error: 'تکمیل تشخیص اولیه، رژیم غذایی و فعالیت الزامی است.' }, { status: 400 });
    }
    const batchId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO order_batches (id, patient_id, impression, diet, activity, is_initial, created_by, approved_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(batchId, patientId, impression || null, diet || null, activity || null, isInitial ? 1 : 0, actor, now, now).run();
    if (items.length) {
      await db.batch(items.map((item) => db.prepare(
        `INSERT INTO order_items (id, batch_id, patient_id, text, is_done, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      ).bind(crypto.randomUUID(), batchId, patientId, item.trim(), now)));
    }
    await audit(patientId, actor, 'orders.approved', `${items.length} دستور`);
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
