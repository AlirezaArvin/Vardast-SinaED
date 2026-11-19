export type Patient = {
  id: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  age: number | null;
  sex: 'زن' | 'مرد';
  room: string;
  bed: string;
  admittedAt: string;
  status: 'active' | 'discharged';
  dischargedAt?: string | null;
};

export type HistoryDraft = {
  chiefComplaint: string;
  onset: string;
  history: string;
  medicalHistory: string;
  drugHistory: string;
  allergyHistory: string;
  consciousness: string;
  temperature: string;
  pulse: string;
  systolic: string;
  diastolic: string;
  respiratoryRate: string;
  spo2: string;
  painScore: string;
  gcsEye: string;
  gcsVerbal: string;
  gcsMotor: string;
  physicalExam: string;
  paraclinicalResults: string;
};

export type OrderItem = { id: string; text: string; isDone: boolean; doneAt?: string | null; createdAt: string };
export type OrderBatch = {
  id: string;
  impression?: string | null;
  diet?: string | null;
  activity?: string | null;
  isInitial: boolean;
  approvedAt: string;
  items: OrderItem[];
};

export const consciousnessOptions = ['هوشیار', 'لتارژی', 'ابتوندیشن', 'استوپور', 'کما', 'گیجی و منگی', 'بی‌قراری'] as const;
export const dietOptions = ['NPO', 'PO Regular', 'Type 1 Diet', 'Type 2 Diet'] as const;

export type VoiceMode = 'history' | 'orders';
export type OrdersDraft = { impression: string; diet: string; activity: string; items: string[] };
export type VoiceResult<T> = { transcript: string; draft: T };
