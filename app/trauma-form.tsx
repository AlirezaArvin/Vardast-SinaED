'use client';

import { useState } from 'react';
import { LoaderCircle, Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import type { TraumaForm, VoiceResult } from '@/lib/clinical-types';

import { PdfButton } from './pdf-button';
import { useVoiceDictation } from './use-voice-dictation';
import { VoiceBanner } from './voice-banner';

// Dictation only adds to the form: ticked boxes stay ticked, and fields the physician did not mention keep their value.
function mergeDictatedTrauma(current: TraumaForm, dictated: TraumaForm): TraumaForm {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(dictated)) {
    const existing = merged[key];
    if (Array.isArray(value) && Array.isArray(existing)) merged[key] = [...existing, ...value.filter((item) => !existing.includes(item))];
    else if (typeof value === 'boolean') merged[key] = existing === true || value;
    else if (typeof value === 'string' && value.trim()) merged[key] = value;
  }
  return merged as TraumaForm;
}

type TraumaTextField = (typeof ampleFields)[number][0] | (typeof findingFields)[number][0];
const textFields = Object.fromEntries([...ampleFields, ...findingFields].map(([key]) => [key, ''])) as Record<TraumaTextField, string>;

export const emptyTraumaForm: TraumaForm = {
  arrival: [], mechanism: [], mechanismOther: '',
  airwayAssessment: [], airwayIntervention: [],
  breathingAssessment: [], o2Sat: '', respiratoryRate: '', breathingIntervention: [],
  activeExternalBleeding: false, bleedingLocation: '', internalBleeding: false, internalBleedingSites: [],
  systolic: '', diastolic: '', pulse: '', capillaryRefill: '', efast: '', circulationIntervention: [], packedCellUnits: '',
  gcsVerbal: '', gcsMotor: '', gcsEye: '', pupil: '', sensoryMotorLevel: '', disabilityIntubation: false,
  exposeLogRoll: '', hypothermiaPrevention: false,
  ...textFields,
};

type ListKey = { [K in keyof TraumaForm]: TraumaForm[K] extends string[] ? K : never }[keyof TraumaForm];
type TextKey = { [K in keyof TraumaForm]: TraumaForm[K] extends string ? K : never }[keyof TraumaForm];

export function TraumaFormEditor({ initial, patientId, canEdit, onSave, onExportPdf }: { initial: TraumaForm | null; patientId: string; canEdit: boolean; onSave: (form: TraumaForm) => Promise<void>; onExportPdf: () => void }) {
  const [form, setForm] = useState<TraumaForm>({ ...emptyTraumaForm, ...initial });
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState('');
  const voice = useVoiceDictation<TraumaForm>('trauma', ({ transcript: spoken, draft }: VoiceResult<TraumaForm>) => {
    setForm((current) => mergeDictatedTrauma(current, draft));
    setTranscript(spoken);
  }, patientId);
  const disabled = !canEdit;

  const set = (patch: Partial<TraumaForm>) => setForm((current) => ({ ...current, ...patch }));
  const text = (key: TextKey) => ({ value: form[key], onChange: (value: string) => set({ [key]: value }) });
  const list = (key: ListKey) => ({ value: form[key], onChange: (value: string[]) => set({ [key]: value }) });

  const gcsTotal = form.gcsVerbal && form.gcsMotor && form.gcsEye ? Number(form.gcsVerbal) + Number(form.gcsMotor) + Number(form.gcsEye) : null;

  async function save() {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  // The PDF is the saved record; unsaved edits in the form are not part of it.
  function exportPdf() {
    const unsaved = JSON.stringify(form) !== JSON.stringify({ ...emptyTraumaForm, ...initial });
    if (unsaved && !window.confirm('تغییرات ذخیره‌نشده در فایل PDF نمی‌آیند و خروجی از آخرین نسخه ذخیره‌شده ساخته می‌شود. ادامه می‌دهید؟')) return;
    onExportPdf();
  }

  return (
    <div className="latin-digits space-y-5">
      <VoiceBanner status={voice.status} error={voice.error} transcript={transcript} onStart={() => void voice.start()} onStop={voice.stop} disabled={disabled} title="ثبت صوتی فرم تروما" subtitle="یافته‌ها پس از پردازش در فرم زیر علامت‌گذاری و تکمیل می‌شوند. پیش از ذخیره، همه موارد را بازبینی کنید." startLabel="ضبط صوتی فرم تروما" />
      <Section title="At the Time of Arrival" subtitle="وضعیت بیمار در زمان ورود">
        <CheckGroup options={arrivalOptions} {...list('arrival')} disabled={disabled} />
      </Section>

      <Section title="Mechanism of Injury" subtitle="مکانیسم آسیب">
        <CheckGroup
          options={mechanismOptions}
          value={form.mechanism}
          onChange={(mechanism) => set({ mechanism, mechanismOther: mechanism.includes('Other') ? form.mechanismOther : '' })}
          disabled={disabled}
        />
        {form.mechanism.includes('Other') && (
          <Labeled label="Other mechanism" className="mt-4 max-w-xl">
            <Input dir="auto" disabled={disabled} value={form.mechanismOther} onChange={(event) => set({ mechanismOther: event.target.value })} placeholder="شرح مکانیسم آسیب…" />
          </Labeled>
        )}
      </Section>

      <Section title="Primary Survey" subtitle="ارزیابی اولیه">
        <div className="divide-y divide-slate-100">
          <SurveyRow letter="A" name="Airway"
            assessments={<CheckGroup options={airwayAssessmentOptions} {...list('airwayAssessment')} disabled={disabled} />}
            interventions={<CheckGroup options={airwayInterventionOptions} {...list('airwayIntervention')} disabled={disabled} />}
          />
          <SurveyRow letter="B" name="Breathing"
            assessments={<>
              <CheckGroup options={breathingAssessmentOptions} {...list('breathingAssessment')} disabled={disabled} />
              <div className="mt-4 grid max-w-xs grid-cols-2 gap-3">
                <NumberField label="O2 Sat" {...text('o2Sat')} disabled={disabled} />
                <NumberField label="RR" {...text('respiratoryRate')} disabled={disabled} />
              </div>
            </>}
            interventions={<CheckGroup options={breathingInterventionOptions} {...list('breathingIntervention')} disabled={disabled} />}
          />
          <SurveyRow letter="C" name="Circulation"
            assessments={<div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Check label="Active External Bleeding" checked={form.activeExternalBleeding} disabled={disabled}
                  onChange={(checked) => set({ activeExternalBleeding: checked, bleedingLocation: checked ? form.bleedingLocation : '' })} />
                <Labeled label="Location" inline className="min-w-48 flex-1">
                  <Input dir="auto" disabled={disabled || !form.activeExternalBleeding} value={form.bleedingLocation} onChange={(event) => set({ bleedingLocation: event.target.value })} />
                </Labeled>
              </div>
              <div>
                <Check label="Internal Bleeding" checked={form.internalBleeding} disabled={disabled}
                  onChange={(checked) => set({ internalBleeding: checked, internalBleedingSites: checked ? form.internalBleedingSites : [] })} />
                <div className="mt-2 border-l-2 border-slate-200 pl-4">
                  <CheckGroup options={internalBleedingSiteOptions} {...list('internalBleedingSites')} disabled={disabled || !form.internalBleeding} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <NumberField label="BP SYS" {...text('systolic')} disabled={disabled} />
                <NumberField label="BP DIA" {...text('diastolic')} disabled={disabled} />
                <NumberField label="PR" {...text('pulse')} disabled={disabled} />
                <NumberField label="CR" {...text('capillaryRefill')} disabled={disabled} />
              </div>
              <Labeled label="EFAST">
                <Textarea dir="auto" disabled={disabled} className="min-h-24" value={form.efast} onChange={(event) => set({ efast: event.target.value })} />
              </Labeled>
            </div>}
            interventions={<>
              <CheckGroup
                options={circulationInterventionOptions}
                value={form.circulationIntervention}
                onChange={(circulationIntervention) => set({ circulationIntervention, packedCellUnits: circulationIntervention.includes('Packed Cell') ? form.packedCellUnits : '' })}
                disabled={disabled}
              />
              {form.circulationIntervention.includes('Packed Cell') && (
                <div className="mt-4 max-w-48"><NumberField label="Packed Cell (units)" {...text('packedCellUnits')} disabled={disabled} /></div>
              )}
            </>}
          />
          <SurveyRow letter="D" name="Disability"
            assessments={<div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <div className="mb-3 flex items-center justify-between"><h5 className="text-sm font-bold">GCS</h5><Badge variant="outline">Total: {gcsTotal ?? '—'}</Badge></div>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField label="V (1–5)" min={1} max={5} {...text('gcsVerbal')} disabled={disabled} />
                  <NumberField label="M (1–6)" min={1} max={6} {...text('gcsMotor')} disabled={disabled} />
                  <NumberField label="E (1–4)" min={1} max={4} {...text('gcsEye')} disabled={disabled} />
                </div>
              </div>
              <Labeled label="Pupil"><Input dir="auto" disabled={disabled} value={form.pupil} onChange={(event) => set({ pupil: event.target.value })} /></Labeled>
              <Labeled label="Sensory Motor Level"><Input dir="auto" disabled={disabled} value={form.sensoryMotorLevel} onChange={(event) => set({ sensoryMotorLevel: event.target.value })} /></Labeled>
            </div>}
            interventions={<Check label="Intubation" checked={form.disabilityIntubation} onChange={(disabilityIntubation) => set({ disabilityIntubation })} disabled={disabled} />}
          />
          <SurveyRow letter="E" name="Exposure"
            assessments={<Labeled label="Expose & Log roll"><Textarea dir="auto" disabled={disabled} value={form.exposeLogRoll} onChange={(event) => set({ exposeLogRoll: event.target.value })} /></Labeled>}
            interventions={<Check label="Prevention of Hypothermia" checked={form.hypothermiaPrevention} onChange={(hypothermiaPrevention) => set({ hypothermiaPrevention })} disabled={disabled} />}
          />
        </div>
      </Section>

      <Section title="AMPLE" subtitle="شرح حال تکمیلی">
        <div className="grid gap-4 sm:grid-cols-2">
          {ampleFields.map(([key, label]) => (
            <Labeled key={key} label={label}><Textarea dir="auto" disabled={disabled} value={form[key]} onChange={(event) => set({ [key]: event.target.value })} /></Labeled>
          ))}
        </div>
      </Section>

      <Section title="Subject Findings" subtitle="یافته‌های معاینه">
        <div className="grid gap-4 sm:grid-cols-2">
          {findingFields.map(([key, label]) => (
            <Labeled key={key} label={label}><Textarea dir="auto" disabled={disabled} value={form[key]} onChange={(event) => set({ [key]: event.target.value })} /></Labeled>
          ))}
        </div>
      </Section>

      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <PdfButton disabled={!initial} disabledHint="ابتدا فرم تروما را ذخیره کنید." onClick={exportPdf} size="lg" className="h-11 px-5 shadow-lg" />
        <Button disabled={disabled || saving} onClick={() => void save()} size="lg" className="h-11 bg-[#0d4f4a] px-5 text-white shadow-lg">
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />} ذخیره فرم تروما
        </Button>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/80">
      <CardHeader><CardTitle dir="ltr" className="flex flex-wrap items-baseline justify-between gap-2 font-bold"><span>{title}</span><span dir="rtl" className="text-xs font-medium text-slate-400">{subtitle}</span></CardTitle></CardHeader>
      <CardContent dir="ltr">{children}</CardContent>
    </Card>
  );
}

function SurveyRow({ letter, name, assessments, interventions }: { letter: string; name: string; assessments: React.ReactNode; interventions: React.ReactNode }) {
  return (
    <div className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[7rem_1fr_1fr]">
      <div className="flex items-center gap-3 lg:flex-col lg:items-start">
        <span className="grid size-11 place-items-center rounded-xl bg-[#0d4f4a] text-xl font-black text-white">{letter}</span>
        <span className="text-sm font-semibold text-slate-500">{name}</span>
      </div>
      <div><h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Assessments</h4>{assessments}</div>
      <div className="lg:border-l lg:border-slate-100 lg:pl-5"><h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Resuscitation and intervention</h4>{interventions}</div>
    </div>
  );
}

function CheckGroup({ options, value, onChange, disabled }: { options: readonly string[]; value: string[]; onChange: (value: string[]) => void; disabled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Check key={option} label={option} checked={value.includes(option)} disabled={disabled}
          onChange={(checked) => onChange(checked ? [...value, option] : value.filter((item) => item !== option))} />
      ))}
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition select-none has-disabled:cursor-not-allowed has-disabled:opacity-55 ${checked ? 'border-[#0d6b63] bg-[#eaf6f3] font-semibold text-[#0d4f4a]' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'}`}>
      <input type="checkbox" className="size-4 accent-[#0d6b63]" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Labeled({ label, children, inline = false, className = '' }: { label: string; children: React.ReactNode; inline?: boolean; className?: string }) {
  return <label className={`${inline ? 'flex items-center gap-2' : 'grid gap-1.5'} text-sm text-slate-700 ${className}`}><span className="shrink-0 font-semibold">{label}</span>{children}</label>;
}

function NumberField({ label, value, onChange, disabled, min, max }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; min?: number; max?: number }) {
  return (
    <label className="grid gap-1 text-xs text-slate-500">
      <span className="text-center font-medium">{label}</span>
      <Input disabled={disabled} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className="text-center" />
    </label>
  );
}
