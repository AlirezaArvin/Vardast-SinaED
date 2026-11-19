import { consciousnessOptions, dietOptions } from '@/lib/clinical-types';
import type { HistoryDraft, OrdersDraft } from '@/lib/clinical-types';

import { completeJson } from './openrouter';

export type PatientContext = { sex: 'زن' | 'مرد'; age: number | null };

// Terms the speech model should bias toward when the physician switches to English.
export const medicalKeyterms = [
  'NPO', 'PO', 'IV', 'IM', 'SC', 'PRN', 'stat', 'CBC', 'CRP', 'ESR', 'BUN', 'Cr', 'ABG', 'VBG',
  'ECG', 'CXR', 'CT', 'MRI', 'SpO2', 'GCS', 'BP', 'PR', 'RR', 'BS', 'U/A', 'Impression',
];

const transcriptContext = `The user message is an automatic speech-recognition transcript of an Iranian physician dictating in Persian on a hospital ward.
The transcript may have little or no punctuation, recognition errors, numbers spoken as words, and English medical terms written in Persian script (for example "سی بی سی" means CBC).

Rules:
- Extract only what the physician actually said. Never invent, infer, or add clinical content.
- If something was not mentioned, return an empty string (or an empty array) for it.
- Fix obvious recognition errors only when the intended medical term is unambiguous.
- Write free text in concise, professional Persian. Keep drug names, lab tests and standard abbreviations in Latin script (e.g. Losartan, CBC).`;

const historySystem = `${transcriptContext}

Fill the admission history form:
- Numeric fields (temperature, pulse, systolic, diastolic, respiratoryRate, spo2, painScore, gcs*) must contain Latin digits only, no units. Temperature is in °C. Split blood pressure "120 روی 80" into systolic 120 and diastolic 80.
- GCS components: fill them only if stated individually, or if the total is 15 (4/5/6) or 3 (1/1/1). Otherwise leave them empty.
- consciousness must be one of the allowed values, and only if the level of consciousness was stated.
- chiefComplaint: only the main complaint that brought the patient in, as a short noun phrase that reads naturally after «با شکایت از» (e.g. درد شکم، تب و لرز), without a leading «از». Associated symptoms belong in history, not here.
- onset: a short time phrase that reads naturally after «از» (e.g. سه روز پیش), without a leading «از».
- statedSex and statedAge: the patient's sex (آقا or خانم) and age in years, only if the physician said them; otherwise empty.
- history: the narrative of the present illness as dictated (it is rewritten in a later step). Leave it empty if the physician did not describe the complaint or the illness.
- medicalHistory: all past medical history (previous diseases, prior test results such as an old EF), past surgical history (operations and procedures such as angiography) and family history. Put family history last, starting with «سابقه خانوادگی:».
- physicalExam: the physical examination findings by system (e.g. lungs, heart, abdomen), excluding vital signs, GCS and level of consciousness.
- paraclinicalResults: results of lab tests, imaging, ECG and other para-clinical studies, keeping each test name with its exact value and unit.`;

const narrativeSystem = `${transcriptContext}

You are completing the history of present illness (شرح حال) of an admission note. The user message gives its opening sentence, which is already written, and the transcript.
Write only the sentences that follow the opening sentence, so that the two read as one formal paragraph.
- Never repeat anything the opening sentence already says: the patient's sex, age, chief complaint, or when it started. Do not begin with «بیمار ... ساله».
- Keep every other detail the physician gave about the present illness (course, character, associated symptoms, what makes it better or worse), without leaving anything out.
- Do not include past medical history, past surgical history or procedures, family history, drug history or allergies: they go in the سابقه پزشکی, سابقه دارویی and حساسیت fields. Also leave out vital signs, GCS, level of consciousness, physical examination and para-clinical results; they have their own fields.
- Use formal written Persian, not colloquial (e.g. «دارد» not «داره»).
- If nothing remains to add, return an empty string.

Example. Opening sentence: «بیمار آقا 50 ساله که با شکایت از سرفه از پنج روز پیش مراجعه کرده است.»
Transcript: «بیمار با سرفه از پنج روز پیش اومده سرفه هاش خلط دار زرده و تب هم داشته»
Wrong: «بیمار با سرفه از پنج روز پیش مراجعه کرده است و سرفه‌ها خلط‌دار است.» (repeats the complaint and onset)
Right: «سرفه‌ها خلط‌دار و زردرنگ است و بیمار تب نیز داشته است.»`;

const narrativeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['continuation'],
  properties: { continuation: { type: 'string', description: 'The sentences that follow the opening sentence' } },
};

const ordersSystem = `${transcriptContext}

Fill the physician order sheet:
- impression: the working diagnosis, if stated.
- diet: map to an allowed value only if stated (ناشتا or ان‌پی‌او means NPO; رژیم معمولی means PO Regular). Otherwise empty.
- activity: the activity order (e.g. استراحت در تخت), if stated.
- items: every other order as a separate item, in the dictated order: each lab test, imaging study, consult, nursing instruction and medication is its own item.
  Write medications in standard form, e.g. "Ceftriaxone 1 g IV q12h". Never change a dose, route or frequency, and never add one that was not said.
  Do not put the impression, diet or activity in items.`;

const historyFieldDescriptions = {
  chiefComplaint: 'علت مراجعه / شکایت اصلی',
  onset: 'زمان شروع علائم: when the symptoms started (e.g. سه روز پیش), not their daily timing or pattern',
  history: 'شرح حال بیماری فعلی',
  medicalHistory: 'سابقه پزشکی: past medical, past surgical and family history',
  drugHistory: 'سابقه دارویی',
  allergyHistory: 'سابقه حساسیت دارویی و غذایی',
  consciousness: 'وضعیت هوشیاری',
  temperature: 'Temperature in °C, digits only',
  pulse: 'Pulse rate per minute, digits only',
  systolic: 'Systolic blood pressure, digits only',
  diastolic: 'Diastolic blood pressure, digits only',
  respiratoryRate: 'Respiratory rate per minute, digits only',
  spo2: 'SpO2 percent, digits only',
  painScore: 'Pain score 0-10, digits only',
  gcsEye: 'GCS eye 1-4, digits only',
  gcsVerbal: 'GCS verbal 1-5, digits only',
  gcsMotor: 'GCS motor 1-6, digits only',
  physicalExam: 'معاینه فیزیکی (Physical Exam)',
  paraclinicalResults: 'نتایج پاراکلینیک: lab, imaging, ECG and other test results',
} satisfies Record<keyof HistoryDraft, string>;

const historyKeys = Object.keys(historyFieldDescriptions) as (keyof HistoryDraft)[];
const numericKeys = new Set<keyof HistoryDraft>([
  'temperature', 'pulse', 'systolic', 'diastolic', 'respiratoryRate', 'spo2', 'painScore', 'gcsEye', 'gcsVerbal', 'gcsMotor',
]);

const historySchema = {
  type: 'object',
  additionalProperties: false,
  required: [...historyKeys, 'statedSex', 'statedAge'],
  properties: {
    ...Object.fromEntries(historyKeys.map((key) => [
      key,
      key === 'consciousness'
        ? { type: 'string', enum: ['', ...consciousnessOptions], description: historyFieldDescriptions[key] }
        : { type: 'string', description: historyFieldDescriptions[key] },
    ])),
    statedSex: { type: 'string', enum: ['', 'آقا', 'خانم'], description: 'Sex, only if dictated' },
    statedAge: { type: 'string', description: 'Age in years, digits only, only if dictated' },
  },
};

const ordersSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['impression', 'diet', 'activity', 'items'],
  properties: {
    impression: { type: 'string', description: 'تشخیص اولیه' },
    diet: { type: 'string', enum: ['', ...dietOptions], description: 'رژیم غذایی' },
    activity: { type: 'string', description: 'فعالیت' },
    items: { type: 'array', items: { type: 'string' }, description: 'One entry per separate order' },
  },
};

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function digits(value: unknown) {
  const latin = text(value)
    .replace(/[۰-۹]/g, (character) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(character)))
    .replace(/[٠-٩]/g, (character) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(character)))
    .replace('٫', '.');
  return latin.match(/\d+(?:\.\d+)?/)?.[0] ?? '';
}

function oneOf<T extends string>(value: unknown, options: readonly T[]) {
  return options.find((option) => option === value) ?? '';
}

// The sentence supplies «با شکایت از» and «از» itself; drop them if the model included them.
function withoutLeadingAz(value: string) {
  return value.replace(/^(?:با\s+)?(?:شکایت\s+)?از\s+/, '').trim();
}

// «بیمار آقا/خانم N ساله که با شکایت از X از Y مراجعه کرده است.» Sex and age come from the dictation first,
// then the patient record; parts that are unknown are left out.
function openingSentence(draft: HistoryDraft, statedSex: string, statedAge: string, patient: PatientContext | null) {
  const title = statedSex || (patient ? (patient.sex === 'زن' ? 'خانم' : 'آقا') : '');
  const age = statedAge || (patient?.age != null ? String(patient.age) : '');
  const complaint = draft.chiefComplaint;
  const onset = draft.onset;
  const words = ['بیمار', title, age && `${age} ساله`, 'که', complaint && `با شکایت از ${complaint}`, complaint && onset && `از ${onset}`, 'مراجعه کرده است.'];
  return words.filter(Boolean).join(' ');
}

export async function structureHistory(transcript: string, patient: PatientContext | null): Promise<HistoryDraft> {
  const raw = (await completeJson(historySystem, transcript, 'admission_history', historySchema)) as Record<string, unknown>;
  const draft = Object.fromEntries(historyKeys.map((key) => [key, numericKeys.has(key) ? digits(raw[key]) : text(raw[key])])) as HistoryDraft;
  draft.consciousness = oneOf(raw.consciousness, consciousnessOptions);
  draft.chiefComplaint = withoutLeadingAz(draft.chiefComplaint);
  draft.onset = withoutLeadingAz(draft.onset);
  // Only open a narrative when the physician dictated the complaint or the illness, so a vitals-only
  // dictation does not overwrite an existing history.
  if (draft.chiefComplaint || draft.history) {
    const opening = openingSentence(draft, oneOf(raw.statedSex, ['آقا', 'خانم'] as const), digits(raw.statedAge), patient);
    // The narrative is written in a second call that sees the opening sentence, so it does not repeat it.
    const message = `Opening sentence:
${opening}

Transcript:
${transcript}`;
    const narrative = (await completeJson(narrativeSystem, message, 'history_narrative', narrativeSchema, 'medium')) as Record<string, unknown>;
    draft.history = [opening, text(narrative.continuation)].filter(Boolean).join(' ');
  }
  return draft;
}

export async function structureOrders(transcript: string): Promise<OrdersDraft> {
  const raw = (await completeJson(ordersSystem, transcript, 'physician_orders', ordersSchema)) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items.map(text).filter(Boolean).slice(0, 50) : [];
  return { impression: text(raw.impression), diet: oneOf(raw.diet, dietOptions), activity: text(raw.activity), items };
}
