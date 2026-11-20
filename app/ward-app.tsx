'use client';

import { SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Ambulance,
  ArrowRight,
  BedDouble,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  HeartPulse,
  LoaderCircle,
  Plus,
  Pencil,
  PlusCircle,
  Save,
  Search,
  Stethoscope,
  Trash2,
  UserPlus,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { activityLabels, activityOptions, conditionOptions, consciousnessOptions, dietOptions } from '@/lib/clinical-types';
import type { HistoryDraft, OrderBatch, OrderItem, OrdersDraft, Patient, TraumaForm, VoiceResult } from '@/lib/clinical-types';

import { PdfButton } from './pdf-button';
import { exportHistoryPdf, exportOrdersPdf, exportTraumaPdf } from './pdf-export';
import { emptyTraumaForm, TraumaFormEditor } from './trauma-form';
import { DictationInput, DictationTextarea } from './dictation-field';
import { useVoiceDictation } from './use-voice-dictation';
import { VoiceBanner } from './voice-banner';

type Role = 'پزشک' | 'مسئول پذیرش بخش' | 'مدیر سیستم';
type ProfileData = { patient: Patient; history: HistoryDraft | null; traumaForm: TraumaForm | null; orderBatches: OrderBatch[] };

const emptyHistory: HistoryDraft = {
  chiefComplaint: '', onset: '', history: '', medicalHistory: '', drugHistory: '', allergyHistory: '',
  consciousness: 'هوشیار', temperature: '', pulse: '', systolic: '', diastolic: '', respiratoryRate: '', spo2: '',
  painScore: '', gcsEye: '', gcsVerbal: '', gcsMotor: '', physicalExam: '', paraclinicalResults: '',
};

const roleNames: Record<Role, string> = {
  پزشک: 'دکتر سارا محمدی',
  'مسئول پذیرش بخش': 'خانم نرگس رضایی',
  'مدیر سیستم': 'مدیر سامانه',
};

function toLatinDigits(value: string) {
  return value.replace(/[۰-۹]/g, (character) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(character))).replace(/[٠-٩]/g, (character) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(character)));
}

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

// Dictated values fill in the draft; fields the physician did not mention keep what is already there.
function mergeDictatedHistory(current: HistoryDraft, dictated: HistoryDraft): HistoryDraft {
  const merged = { ...current };
  for (const key of Object.keys(dictated) as (keyof HistoryDraft)[]) {
    if (dictated[key]?.trim()) merged[key] = dictated[key];
  }
  return merged;
}

async function api(body: Record<string, unknown>) {
  const response = await fetch('/api/ward', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'خطا در ذخیره اطلاعات');
  return data;
}

export function WardApp() {
  const [role, setRole] = useState<Role>('پزشک');
  const actor = roleNames[role];
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState('');

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  };

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/ward');
      const data = await response.json() as { patients: Patient[] };
      setPatients(data.patients);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async (patientId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/ward?resource=patient&patientId=${encodeURIComponent(patientId)}`);
      const data = await response.json() as ProfileData;
      setProfile(data);
      setSelectedId(patientId);
    } finally {
      setLoading(false);
    }
  }, []);

  // oxlint-disable-next-line react/react-compiler -- initial server data must be loaded after hydration.
  useEffect(() => { void loadPatients(); }, [loadPatients]);

  // The physician discharges; the ward desk approves. A discharged patient leaves the physician's list
  // at once and stays at the top of the desk's list, tagged, until the discharge is approved.
  const canDischarge = role === 'پزشک';
  const canApproveDischarge = !canDischarge;
  const pendingCount = patients.filter((patient) => patient.status === 'discharge_pending').length;

  const filteredPatients = useMemo(() => {
    const term = toLatinDigits(search).trim().toLowerCase();
    const visible = canDischarge
      ? patients.filter((patient) => patient.status === 'active')
      : [...patients].sort((a, b) => Number(b.status === 'discharge_pending') - Number(a.status === 'discharge_pending'));
    return visible.filter((patient) => `${patient.firstName} ${patient.lastName} ${patient.nationalId}`.toLowerCase().includes(term));
  }, [patients, search, canDischarge]);

  async function closeAfter(request: Record<string, unknown>, message: string) {
    try {
      await api({ ...request, actor });
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'ثبت ترخیص انجام نشد.');
      return;
    }
    notify(message);
    setSelectedId(null);
    setProfile(null);
    await loadPatients();
  }

  async function discharge(patient: Patient) {
    if (!window.confirm(`آیا از ترخیص ${patient.firstName} ${patient.lastName} مطمئن هستید؟ ترخیص برای تأیید به مسئول پذیرش بخش ارسال می‌شود.`)) return;
    await closeAfter({ action: 'dischargePatient', patientId: patient.id }, 'بیمار ترخیص شد و برای تأیید به مسئول پذیرش بخش ارسال شد.');
  }

  async function approveDischarge(patient: Patient) {
    if (!window.confirm(`ترخیص ${patient.firstName} ${patient.lastName} تأیید شود؟ بیمار از فهرست بیماران خارج می‌شود.`)) return;
    await closeAfter({ action: 'approveDischarge', patientId: patient.id }, 'ترخیص بیمار تأیید شد و از فهرست خارج شد.');
  }

  if (selectedId && profile) {
    return (
      <AppFrame role={role} setRole={setRole}>
        <PatientProfile
          data={profile}
          actor={actor}
          role={role}
          onBack={() => { setSelectedId(null); setProfile(null); void loadPatients(); }}
          onRefresh={() => loadProfile(selectedId)}
          onDischarge={() => discharge(profile.patient)}
          onApproveDischarge={() => approveDischarge(profile.patient)}
          canDischarge={canDischarge}
          canApproveDischarge={canApproveDischarge}
          notify={notify}
        />
        <Toast message={toast} />
      </AppFrame>
    );
  }

  return (
    <AppFrame role={role} setRole={setRole}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#0d6b63]"><Stethoscope className="size-4" /> اورژانس · بیمارستان سینا</div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">بیماران بستری</h1>
            <p className="mt-1 text-sm text-slate-500">{(patients.length - pendingCount).toLocaleString('fa-IR')} بیمار فعال در اورژانس حضور دارند.{canApproveDischarge && pendingCount > 0 && <span className="font-semibold text-amber-700"> · {pendingCount.toLocaleString('fa-IR')} ترخیص در انتظار تأیید</span>}</p>
          </div>
          <Button onClick={() => setAddOpen(true)} size="lg" className="h-11 bg-[#d57b36] px-4 text-white shadow-sm hover:bg-[#c46d2c]">
            <UserPlus /> افزودن بیمار جدید
          </Button>
        </div>

        <Card className="mb-5 border-0 bg-white shadow-sm ring-1 ring-slate-200/80">
          <CardContent>
            <div className="relative max-w-xl">
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="جستجوی بیمار" className="h-11 border-slate-200 bg-slate-50 pr-10" placeholder="جستجو با نام یا کد ملی…" />
            </div>
          </CardContent>
        </Card>

        {loading ? <Loading /> : filteredPatients.length === 0 ? (
          <Card className="border-0 bg-white py-12 text-center shadow-sm"><CardContent><BedDouble className="mx-auto mb-3 size-9 text-slate-300" /><p className="font-bold">بیمار فعالی پیدا نشد</p></CardContent></Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredPatients.map((patient, index) => (
              <PatientCard key={patient.id} patient={patient} index={index} onOpen={() => void loadProfile(patient.id)} onDischarge={() => void discharge(patient)} onApproveDischarge={() => void approveDischarge(patient)} canDischarge={canDischarge} canApproveDischarge={canApproveDischarge} />
            ))}
          </div>
        )}
      </div>

      <AddPatientDialog open={addOpen} onOpenChange={setAddOpen} actor={actor} onSaved={async () => { setAddOpen(false); notify('بیمار با موفقیت بستری شد.'); await loadPatients(); }} />
      <Toast message={toast} />
    </AppFrame>
  );
}

function AppFrame({ role, setRole, children }: { role: Role; setRole: (role: Role) => void; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4f7f6] text-slate-900">
      <header className="border-b border-teal-950/10 bg-[#0d4f4a] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20"><HeartPulse className="size-6" /></span>
            <div><p className="text-lg font-bold">وردست</p><p className="hidden text-xs text-teal-100 sm:block">سامانه ثبت و پیگیری بیماران</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-left sm:block"><p className="text-sm font-semibold">{roleNames[role]}</p><p className="text-xs text-teal-100">{role}</p></div>
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="انتخاب نقش نمایشی" className="h-9 rounded-lg border border-white/20 bg-white/10 px-2 text-xs text-white outline-none [&>option]:text-slate-900">
              <option>پزشک</option><option>مسئول پذیرش بخش</option><option>مدیر سیستم</option>
            </select>
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}

function PatientCard({ patient, index, onOpen, onDischarge, onApproveDischarge, canDischarge, canApproveDischarge }: { patient: Patient; index: number; onOpen: () => void; onDischarge: () => void; onApproveDischarge: () => void; canDischarge: boolean; canApproveDischarge: boolean }) {
  const colors = ['bg-teal-100 text-teal-800', 'bg-blue-100 text-blue-800', 'bg-amber-100 text-amber-800', 'bg-violet-100 text-violet-800'];
  const awaitingApproval = patient.status === 'discharge_pending';
  return (
    <Card className={`border-0 bg-white shadow-sm ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${awaitingApproval ? 'ring-amber-300' : 'ring-slate-200/80'}`}>
      <CardHeader className="grid-cols-[1fr_auto]">
        <div className="flex items-center gap-3">
          <span className={`grid size-12 place-items-center rounded-2xl font-bold ${colors[index % colors.length]}`}>{patient.firstName[0]}{patient.lastName[0]}</span>
          <div><CardTitle className="text-base font-bold">{patient.firstName} {patient.lastName}</CardTitle><p className="mt-1 text-xs text-slate-500">کد ملی: <span dir="ltr">{patient.nationalId}</span></p></div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {patient.isTrauma && <Badge className="bg-red-50 text-red-700">ترومایی</Badge>}
          {awaitingApproval ? <Badge className="bg-amber-100 text-amber-800">ترخیص شده</Badge> : <Badge className="bg-emerald-50 text-emerald-700">بستری فعال</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          <div><p className="text-xs text-slate-400">محل بستری</p><p className="mt-1 font-semibold">اتاق {patient.room} · تخت {patient.bed}</p></div>
          <div><p className="text-xs text-slate-400">زمان پذیرش</p><p className="mt-1 font-semibold">{faDate(patient.admittedAt)}</p></div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={onOpen} className="flex-1 bg-[#0d4f4a] text-white"><ClipboardList /> مشاهده پرونده</Button>
          {canDischarge && !awaitingApproval && <Button onClick={onDischarge} variant="outline" className="text-slate-600">ترخیص</Button>}
          {canApproveDischarge && awaitingApproval && <Button onClick={onApproveDischarge} className="bg-amber-600 text-white hover:bg-amber-700"><CheckCircle2 /> تأیید ترخیص</Button>}
        </div>
      </CardContent>
    </Card>
  );
}

function AddPatientDialog({ open, onOpenChange, actor, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; actor: string; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    values.nationalId = toLatinDigits(values.nationalId).trim();
    values.age = toLatinDigits(values.age).trim();
    if (!/^\d{1,3}$/.test(values.age) || Number(values.age) > 130) { setError('سن واردشده معتبر نیست.'); return; }
    setSaving(true);
    try {
      await api({ action: 'addPatient', patient: values, actor });
      formRef.current?.reset();
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error && reason.message.includes('UNIQUE') ? 'بیماری با این کد ملی قبلاً ثبت شده است.' : 'ثبت بیمار انجام نشد.');
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" dir="rtl">
        <DialogHeader><DialogTitle className="text-lg font-bold">افزودن بیمار جدید</DialogTitle><DialogDescription>اطلاعات پذیرش بیمار را وارد کنید.</DialogDescription></DialogHeader>
        <form ref={formRef} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="نام"><Input required name="firstName" /></Field>
          <Field label="نام خانوادگی"><Input required name="lastName" /></Field>
          <Field label="کد ملی"><Input required name="nationalId" inputMode="numeric" maxLength={10} dir="ltr" /></Field>
          <Field label="سن (سال)"><Input required name="age" inputMode="numeric" maxLength={3} dir="ltr" /></Field>
          <Field label="جنسیت"><select required name="sex" className="control"><option value="زن">زن</option><option value="مرد">مرد</option></select></Field>
          <Field label="شماره اتاق"><Input required name="room" /></Field>
          <Field label="شماره تخت"><Input required name="bed" /></Field>
          <label className="flex cursor-pointer items-center gap-3 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 has-checked:border-red-300 has-checked:bg-red-50 has-checked:text-red-800">
            <input type="checkbox" name="isTrauma" className="size-4 accent-red-600" />
            <Ambulance className="size-4" /> بیمار ترومایی
          </label>
          {error && <p className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
            <Button disabled={saving} type="submit" className="bg-[#0d4f4a] text-white">{saving ? <LoaderCircle className="animate-spin" /> : <UserPlus />} ثبت و بستری</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PatientProfile({ data, actor, role, onBack, onRefresh, onDischarge, onApproveDischarge, canDischarge, canApproveDischarge, notify }: {
  data: ProfileData; actor: string; role: Role; onBack: () => void; onRefresh: () => Promise<void>; onDischarge: () => void; onApproveDischarge: () => void; canDischarge: boolean; canApproveDischarge: boolean; notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<'summary' | 'history' | 'trauma' | 'orders'>('summary');
  const [addingTrauma, setAddingTrauma] = useState(false);
  const patient = data.patient;
  const awaitingApproval = patient.status === 'discharge_pending';
  const canEdit = role !== 'مدیر سیستم';
  const pending = data.orderBatches.flatMap((batch) => batch.items).filter((item) => !item.isDone).length;

  async function exportPdf(build: () => Promise<void>) {
    try { await build(); } catch { notify('ساخت فایل PDF انجام نشد.'); }
  }

  async function addTraumaForm() {
    if (!window.confirm(`فرم شرح حال تروما به پرونده ${patient.firstName} ${patient.lastName} اضافه شود؟`)) return;
    setAddingTrauma(true);
    try {
      await api({ action: 'markTrauma', patientId: patient.id, actor });
      await onRefresh();
      setTab('trauma');
      notify('فرم تروما به پرونده بیمار اضافه شد.');
    } finally { setAddingTrauma(false); }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button onClick={onBack} variant="ghost"><ArrowRight /> بازگشت به بیماران</Button>
        <div className="flex flex-wrap justify-end gap-2">
          {!patient.isTrauma && <Button disabled={!canEdit || addingTrauma} onClick={() => void addTraumaForm()} variant="outline" className="border-red-200 text-red-700 hover:bg-red-50">{addingTrauma ? <LoaderCircle className="animate-spin" /> : <PlusCircle />} اضافه کردن فرم تروما</Button>}
          {canDischarge && !awaitingApproval && <Button onClick={onDischarge} variant="destructive">ترخیص بیمار</Button>}
          {canApproveDischarge && awaitingApproval && <Button onClick={onApproveDischarge} className="bg-amber-600 text-white hover:bg-amber-700"><CheckCircle2 /> تأیید ترخیص</Button>}
        </div>
      </div>
      <Card className="mb-5 border-0 bg-gradient-to-l from-[#0d4f4a] to-[#14746b] text-white shadow-lg ring-0">
        <CardContent className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-2xl bg-white/15 text-xl font-black ring-1 ring-white/20">{patient.firstName[0]}{patient.lastName[0]}</span>
            <div><h1 className="flex flex-wrap items-center gap-2 text-2xl font-black">{patient.firstName} {patient.lastName}{patient.isTrauma && <Badge className="bg-red-500 text-white">ترومایی</Badge>}{awaitingApproval && <Badge className="bg-amber-300 text-amber-950">ترخیص شده</Badge>}</h1><p className="mt-1 text-sm text-teal-100">کد ملی: <span dir="ltr">{patient.nationalId}</span> · {patient.sex}{patient.age != null && ` · ${patient.age} ساله`}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-xs text-teal-100">محل بستری</p><p className="mt-1 font-bold">اتاق {patient.room} · تخت {patient.bed}</p></div>
            <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-xs text-teal-100">دستورات باز</p><p className="mt-1 font-bold">{pending.toLocaleString('fa-IR')} مورد</p></div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-5 flex gap-2 overflow-x-auto rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200/80">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={<Activity />}>خلاصه پرونده</TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<Stethoscope />}>شرح حال</TabButton>
        {patient.isTrauma && <TabButton active={tab === 'trauma'} onClick={() => setTab('trauma')} icon={<Ambulance />}>فرم تروما</TabButton>}
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')} icon={<ClipboardCheck />}>دستورات</TabButton>
      </div>

      {tab === 'summary' && <Summary data={data} onHistory={() => setTab('history')} onTrauma={() => setTab('trauma')} onOrders={() => setTab('orders')} />}
      {tab === 'history' && <HistoryEditor initial={data.history} patientId={patient.id} actor={actor} canEdit={canEdit} onSaved={async () => { notify('شرح حال ذخیره شد.'); await onRefresh(); }} onExportPdf={() => void exportPdf(() => exportHistoryPdf(patient, { ...emptyHistory, ...data.history }, roleNames['پزشک']))} />}
      {tab === 'trauma' && patient.isTrauma && <TraumaFormEditor initial={data.traumaForm} patientId={patient.id} canEdit={canEdit} onSave={async (traumaForm) => { await api({ action: 'saveTraumaForm', patientId: patient.id, traumaForm, actor }); notify('فرم تروما ذخیره شد.'); await onRefresh(); }} onExportPdf={() => void exportPdf(() => exportTraumaPdf(patient, { ...emptyTraumaForm, ...data.traumaForm }, roleNames['پزشک']))} />}
      {tab === 'orders' && <OrdersPanel patientId={patient.id} batches={data.orderBatches} actor={actor} canApprove={role === 'پزشک'} onChanged={async () => { await onRefresh(); }} notify={notify} onExportPdf={() => void exportPdf(() => exportOrdersPdf(patient, data.orderBatches, roleNames['پزشک']))} />}
    </div>
  );
}

function Summary({ data, onHistory, onTrauma, onOrders }: { data: ProfileData; onHistory: () => void; onTrauma: () => void; onOrders: () => void }) {
  const latest = data.orderBatches[0];
  const trauma = data.traumaForm;
  const mechanism = trauma?.mechanism.map((item) => item === 'Other' && trauma.mechanismOther ? trauma.mechanismOther : item).join('، ');
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/80"><CardHeader><CardTitle className="flex items-center gap-2 font-bold"><Stethoscope className="text-[#0d6b63]" /> شرح حال پذیرش</CardTitle></CardHeader><CardContent>{data.history ? <><p className="text-xs text-slate-400">علت مراجعه</p><p className="mt-1 line-clamp-3 leading-7">{data.history.chiefComplaint || '—'}</p></> : <p className="text-sm text-slate-500">هنوز شرح حالی ثبت نشده است.</p>}<Button onClick={onHistory} variant="outline" className="mt-4 w-full">مشاهده و ویرایش <ChevronLeft /></Button></CardContent></Card>
      {data.patient.isTrauma && <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/80"><CardHeader><CardTitle className="flex items-center gap-2 font-bold"><Ambulance className="text-red-600" /> فرم شرح حال تروما</CardTitle></CardHeader><CardContent>{trauma ? <><p className="text-xs text-slate-400">مکانیسم آسیب</p><p dir="auto" className="mt-1 line-clamp-2 leading-7">{mechanism || '—'}</p></> : <p className="text-sm text-slate-500">فرم تروما هنوز تکمیل نشده است.</p>}<Button onClick={onTrauma} variant="outline" className="mt-4 w-full">مشاهده و تکمیل فرم <ChevronLeft /></Button></CardContent></Card>}
      <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/80"><CardHeader><CardTitle className="flex items-center gap-2 font-bold"><ClipboardCheck className="text-[#d57b36]" /> آخرین دستورات</CardTitle></CardHeader><CardContent>{latest ? <><p className="text-xs text-slate-400">{latest.isInitial ? 'دستور اولیه' : 'دستور تکمیلی'} · {faDate(latest.approvedAt)}</p><p className="mt-2 text-sm">{latest.items.length.toLocaleString('fa-IR')} دستور ثبت‌شده</p></> : <p className="text-sm text-slate-500">هنوز دستوری ثبت نشده است.</p>}<Button onClick={onOrders} variant="outline" className="mt-4 w-full">مشاهده دستورات <ChevronLeft /></Button></CardContent></Card>
    </div>
  );
}

function HistoryEditor({ initial, patientId, actor, canEdit, onSaved, onExportPdf }: { initial: HistoryDraft | null; patientId: string; actor: string; canEdit: boolean; onSaved: () => Promise<void>; onExportPdf: () => void }) {
  const [draft, setDraft] = useState<HistoryDraft>({ ...emptyHistory, ...initial });
  const [saving, setSaving] = useState(false);
  const [transcript, setTranscript] = useState('');
  const voice = useVoiceDictation<HistoryDraft>('history', (result) => {
    setDraft((current) => mergeDictatedHistory(current, result.draft));
    setTranscript(result.transcript);
  }, patientId);
  const gcsTotal = ['gcsEye', 'gcsVerbal', 'gcsMotor'].every((key) => draft[key as keyof HistoryDraft]) ? Number(draft.gcsEye) + Number(draft.gcsVerbal) + Number(draft.gcsMotor) : null;
  const update = (key: keyof HistoryDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  async function save() {
    setSaving(true);
    try { await api({ action: 'saveHistory', patientId, history: draft, actor }); await onSaved(); } finally { setSaving(false); }
  }

  // The PDF is the saved record; unsaved edits in the draft are not part of it.
  function exportPdf() {
    const unsaved = JSON.stringify(draft) !== JSON.stringify({ ...emptyHistory, ...initial });
    if (unsaved && !window.confirm('تغییرات ذخیره‌نشده در فایل PDF نمی‌آیند و خروجی از آخرین نسخه ذخیره‌شده ساخته می‌شود. ادامه می‌دهید؟')) return;
    onExportPdf();
  }

  return (
    <div className="space-y-5">
      <VoiceBanner status={voice.status} error={voice.error} transcript={transcript} onStart={() => void voice.start()} onStop={voice.stop} onUpload={voice.uploadFile} disabled={!canEdit} title="ثبت صوتی شرح حال" subtitle="صدا توسط وردست پردازش و در فرم زیر جای‌گذاری می‌شود. پیش از ذخیره، حتما همه فیلدها را بازبینی کنید." startLabel="ضبط صوتی شرح حال" />
      <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/80"><CardHeader><CardTitle className="font-bold">پیش‌نویس ساختاریافته شرح حال</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="علت مراجعه" className="sm:col-span-2"><DictationTextarea disabled={!canEdit} value={draft.chiefComplaint} onValueChange={(value) => update('chiefComplaint', value)} /></Field>
        <Field label="زمان شروع علائم بیماری" className="sm:col-span-2"><DictationInput disabled={!canEdit} value={draft.onset} onValueChange={(value) => update('onset', value)} /></Field>
        <Field label="شرح حال" className="sm:col-span-2"><DictationTextarea disabled={!canEdit} className="min-h-28" value={draft.history} onValueChange={(value) => update('history', value)} /></Field>
        <Field label="سابقه پزشکی"><DictationTextarea disabled={!canEdit} value={draft.medicalHistory} onValueChange={(value) => update('medicalHistory', value)} /></Field>
        <Field label="سابقه دارویی"><DictationTextarea disabled={!canEdit} value={draft.drugHistory} onValueChange={(value) => update('drugHistory', value)} /></Field>
        <Field label="سابقه حساسیت دارویی و غذایی" className="sm:col-span-2"><DictationTextarea disabled={!canEdit} value={draft.allergyHistory} onValueChange={(value) => update('allergyHistory', value)} /></Field>
        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4"><h3 className="mb-4 font-bold">علائم حیاتی</h3><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniField label="T °C" value={draft.temperature} onChange={(value) => update('temperature', value)} disabled={!canEdit} />
          <MiniField label="PR/min" value={draft.pulse} onChange={(value) => update('pulse', value)} disabled={!canEdit} />
          <MiniField label="BP SYS" value={draft.systolic} onChange={(value) => update('systolic', value)} disabled={!canEdit} />
          <MiniField label="BP DIA" value={draft.diastolic} onChange={(value) => update('diastolic', value)} disabled={!canEdit} />
          <MiniField label="RR/min" value={draft.respiratoryRate} onChange={(value) => update('respiratoryRate', value)} disabled={!canEdit} />
          <MiniField label="SpO2%" value={draft.spo2} onChange={(value) => update('spo2', value)} disabled={!canEdit} />
        </div></div>
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col justify-between gap-4">
            <Field label="شدت درد (۰ تا ۱۰)"><Input disabled={!canEdit} type="number" min="0" max="10" value={draft.painScore} onChange={(event) => update('painScore', event.target.value)} /></Field>
            <Field label="وضعیت هوشیاری"><select disabled={!canEdit} value={draft.consciousness} onChange={(event) => update('consciousness', event.target.value)} className="control">{consciousnessOptions.map((option) => <option key={option}>{option}</option>)}</select></Field>
          </div>
          <div className="flex flex-col justify-center rounded-xl border border-slate-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">GCS</h3><Badge variant="outline">مجموع: {gcsTotal ?? '—'}</Badge></div><div className="grid grid-cols-3 gap-2">
            <MiniField label="چشمی ۱–۴" value={draft.gcsEye} onChange={(value) => update('gcsEye', value)} disabled={!canEdit} />
            <MiniField label="کلامی ۱–۵" value={draft.gcsVerbal} onChange={(value) => update('gcsVerbal', value)} disabled={!canEdit} />
            <MiniField label="حرکتی ۱–۶" value={draft.gcsMotor} onChange={(value) => update('gcsMotor', value)} disabled={!canEdit} />
          </div></div>
        </div>
        <Field label="معاینه فیزیکی (Physical Exam)" className="sm:col-span-2"><DictationTextarea disabled={!canEdit} className="min-h-28" value={draft.physicalExam} onValueChange={(value) => update('physicalExam', value)} /></Field>
        <div className="sm:col-span-2 rounded-xl border border-slate-200 p-4"><h3 className="mb-4 font-bold">نتایج پاراکلینیک (Para-clinical Results)</h3><DictationTextarea disabled={!canEdit} aria-label="نتایج پاراکلینیک" className="min-h-28" placeholder="نتایج آزمایش‌ها، تصویربرداری، نوار قلب و…" value={draft.paraclinicalResults} onValueChange={(value) => update('paraclinicalResults', value)} /></div>
        <div className="sm:col-span-2 flex justify-end gap-2"><PdfButton disabled={!initial} disabledHint="ابتدا شرح حال را ذخیره کنید." onClick={exportPdf} /><Button disabled={!canEdit || saving} onClick={() => void save()} className="bg-[#0d4f4a] text-white">{saving ? <LoaderCircle className="animate-spin" /> : <Save />} ذخیره شرح حال</Button></div>
      </CardContent></Card>
    </div>
  );
}

type OrderHeader = { impression: string; diet: string; activity: string; condition: string };
const emptyOrderHeader: OrderHeader = { impression: '', diet: '', activity: '', condition: '' };
const orderHeaderError = 'برای دستور اول، تکمیل تشخیص اولیه، رژیم غذایی، فعالیت و وضعیت الزامی است.';
const isHeaderComplete = (header: OrderHeader) => Boolean(header.impression.trim() && header.diet && header.activity && header.condition);

// Orders saved before these lists existed can hold a value outside them; the picker then starts empty.
function fromList(value: string | null | undefined, options: readonly string[]) {
  return value && options.includes(value) ? value : '';
}

function OrderHeaderFields({ value, onChange, disabled }: { value: OrderHeader; onChange: (value: OrderHeader) => void; disabled: boolean }) {
  const set = (key: keyof OrderHeader) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [key]: event.target.value });
  return (
    <div className="grid gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Impression · تشخیص اولیه *"><input disabled={disabled} className="control h-10" value={value.impression} onChange={set('impression')} /></Field>
      <Field label="Condition · وضعیت *"><select disabled={disabled} className="control h-10" value={value.condition} onChange={set('condition')}><option value="">انتخاب کنید</option>{conditionOptions.map((option) => <option key={option}>{option}</option>)}</select></Field>
      <Field label="Diet · رژیم غذایی *"><select disabled={disabled} className="control h-10" value={value.diet} onChange={set('diet')}><option value="">انتخاب کنید</option>{dietOptions.map((option) => <option key={option}>{option}</option>)}</select></Field>
      <Field label="Activity · فعالیت *"><select disabled={disabled} className="control h-10" value={value.activity} onChange={set('activity')}><option value="">انتخاب کنید</option>{activityOptions.map((option) => <option key={option} value={option}>{activityLabels[option]}</option>)}</select></Field>
    </div>
  );
}

function OrdersPanel({ patientId, batches, actor, canApprove, onChanged, notify, onExportPdf }: { patientId: string; batches: OrderBatch[]; actor: string; canApprove: boolean; onChanged: () => Promise<void>; notify: (message: string) => void; onExportPdf: () => void }) {
  const isInitial = batches.length === 0;
  const [header, setHeader] = useState<OrderHeader>(emptyOrderHeader);
  const [items, setItems] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const voice = useVoiceDictation<OrdersDraft>('orders', applyDictation);

  // Dictated orders are appended to what is already in the draft, never replace it.
  function applyDictation({ transcript: text, draft }: VoiceResult<OrdersDraft>) {
    if (isInitial) {
      setHeader((current) => ({
        impression: draft.impression || current.impression,
        diet: draft.diet || current.diet,
        activity: draft.activity || current.activity,
        condition: draft.condition || current.condition,
      }));
    }
    setItems((current) => {
      const merged = [...current.filter((item) => item.trim()), ...draft.items];
      return merged.length ? merged : [''];
    });
    setTranscript(text);
  }

  async function approve() {
    setError('');
    if (isInitial && !isHeaderComplete(header)) { setError(orderHeaderError); return; }
    if (!items.some((item) => item.trim())) { setError('حداقل یک دستور وارد کنید.'); return; }
    setSaving(true);
    try {
      await api({ action: 'approveOrders', patientId, isInitial, ...header, items, actor });
      setHeader(emptyOrderHeader); setItems(['']); setTranscript(''); notify('دستورات تأیید و به‌صورت جداگانه ثبت شدند.'); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ثبت دستورات انجام نشد.'); } finally { setSaving(false); }
  }

  async function toggle(orderId: string, done: boolean) {
    await api({ action: 'toggleOrder', patientId, orderId, done, actor });
    notify(done ? 'دستور انجام‌شده علامت‌گذاری شد.' : 'دستور دوباره باز شد.'); await onChanged();
  }

  return (
    <div className="space-y-5">
      <VoiceBanner status={voice.status} error={voice.error} transcript={transcript} onStart={() => void voice.start()} onStop={voice.stop} onUpload={voice.uploadFile} disabled={!canApprove} title="ثبت صوتی دستورات" subtitle="هر دستور جداگانه استخراج و به پیش‌نویس اضافه می‌شود. پیش از تأیید، همه آیتم‌ها را بازبینی کنید." />
      <Card className="border-0 bg-white shadow-sm ring-1 ring-slate-200/80"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="font-bold">پیش‌نویس دستور جدید</CardTitle>{isInitial && <Badge className="bg-amber-50 text-amber-800">دستور اولیه بیمار</Badge>}</div></CardHeader><CardContent className="space-y-4">
        {isInitial && <OrderHeaderFields value={header} onChange={setHeader} disabled={!canApprove} />}
        <div><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">آیتم‌های دستور</h3><Button disabled={!canApprove} size="sm" variant="outline" onClick={() => setItems((current) => [...current, ''])}><Plus /> افزودن آیتم</Button></div><div className="space-y-2">{items.map((item, index) => <div key={index} className="flex gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold">{(index + 1).toLocaleString('fa-IR')}</span><DictationInput disabled={!canApprove} className="h-9" value={item} onValueChange={(text) => setItems((current) => current.map((value, itemIndex) => itemIndex === index ? text : value))} placeholder="متن استاندارد دستور" /><Button disabled={!canApprove || items.length === 1} size="icon-lg" variant="ghost" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div>)}</div></div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!canApprove && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">تنها پزشک می‌تواند دستورات را ثبت و تأیید کند.</p>}
        <div className="flex justify-end"><Button disabled={!canApprove || saving} onClick={() => void approve()} className="bg-[#0d4f4a] text-white">{saving ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />} تأیید و ثبت دستورات</Button></div>
      </CardContent></Card>

      <div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-black">دستورات ثبت‌شده</h2><PdfButton disabled={batches.length === 0} disabledHint="هنوز دستوری ثبت نشده است." onClick={onExportPdf} /></div>{batches.length === 0 ? <Card className="border-0 bg-white py-8 text-center shadow-sm"><CardContent><ClipboardCheck className="mx-auto mb-2 size-8 text-slate-300" /><p className="text-sm text-slate-500">هنوز دستوری ثبت نشده است.</p></CardContent></Card> : <div className="space-y-4">{batches.map((batch) => <OrderBatchCard key={batch.id} batch={batch} patientId={patientId} actor={actor} canEdit={canApprove} deletable={!batch.isInitial || batches.length === 1} onToggle={(item) => void toggle(item.id, !item.isDone)} onChanged={onChanged} notify={notify} />)}</div>}</div>
    </div>
  );
}

// A saved order: items are ticked off as they are done, and the physician can reword, remove or delete them.
function OrderBatchCard({ batch, patientId, actor, canEdit, deletable, onToggle, onChanged, notify }: { batch: OrderBatch; patientId: string; actor: string; canEdit: boolean; deletable: boolean; onToggle: (item: OrderItem) => void; onChanged: () => Promise<void>; notify: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [header, setHeader] = useState<OrderHeader>(emptyOrderHeader);
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const title = batch.isInitial ? 'دستور اولیه' : 'دستور تکمیلی';

  function startEditing() {
    setHeader({ impression: batch.impression ?? '', diet: fromList(batch.diet, dietOptions), activity: fromList(batch.activity, activityOptions), condition: fromList(batch.condition, conditionOptions) });
    setItems(batch.items.map(({ id, text }) => ({ id, text })));
    setError('');
    setEditing(true);
  }

  async function save() {
    setError('');
    if (batch.isInitial && !isHeaderComplete(header)) { setError(orderHeaderError); return; }
    if (items.some((item) => !item.text.trim())) { setError('متن یکی از آیتم‌ها خالی است. برای حذف آیتم از دکمه حذف کنار آن استفاده کنید.'); return; }
    setBusy(true);
    try {
      await api({ action: 'editOrderBatch', patientId, batchId: batch.id, ...header, items, actor });
      setEditing(false); notify('تغییرات دستور ذخیره شد.'); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'ذخیره تغییرات انجام نشد.'); } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm(`${title} ثبت‌شده در ${faDate(batch.approvedAt)} با ${batch.items.length.toLocaleString('fa-IR')} آیتم حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    setError('');
    setBusy(true);
    try {
      await api({ action: 'deleteOrderBatch', patientId, batchId: batch.id, actor });
      notify('دستور حذف شد.'); await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'حذف دستور انجام نشد.'); } finally { setBusy(false); }
  }

  return (
    <Card className={`border-0 bg-white shadow-sm ring-1 ${editing ? 'ring-teal-300' : 'ring-slate-200/80'}`}><CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><CardTitle className="font-bold">{title}</CardTitle><span className="text-xs text-slate-400">{faDate(batch.approvedAt)}</span></div>
        {canEdit && !editing && <div className="flex gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={startEditing}><Pencil /> ویرایش</Button>
          <Button size="sm" variant="ghost" disabled={busy || !deletable} title={deletable ? 'حذف کامل این دستور' : 'تا وقتی دستور تکمیلی ثبت شده است، دستور اولیه حذف نمی‌شود.'} onClick={() => void remove()} className="text-red-600 hover:bg-red-50 hover:text-red-700">{busy ? <LoaderCircle className="animate-spin" /> : <Trash2 />} حذف</Button>
        </div>}
      </div>
      {batch.isInitial && !editing && <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><span className="rounded-lg bg-slate-50 p-2"><b>Impression:</b> {batch.impression}</span><span className="rounded-lg bg-slate-50 p-2"><b>Condition:</b> {batch.condition}</span><span className="rounded-lg bg-slate-50 p-2"><b>Diet:</b> {batch.diet}</span><span className="rounded-lg bg-slate-50 p-2"><b>Activity:</b> {batch.activity}</span></div>}
    </CardHeader><CardContent className="space-y-2">
      {editing ? <>
        {batch.isInitial && <OrderHeaderFields value={header} onChange={setHeader} disabled={busy} />}
        {items.map((item, index) => <div key={item.id} className="flex gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-bold">{(index + 1).toLocaleString('fa-IR')}</span><DictationInput disabled={busy} className="h-9" value={item.text} onValueChange={(text) => setItems((current) => current.map((value) => value.id === item.id ? { ...value, text } : value))} /><Button disabled={busy || items.length === 1} size="icon-lg" variant="ghost" aria-label="حذف این آیتم" title={items.length === 1 ? 'برای حذف آخرین آیتم، کل دستور را حذف کنید.' : 'حذف این آیتم'} onClick={() => setItems((current) => current.filter((value) => value.id !== item.id))}><Trash2 /></Button></div>)}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button variant="outline" disabled={busy} onClick={() => setEditing(false)}>انصراف</Button><Button disabled={busy} onClick={() => void save()} className="bg-[#0d4f4a] text-white">{busy ? <LoaderCircle className="animate-spin" /> : <Save />} ذخیره تغییرات</Button></div>
      </> : <>
        {batch.items.map((item) => <button key={item.id} onClick={() => onToggle(item)} className={`flex w-full items-start gap-3 rounded-xl border p-3 text-right transition ${item.isDone ? 'border-emerald-200 bg-emerald-50 text-slate-500' : 'border-slate-200 bg-white hover:border-teal-300'}`}><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${item.isDone ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{item.isDone && <Check className="size-3" />}</span><span className={item.isDone ? 'line-through' : ''}>{item.text}</span><Badge variant="outline" className="mr-auto">{item.isDone ? 'انجام‌شده' : 'انجام‌نشده'}</Badge></button>)}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </>}
    </CardContent></Card>
  );
}


function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className={`flex min-w-fit flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${active ? 'bg-[#0d4f4a] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>{icon}{children}</button>;
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`grid gap-1.5 text-sm text-slate-700 ${className}`}><span className="font-semibold">{label}</span>{children}</label>;
}

function MiniField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <label className="grid gap-1 text-xs text-slate-500"><span dir="ltr" className="text-center font-medium">{label}</span><Input disabled={disabled} type="number" value={value} onChange={(event) => onChange(event.target.value)} className="text-center" dir="ltr" /></label>;
}

function Loading() {
  return <div className="grid min-h-48 place-items-center text-[#0d6b63]"><LoaderCircle className="size-8 animate-spin" /><span className="sr-only">در حال بارگذاری</span></div>;
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <output className="fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-xl"><CheckCircle2 className="size-4 text-emerald-400" />{message}</output>;
}
