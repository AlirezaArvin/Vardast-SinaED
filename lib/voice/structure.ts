import {
  activityOptions,
  airwayAssessmentOptions,
  airwayInterventionOptions,
  ampleFields,
  arrivalOptions,
  breathingAssessmentOptions,
  breathingInterventionOptions,
  circulationInterventionOptions,
  conditionOptions,
  consciousnessOptions,
  dietOptions,
  findingFields,
  internalBleedingSiteOptions,
  mechanismOptions,
} from '@/lib/clinical-types';
import type { HistoryDraft, OrdersDraft, TraumaForm } from '@/lib/clinical-types';

import { completeJson, HISTORY_LLM_MODEL, TRAUMA_LLM_MODEL } from './openrouter';

export type PatientContext = { sex: 'زن' | 'مرد'; age: number | null };

// Terms the speech model should bias toward when the physician switches to English.
export const medicalKeyterms = [
  'NPO', 'PO', 'IV', 'IM', 'SC', 'PRN', 'stat', 'CBC', 'CRP', 'ESR', 'BUN', 'Cr', 'ABG', 'VBG',
  'ECG', 'CXR', 'CT', 'MRI', 'SpO2', 'GCS', 'BP', 'PR', 'RR', 'BS', 'U/A', 'Impression',
];

export const traumaKeyterms = [
  ...medicalKeyterms, 'EFAST', 'FAST', 'ETT', 'MVC', 'GSW', 'PTX', 'HTX', 'Flail Chest', 'Tension', 'C-Collar',
  'Backboard', 'Log roll', 'Chest Tube', 'Packed Cell', 'MTP', 'Foley', 'PXR', 'AMPLE', 'Morison', 'Apnea', 'Gasping',
];

const transcriptRules = `The user message is an automatic speech-recognition transcript of an Iranian physician dictating in Persian on a hospital ward. It becomes part of the patient's medical record.
The transcript may have little or no punctuation, recognition errors, numbers spoken as words, and English medical terms written in Persian script (for example "سی بی سی" means CBC).

Rules:
- Extract only what the physician actually said. Never invent, infer, or add clinical content.
- If something was not mentioned, return an empty string (or an empty array) for it.
- In this clinical setting every word must be correct and meaningful. Speech recognition often replaces a word with one that sounds alike but makes no sense here (e.g. «تنگی نفت» for تنگی نفس, «سرفه خط دار» for سرفه خلط‌دار, «تندرست» for تندرنس, «سفت ریا کسون» for Ceftriaxone).
  When a word is wrong or meaningless in context, replace only that word with the most probable word that fits the clinical context and sounds similar. Leave every other word as dictated.
  Speech recognition also splits one medical term into pieces (e.g. «هایپو تنشن», «آموکسی سیلین»): join them into the one term. A corrected or joined term then follows the Latin-script rule below (Hypotension, Amoxicillin).
  Never change a number, dose, unit, side (left/right) or negation this way: a wrong one still reads as meaningful, so guessing could silently corrupt the record.
- Every medical term the physician said in a Latin-script language (English, or French-derived terms such as لاسراسیون) stays in Latin script with its standard English spelling: diagnoses, findings, anatomy, procedures, tests, drugs and abbreviations (e.g. Laceration, Tenderness, Pneumothorax, Occipital, CBC, Losartan). This applies whether the transcript has the term in Latin or in Persian script («لاسراسیون» → Laceration, «تندرنس» → Tenderness, «سی بی سی» → CBC).
  A Persian-script word that is a transliteration of such a term counts too, even when it is common in Persian medical speech: «آپاندیسیت» → Appendicitis, «هایپوکندر» → Hypochondrium, «دفورمیتی» → Deformity, «فمور» → Femur, «گاردینگ» → Guarding, «هایپرتنشن» → Hypertension, «کانسالت» → Consult. Never translate such a term into a Persian word and never write it in Persian script.
  Only native Persian words stay in Persian (e.g. درد، شکم، دنده، خونریزی، تب، سرفه).`;

const transcriptContext = `${transcriptRules}
- Write free text in concise, professional Persian, with the Latin-script medical terms kept as above.`;

const historySystem = `${transcriptContext}

Fill the admission history form:
- Numeric fields (temperature, pulse, systolic, diastolic, respiratoryRate, spo2, painScore, gcs*) must contain Latin digits only, no units. Temperature is in °C. Split blood pressure "120 روی 80" into systolic 120 and diastolic 80.
- GCS components: fill them only if stated individually, or if the total is 15 (4/5/6) or 3 (1/1/1). Otherwise leave them empty.
- consciousness must be one of the allowed values, and only if the level of consciousness was stated.
- chiefComplaint: only the main complaint that brought the patient in, as a short noun phrase that reads naturally after «با شکایت از» (e.g. درد شکم، تب و لرز), without a leading «از». Associated symptoms belong in history, not here.
- onset: a short time phrase that reads naturally after «از» (e.g. سه روز پیش), without a leading «از».
- statedSex and statedAge: the patient's sex (آقا or خانم) and age in years, only if the physician said them; otherwise empty.
- history: the narrative of the present illness as dictated (it is rewritten in a later step). Leave it empty if the physician did not describe the complaint or the illness.
- medicalHistory: all past medical history (previous diseases, prior test results such as an old EF), past surgical history (operations and procedures such as angiography) and family history. Put family history last, starting with «سابقه خانوادگی:». If no family history was mentioned, never put «سابقه خانوادگی:». 
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
- activity: map to an allowed value only if stated (استراحت مطلق or استراحت در تخت means CBR; خارج از تخت or نشستن کنار تخت means OOB; راه رفتن or حرکت آزاد means Ambulate). Otherwise empty.
- condition: the patient's condition, mapped to an allowed value only if stated (بحرانی or بدحال means Critical; اورژانسی means Emergent; فوری means Urgent; نسبتاً خوب or متوسط means Fair; خوب or پایدار means Good). Otherwise empty.
- items: every other order as a separate item, in the dictated order: each lab test, imaging study, consult, nursing instruction and medication is its own item.
  Write medications in standard form, e.g. "Ceftriaxone 1 g IV q12h". Never change a dose, route or frequency, and never add one that was not said.
  Do not put the impression, diet, activity or condition in items.`;

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
  required: ['impression', 'diet', 'activity', 'condition', 'items'],
  properties: {
    impression: { type: 'string', description: 'Working diagnosis (تشخیص اولیه), with Latin-script medical terms kept in Latin' },
    diet: { type: 'string', enum: ['', ...dietOptions], description: 'رژیم غذایی' },
    activity: { type: 'string', enum: ['', ...activityOptions], description: 'فعالیت' },
    condition: { type: 'string', enum: ['', ...conditionOptions], description: 'وضعیت بیمار' },
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
  const raw = (await completeJson(historySystem, transcript, 'admission_history', historySchema, 'low', HISTORY_LLM_MODEL)) as Record<string, unknown>;
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
    const narrative = (await completeJson(narrativeSystem, message, 'history_narrative', narrativeSchema, 'medium', HISTORY_LLM_MODEL)) as Record<string, unknown>;
    draft.history = [opening, text(narrative.continuation)].filter(Boolean).join(' ');
  }
  return draft;
}

export async function structureOrders(transcript: string): Promise<OrdersDraft> {
  const raw = (await completeJson(ordersSystem, transcript, 'physician_orders', ordersSchema)) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items.map(text).filter(Boolean).slice(0, 50) : [];
  return { impression: text(raw.impression), diet: oneOf(raw.diet, dietOptions), activity: oneOf(raw.activity, activityOptions), condition: oneOf(raw.condition, conditionOptions), items };
}

const traumaSystem = `${transcriptRules}
- Write every free-text value in concise, professional written Persian, as the physician would chart it, with the Latin-script medical terms kept as above (e.g. «Laceration 3 سانتی‌متری در ناحیه Occipital، بدون خونریزی فعال»; EFAST, PTX, GCS, Morison). Write numbers with Latin digits.

Fill the multiple trauma form. Tick an option only if the physician said it or used a clear Persian equivalent; never infer one option from another (an MVC does not imply Blunt).
- arrival: what the patient arrived with or received before reaching the ED. AM or PM is the arrival time (صبح/قبل از ظهر → AM, بعد از ظهر/عصر/شب → PM). Airway is a prehospital airway device in general, Oral an oral airway, ETT an endotracheal tube (لوله تراشه، اینتوبه آمده). تخته پشتی → Backboard, کولار گردنی → Cervical Collar, آتل → Splinting, رگ/آنژیوکت → IV Line, اکسیژن → O2, دارو → Medication, احیا → CPR.
- mechanism: تصادف → MVC; عابر پیاده → Pedestrian; سرنشین → Passenger; راننده (including راننده موتور) → Driver; خودرو/ماشین → Car; موتور/موتورسیکلت → Motor; دوچرخه → Bicycle; سقوط/زمین خوردن → Fall; سقوط از ارتفاع → Fall and Height; نزاع/ضرب و جرح → Assault; بلانت/غیرنافذ → Blunt; نافذ → Penetrating; چاقو/ضربه چاقو → Stab; گلوله/اسلحه گرم → GSW; SGW only if the physician says SGW. A mechanism not in the list (e.g. سوختگی، گاز گرفتگی) goes in mechanismOther.
- Some options appear in more than one list. Put each item where the physician placed it: a finding in an Assessments list, a procedure done in the ED in an intervention list, and something the patient arrived with from the prehospital team in arrival.
  Gasping and Apnea: tick them under airwayAssessment, breathingAssessment, or both, matching what was described; if unclear, tick both.
  Intubation done to secure the airway goes in airwayIntervention; set disabilityIntubation only when the intubation is linked to a low GCS or decreased consciousness.
- Breathing: any comment on breath sounds (صدای تنفس، کاهش صدای ریه) → Breathing Sound, and also describe it in the chest finding. پنوموتوراکس فشارنده → Tension PTX, هموتوراکس ماسیو → Massive HTX, قفسه سینه مواج → Flail Chest, تنفس نرمال/طبیعی → Normal. Needle Tracheostomy is needle decompression of the chest.
- Circulation: set activeExternalBleeding and bleedingLocation if active external bleeding is described; set internalBleeding and its sites (Chest, Abdomen, Pelvis, Long Bones Deformity) if internal bleeding is described; a deformity of a long bone (femur, tibia, humerus, ساق، ران، بازو، دفورمیتی) always sets internalBleeding and Long Bones Deformity. پک سل/پکد سل → Packed Cell, with the number of units in packedCellUnits if said. CR is the capillary refill time in seconds. efast: the EFAST/FAST result.
- Numeric fields (o2Sat, respiratoryRate, systolic, diastolic, pulse, capillaryRefill, packedCellUnits, gcs*) contain Latin digits only, no units. Convert spoken numbers word by word and exactly: «نود و یک» is 91, «صد و بیست» is 120, «صد و ده» is 110, «هشتاد و پنج» is 85. Take each value from the words right after its label (نبض/پی آر → pulse, ساچوریشن/اشباع → o2Sat, تنفس/آر آر → respiratoryRate). Split blood pressure "120 روی 80" into systolic 120 and diastolic 80.
- GCS components: fill them only if stated individually, or if the total is 15 (V5 M6 E4) or 3 (all 1). Otherwise leave them empty.
- exposeLogRoll: only findings the physician explicitly reported on exposure or log roll (اکسپوز، لاگ رول، پشت بیمار); otherwise empty. hypothermiaPrevention: true only if warming or hypothermia prevention was mentioned.
- AMPLE: allergy, medication (the patient's current drugs), pmhPregnancy (past medical history and pregnancy status), lastMeal, environmentEvent (the circumstances of the injury).
- Subject findings: the secondary-survey examination by body region. Use each region field only for that region; neurologicExam is the neurological examination, vascular is the pulses and perfusion of the limbs.
  Region fields hold examination findings only: never repeat an intervention or device (chest tube, collar, pelvic wrapping), a vital sign, or the GCS, since those have their own fields. Leave a region empty if no finding was reported for it.`;

const inPersian = 'in Persian, Latin-script medical terms kept in Latin';

const traumaFieldDescriptions: Record<string, string> = {
  mechanismOther: `Mechanism not in the list, ${inPersian}`,
  o2Sat: 'O2 saturation percent, digits only',
  respiratoryRate: 'Respiratory rate per minute, digits only',
  bleedingLocation: `Location of active external bleeding, ${inPersian}`,
  systolic: 'Systolic blood pressure, digits only',
  diastolic: 'Diastolic blood pressure, digits only',
  pulse: 'Pulse rate per minute, digits only',
  capillaryRefill: 'Capillary refill time in seconds, digits only',
  efast: `EFAST result, ${inPersian}`,
  packedCellUnits: 'Number of packed cell units, digits only',
  gcsVerbal: 'GCS verbal 1-5, digits only',
  gcsMotor: 'GCS motor 1-6, digits only',
  gcsEye: 'GCS eye 1-4, digits only',
  pupil: `Pupil findings, ${inPersian}`,
  sensoryMotorLevel: `Sensory and motor level, ${inPersian}`,
  exposeLogRoll: `Expose & log roll findings, ${inPersian}`,
  ...Object.fromEntries([...ampleFields, ...findingFields].map(([key, label]) => [key, `${label}, ${inPersian}`])),
};

const traumaLists = {
  arrival: arrivalOptions,
  mechanism: mechanismOptions,
  airwayAssessment: airwayAssessmentOptions,
  airwayIntervention: airwayInterventionOptions,
  breathingAssessment: breathingAssessmentOptions,
  breathingIntervention: breathingInterventionOptions,
  internalBleedingSites: internalBleedingSiteOptions,
  circulationIntervention: circulationInterventionOptions,
} satisfies Partial<Record<keyof TraumaForm, readonly string[]>>;

const traumaFlags = ['activeExternalBleeding', 'internalBleeding', 'disabilityIntubation', 'hypothermiaPrevention'] as const;
const traumaNumericKeys = new Set(['o2Sat', 'respiratoryRate', 'systolic', 'diastolic', 'pulse', 'capillaryRefill', 'packedCellUnits', 'gcsVerbal', 'gcsMotor', 'gcsEye']);
const traumaTextKeys = Object.keys(traumaFieldDescriptions);

const traumaSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...Object.keys(traumaLists), ...traumaFlags, ...traumaTextKeys],
  properties: {
    ...Object.fromEntries(Object.entries(traumaLists).map(([key, options]) => [key, { type: 'array', items: { type: 'string', enum: [...options] } }])),
    ...Object.fromEntries(traumaFlags.map((key) => [key, { type: 'boolean' }])),
    ...Object.fromEntries(traumaTextKeys.map((key) => [key, { type: 'string', description: traumaFieldDescriptions[key] }])),
  },
};

export async function structureTrauma(transcript: string): Promise<TraumaForm> {
  const raw = (await completeJson(traumaSystem, transcript, 'trauma_form', traumaSchema, 'medium', TRAUMA_LLM_MODEL)) as Record<string, unknown>;
  const draft = {
    ...Object.fromEntries(Object.entries(traumaLists).map(([key, options]) => [
      key, Array.isArray(raw[key]) ? options.filter((option) => (raw[key] as unknown[]).includes(option)) : [],
    ])),
    ...Object.fromEntries(traumaFlags.map((key) => [key, raw[key] === true])),
    ...Object.fromEntries(traumaTextKeys.map((key) => [key, traumaNumericKeys.has(key) ? digits(raw[key]) : text(raw[key])])),
  } as TraumaForm;
  // Keep dependent fields consistent with the box that enables them on the form.
  if (draft.mechanismOther && !draft.mechanism.includes('Other')) draft.mechanism.push('Other');
  if (draft.bleedingLocation) draft.activeExternalBleeding = true;
  if (draft.internalBleedingSites.length) draft.internalBleeding = true;
  if (draft.packedCellUnits && !draft.circulationIntervention.includes('Packed Cell')) draft.circulationIntervention.push('Packed Cell');
  return draft;
}
