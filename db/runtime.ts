import { env } from 'cloudflare:workers';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY, national_id TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL,
    last_name TEXT NOT NULL, birth_date TEXT NOT NULL, sex TEXT NOT NULL,
    room TEXT NOT NULL, bed TEXT NOT NULL, admitted_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', discharged_at TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS histories (
    id TEXT PRIMARY KEY, patient_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_batches (
    id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, impression TEXT, diet TEXT,
    activity TEXT, is_initial INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL,
    approved_at TEXT NOT NULL, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, patient_id TEXT NOT NULL,
    text TEXT NOT NULL, is_done INTEGER NOT NULL DEFAULT 0, done_at TEXT,
    done_by TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY, patient_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL,
    detail TEXT, created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_patient ON order_items(patient_id)`,
  `CREATE INDEX IF NOT EXISTS idx_batches_patient ON order_batches(patient_id)`,
];

let initialized = false;

export async function getDatabase() {
  if (!initialized) {
    await env.DB.batch(schemaStatements.map((statement) => env.DB.prepare(statement)));
    await seedDemoPatients();
    initialized = true;
  }
  return env.DB;
}

async function seedDemoPatients() {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM patients').first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  const now = new Date().toISOString();
  const demoPatients = [
    ['p-maryam', '0012456789', 'مریم', 'احمدی', '1347/06/12', 'زن', '۳۰۲', '۲', now],
    ['p-hossein', '0087312564', 'حسین', 'کاظمی', '1339/02/21', 'مرد', '۳۰۴', '۱', new Date(Date.now() - 86400000).toISOString()],
    ['p-farzaneh', '0441258976', 'فرزانه', 'کریمی', '1364/09/03', 'زن', '۳۰۵', '۳', new Date(Date.now() - 172800000).toISOString()],
  ];

  await env.DB.batch(
    demoPatients.map((patient) =>
      env.DB.prepare(
        `INSERT INTO patients (id, national_id, first_name, last_name, birth_date, sex, room, bed, admitted_at, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      ).bind(...patient, now),
    ),
  );
}

export async function audit(patientId: string | null, actor: string, action: string, detail = '') {
  const db = await getDatabase();
  await db.prepare(
    'INSERT INTO audit_events (id, patient_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), patientId, actor, action, detail, new Date().toISOString()).run();
}
