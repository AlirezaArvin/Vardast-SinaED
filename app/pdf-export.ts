import {
  airwayAssessmentOptions,
  airwayInterventionOptions,
  ampleFields,
  arrivalOptions,
  breathingAssessmentOptions,
  breathingInterventionOptions,
  circulationInterventionOptions,
  findingFields,
  internalBleedingSiteOptions,
  mechanismOptions,
} from '@/lib/clinical-types';
import type { HistoryDraft, OrderBatch, Patient, TraumaForm } from '@/lib/clinical-types';

// PDFs are produced by the browser's own print engine ("Save as PDF"): it is the only renderer that
// shapes Persian script and mixed RTL/LTR text correctly, and it keeps the text selectable.

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const blank = (value: string | null | undefined) => !value?.trim();
const show = (value: string | null | undefined) => (blank(value) ? '<span class="empty">—</span>' : escapeHtml(value!.trim()));

function faDate(value: string | Date) {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function gcsTotal(eye: string, verbal: string, motor: string) {
  return eye && verbal && motor ? String(Number(eye) + Number(verbal) + Number(motor)) : '';
}

function fontFaces(origin: string) {
  const face = (family: string, file: string, range: string) => `@font-face {
    font-family: '${family}'; font-style: normal; font-weight: 100 900;
    src: url('${origin}/fonts/${file}') format('woff2-variations'); unicode-range: ${range};
  }`;
  return [
    face('Vardast Persian Digits', 'persian-digits-wght-normal.woff2', 'U+0030-0039'),
    face('Vazirmatn Variable', 'vazirmatn-arabic-wght-normal.woff2', 'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC'),
    face('Vazirmatn Variable', 'vazirmatn-latin-ext-wght-normal.woff2', 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'),
    face('Vazirmatn Variable', 'vazirmatn-latin-wght-normal.woff2', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'),
  ].join('\n');
}

const styles = `
  @page {
    size: A4; margin: 12mm 12mm 16mm;
    @bottom-left { content: 'صفحه ' counter(page, persian) ' از ' counter(pages, persian); font: 8pt 'Vazirmatn Variable', sans-serif; color: #64748b; }
    @bottom-right { content: 'وردست · سامانه ثبت و پیگیری بیماران'; font: 8pt 'Vazirmatn Variable', sans-serif; color: #64748b; }
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #0f172a; font: 9.5pt/1.75 'Vardast Persian Digits', 'Vazirmatn Variable', Tahoma, sans-serif; }
  .latin-digits { font-family: 'Vazirmatn Variable', Tahoma, sans-serif; }
  table { border-collapse: collapse; width: 100%; }
  .sheet > thead > tr > td, .sheet > tbody > tr > td { padding: 0; }
  .masthead { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding-bottom: 6px; border-bottom: 2px solid #0d4f4a; }
  .masthead .brand { font-size: 8pt; color: #0d6b63; font-weight: 700; }
  .masthead h1 { margin: 0; font-size: 15pt; font-weight: 900; line-height: 1.5; }
  .masthead .meta { text-align: left; font-size: 7.5pt; color: #475569; line-height: 1.6; }
  .patient { display: grid; grid-template-columns: 2.2fr 1.6fr 0.8fr 0.8fr 0.8fr 0.8fr 1.8fr; margin: 6px 0 12px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
  .patient > div { padding: 4px 8px; border-left: 1px solid #e2e8f0; background: #f8fafc; }
  .patient > div:last-child { border-left: 0; }
  .patient .k { display: block; font-size: 7pt; color: #64748b; }
  .patient .v { display: block; font-weight: 700; font-size: 9.5pt; }
  section { margin-bottom: 10px; }
  h2 { margin: 0 0 5px; padding: 3px 8px; font-size: 10pt; font-weight: 800; color: #0d4f4a; background: #eaf6f3; border-inline-start: 3px solid #0d4f4a; break-after: avoid; }
  h2 small { font-weight: 500; color: #64748b; font-size: 8pt; margin-inline-start: 4px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .field { border: 1px solid #e2e8f0; border-radius: 5px; padding: 4px 8px; break-inside: avoid; }
  .field.wide { grid-column: 1 / -1; }
  .field .k { font-size: 7.5pt; font-weight: 700; color: #475569; }
  /* Free text keeps its own direction (Persian with Latin terms) but aligns with the document. */
  .bidi { white-space: pre-wrap; unicode-bidi: plaintext; text-align: right !important; }
  [dir='ltr'] .bidi { text-align: left !important; }
  .empty { color: #94a3b8; }
  .data th, .data td { border: 1px solid #cbd5e1; padding: 3px 6px; vertical-align: top; text-align: start; }
  .data thead th { background: #f1f5f9; font-size: 8pt; font-weight: 700; color: #334155; }
  .data tr { break-inside: avoid; }
  .vitals th, .vitals td { text-align: center; }
  .vitals td { font-weight: 700; font-size: 10.5pt; }
  .options { display: flex; flex-wrap: wrap; gap: 2px 12px; }
  .opt { display: inline-flex; align-items: center; gap: 4px; color: #94a3b8; white-space: nowrap; }
  .opt.on { color: #0f172a; font-weight: 700; }
  .box { width: 9px; height: 9px; border: 1px solid #94a3b8; border-radius: 2px; position: relative; flex-shrink: 0; }
  .opt.on .box { background: #0d4f4a; border-color: #0d4f4a; }
  .opt.on .box::after { content: ''; position: absolute; left: 2.5px; top: 0.5px; width: 2.5px; height: 5px; border: solid #fff; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
  .sub { margin-top: 4px; }
  .sub .k { font-size: 8pt; font-weight: 700; color: #475569; }
  .letter { width: 30px; text-align: center !important; font-size: 13pt; font-weight: 900; color: #fff; background: #0d4f4a; }
  .batch { margin-bottom: 10px; break-inside: avoid-page; }
  .batch-head { display: flex; justify-content: space-between; font-weight: 800; margin-bottom: 4px; }
  .batch-head span { font-weight: 500; color: #64748b; font-size: 8.5pt; }
  .status { white-space: nowrap; font-size: 8pt; font-weight: 700; }
  .status.done { color: #047857; }
  .status.open { color: #b45309; }
  .num { width: 26px; text-align: center !important; }
  .signature { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 18px; break-inside: avoid; }
  .signature div { border-top: 1px dashed #94a3b8; padding-top: 4px; font-size: 8pt; color: #475569; height: 52px; }
`;

function patientBand(patient: Patient) {
  const cells: [string, string][] = [
    ['نام و نام خانوادگی', `${patient.firstName} ${patient.lastName}`],
    ['کد ملی', patient.nationalId],
    ['سن', patient.age != null ? `${patient.age} سال` : '—'],
    ['جنسیت', patient.sex],
    ['اتاق', patient.room],
    ['تخت', patient.bed],
    ['زمان پذیرش', faDate(patient.admittedAt)],
  ];
  return `<div class="patient">${cells.map(([key, value]) => `<div><span class="k">${key}</span><span class="v">${escapeHtml(value)}</span></div>`).join('')}</div>`;
}

function documentHtml({ title, patient, physician, body, origin }: { title: string; patient: Patient; physician: string; body: string; origin: string }) {
  // The <thead> repeats on every printed page, so each page carries the patient's identification.
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${fontFaces(origin)}${styles}</style></head><body>
<table class="sheet"><thead><tr><td>
  <div class="masthead">
    <div><div class="brand">اورژانس · بیمارستان سینا</div><h1>${escapeHtml(title)}</h1></div>
    <div class="meta">تاریخ تهیه: ${faDate(new Date())}<br>پزشک معالج: ${escapeHtml(physician)}</div>
  </div>
  ${patientBand(patient)}
</td></tr></thead><tbody><tr><td>${body}</td></tr></tbody></table>
</body></html>`;
}

const field = (label: string, value: string | null | undefined, wide = false) =>
  `<div class="field${wide ? ' wide' : ''}"><div class="k">${label}</div><div class="v bidi">${show(value)}</div></div>`;

const section = (title: string, content: string, subtitle = '') =>
  `<section><h2>${title}${subtitle ? ` <small>${subtitle}</small>` : ''}</h2>${content}</section>`;

const signature = (left: string, right: string) => `<div class="signature"><div>${right}</div><div>${left}</div></div>`;

function historyBody(history: HistoryDraft) {
  const vitals: [string, string][] = [
    ['T °C', history.temperature], ['PR/min', history.pulse], ['BP SYS', history.systolic],
    ['BP DIA', history.diastolic], ['RR/min', history.respiratoryRate], ['SpO2%', history.spo2],
  ];
  const gcs: [string, string][] = [
    ['چشمی (E)', history.gcsEye], ['کلامی (V)', history.gcsVerbal], ['حرکتی (M)', history.gcsMotor],
    ['مجموع GCS', gcsTotal(history.gcsEye, history.gcsVerbal, history.gcsMotor)],
  ];
  const valueTable = (cells: [string, string][], dir = 'rtl') => `<table class="data vitals"><thead><tr>${cells.map(([key]) => `<th dir="${dir}"${dir === 'ltr' ? ' class="latin-digits"' : ''}>${key}</th>`).join('')}</tr></thead><tbody><tr>${cells.map(([, value]) => `<td>${show(value)}</td>`).join('')}</tr></tbody></table>`;
  return [
    section('شکایت اصلی و شرح حال', `<div class="grid">${field('علت مراجعه', history.chiefComplaint, true)}${field('زمان شروع علائم بیماری', history.onset, true)}${field('شرح حال', history.history, true)}</div>`),
    section('سوابق', `<div class="grid">${field('سابقه پزشکی', history.medicalHistory)}${field('سابقه دارویی', history.drugHistory)}${field('سابقه حساسیت دارویی و غذایی', history.allergyHistory, true)}</div>`),
    section('علائم حیاتی', valueTable(vitals, 'ltr')),
    section('وضعیت هوشیاری و درد', `<div class="grid" style="margin-bottom:6px">${field('وضعیت هوشیاری', history.consciousness)}${field('شدت درد (۰ تا ۱۰)', history.painScore)}</div>${valueTable(gcs)}`),
    section('معاینه فیزیکی', field('Physical Exam', history.physicalExam, true)),
    section('نتایج پاراکلینیک', field('Para-clinical Results', history.paraclinicalResults, true)),
    signature('تاریخ و ساعت', 'نام، مهر و امضای پزشک'),
  ].join('');
}

function options(all: readonly string[], selected: string[]) {
  return `<div class="options">${all.map((option) => `<span class="opt${selected.includes(option) ? ' on' : ''}"><span class="box"></span>${escapeHtml(option)}</span>`).join('')}</div>`;
}

const flag = (label: string, on: boolean) => options([label], on ? [label] : []);
const sub = (label: string, value: string) => `<div class="sub"><span class="k">${label}:</span> <span dir="auto">${show(value)}</span></div>`;

function traumaBody(form: TraumaForm) {
  const survey: [string, string, string, string][] = [
    ['A', 'Airway', options(airwayAssessmentOptions, form.airwayAssessment), options(airwayInterventionOptions, form.airwayIntervention)],
    ['B', 'Breathing', options(breathingAssessmentOptions, form.breathingAssessment) + sub('O2 Sat', form.o2Sat) + sub('RR', form.respiratoryRate), options(breathingInterventionOptions, form.breathingIntervention)],
    ['C', 'Circulation',
      flag('Active External Bleeding', form.activeExternalBleeding) + (form.activeExternalBleeding ? sub('Location', form.bleedingLocation) : '')
        + `<div class="sub">${flag('Internal Bleeding', form.internalBleeding)}</div>` + (form.internalBleeding ? `<div class="sub">${options(internalBleedingSiteOptions, form.internalBleedingSites)}</div>` : '')
        + sub('BP', blank(form.systolic) && blank(form.diastolic) ? '' : `${form.systolic || '—'} / ${form.diastolic || '—'}`) + sub('PR', form.pulse) + sub('CR', form.capillaryRefill) + sub('EFAST', form.efast),
      options(circulationInterventionOptions, form.circulationIntervention) + (form.circulationIntervention.includes('Packed Cell') ? sub('Packed Cell (units)', form.packedCellUnits) : '')],
    ['D', 'Disability',
      sub('GCS', `V ${form.gcsVerbal || '—'} · M ${form.gcsMotor || '—'} · E ${form.gcsEye || '—'} · Total ${gcsTotal(form.gcsEye, form.gcsVerbal, form.gcsMotor) || '—'}`) + sub('Pupil', form.pupil) + sub('Sensory Motor Level', form.sensoryMotorLevel),
      flag('Intubation', form.disabilityIntubation)],
    ['E', 'Exposure', sub('Expose & Log roll', form.exposeLogRoll), flag('Prevention of Hypothermia', form.hypothermiaPrevention)],
  ];
  const surveyTable = `<table class="data"><thead><tr><th colspan="2"></th><th>Assessments</th><th>Resuscitation and intervention</th></tr></thead><tbody>${survey.map(([letter, name, assessments, interventions]) => `<tr><td class="letter">${letter}</td><td style="width:72px;font-weight:700">${name}</td><td>${assessments}</td><td>${interventions}</td></tr>`).join('')}</tbody></table>`;
  const textTable = (fields: readonly (readonly [keyof TraumaForm, string])[]) => `<table class="data"><tbody>${fields.map(([key, label]) => `<tr><th style="width:150px">${label}</th><td class="bidi">${show(form[key] as string)}</td></tr>`).join('')}</tbody></table>`;
  const mechanism = options(mechanismOptions, form.mechanism) + (form.mechanism.includes('Other') ? sub('Other mechanism', form.mechanismOther) : '');
  return `<div class="latin-digits" dir="ltr">${[
    section('At the Time of Arrival', options(arrivalOptions, form.arrival), 'وضعیت بیمار در زمان ورود'),
    section('Mechanism of Injury', mechanism, 'مکانیسم آسیب'),
    section('Primary Survey', surveyTable, 'ارزیابی اولیه'),
    section('AMPLE', textTable(ampleFields), 'شرح حال تکمیلی'),
    section('Subject Findings', textTable(findingFields), 'یافته‌های معاینه'),
  ].join('')}</div>${signature('تاریخ و ساعت', 'نام، مهر و امضای پزشک')}`;
}

function ordersBody(batches: OrderBatch[]) {
  // Printed charts read chronologically: the initial order first.
  const chronological = [...batches].sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));
  return chronological.map((batch, index) => `<div class="batch">
    <h2>${batch.isInitial ? 'دستور اولیه' : `دستور تکمیلی ${index.toLocaleString('fa-IR')}`} <small>تأیید: ${faDate(batch.approvedAt)}</small></h2>
    ${batch.isInitial ? `<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:6px">${field('Impression · تشخیص اولیه', batch.impression)}${field('Diet · رژیم غذایی', batch.diet)}${field('Activity · فعالیت', batch.activity)}</div>` : ''}
    <table class="data"><thead><tr><th class="num">#</th><th>دستور</th><th style="width:70px">وضعیت</th><th style="width:120px">زمان انجام</th></tr></thead><tbody>
      ${batch.items.map((item, itemIndex) => `<tr><td class="num">${itemIndex + 1}</td><td class="bidi">${show(item.text)}</td><td><span class="status ${item.isDone ? 'done' : 'open'}">${item.isDone ? 'انجام‌شده' : 'انجام‌نشده'}</span></td><td>${item.doneAt ? faDate(item.doneAt) : '<span class="empty">—</span>'}</td></tr>`).join('')}
    </tbody></table>
  </div>`).join('') + signature('تاریخ و ساعت', 'نام، مهر و امضای پزشک');
}

async function printDocument(html: string, title: string) {
  document.getElementById('pdf-export-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'pdf-export-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0;visibility:hidden';
  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  frame.srcdoc = html;
  document.body.appendChild(frame);
  await loaded;

  const frameDocument = frame.contentDocument!;
  const frameWindow = frame.contentWindow!;
  // Print only once every Vazirmatn face is in, otherwise the PDF falls back to a system font.
  const faces: Promise<unknown>[] = [];
  frameDocument.fonts.forEach((face) => { faces.push(face.load().catch(() => undefined)); });
  await Promise.all(faces);
  await frameDocument.fonts.ready;

  // Browsers name the saved PDF after the page title.
  const previousTitle = document.title;
  document.title = title;
  frameWindow.addEventListener('afterprint', () => { document.title = previousTitle; frame.remove(); }, { once: true });
  frameWindow.focus();
  frameWindow.print();
  // print() blocks until the dialog closes in most browsers; restore the title even where afterprint never fires.
  document.title = previousTitle;
}

const fileTitle = (kind: string, patient: Patient) => `${kind} - ${patient.firstName} ${patient.lastName} - ${patient.nationalId}`;

export function exportHistoryPdf(patient: Patient, history: HistoryDraft, physician: string) {
  const title = 'شرح حال بیمار';
  return printDocument(documentHtml({ title, patient, physician, body: historyBody(history), origin: window.location.origin }), fileTitle(title, patient));
}

export function exportTraumaPdf(patient: Patient, form: TraumaForm, physician: string) {
  const title = 'فرم شرح حال تروما';
  return printDocument(documentHtml({ title, patient, physician, body: traumaBody(form), origin: window.location.origin }), fileTitle(title, patient));
}

export function exportOrdersPdf(patient: Patient, batches: OrderBatch[], physician: string) {
  const title = 'دستورات پزشک';
  return printDocument(documentHtml({ title, patient, physician, body: ordersBody(batches), origin: window.location.origin }), fileTitle(title, patient));
}
