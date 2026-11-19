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
  isTrauma: boolean;
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

// 'text' transcribes into a single field: no LLM structuring, the draft is the transcript itself.
export type VoiceMode = 'history' | 'orders' | 'trauma' | 'text';
export type OrdersDraft = { impression: string; diet: string; activity: string; items: string[] };
export type VoiceResult<T> = { transcript: string; draft: T };

export const arrivalOptions = ['AM', 'PM', 'Airway', 'Oral', 'ETT', 'Backboard', 'Cervical Collar', 'Splinting', 'IV Line', 'O2', 'Medication', 'CPR'] as const;
export const mechanismOptions = ['MVC', 'Pedestrian', 'Passenger', 'Driver', 'Car', 'Motor', 'Bicycle', 'Fall', 'Height', 'Assault', 'Blunt', 'Penetrating', 'Stab', 'GSW', 'SGW', 'Other'] as const;
export const airwayAssessmentOptions = ['Patient Talking', 'No Talking', 'Airway Bleeding', 'Foreign Body Obstruction', 'Gasping', 'Apnea'] as const;
export const airwayInterventionOptions = ['C-Collar', 'Oral Airway', 'Bag Mask Ventilation', 'Intubation', 'Suction', 'Surgical Airway'] as const;
export const breathingAssessmentOptions = ['Normal', 'Breathing Sound', 'Tension PTX', 'Massive HTX', 'Flail Chest', 'Gasping', 'Apnea'] as const;
export const breathingInterventionOptions = ['O2', 'Pulse Oximetry', 'Chest Tube', 'Needle Tracheostomy', 'Ventilator', 'Portable CXR'] as const;
export const internalBleedingSiteOptions = ['Chest', 'Abdomen', 'Pelvis', 'Long Bones Deformity'] as const;
export const circulationInterventionOptions = ['Control of External Bleeding', 'IV Line', 'IV. Fluid', 'Packed Cell', 'Foley Catheter', 'MTP (Massive Transfusion Protocol)', 'Pelvic Wrapping', 'Portable PXR', 'Splinting'] as const;

export const ampleFields = [
  ['allergy', 'Allergy'], ['medication', 'Medication'], ['pmhPregnancy', 'PMH & Pregnancy'],
  ['lastMeal', 'Last Meal'], ['environmentEvent', 'Environment & Event'],
] as const;
export const findingFields = [
  ['head', 'Head'], ['neckCervicalSpine', 'Neck & Cervical Spine'], ['chest', 'Chest'], ['abdomen', 'Abdomen'],
  ['pelvis', 'Pelvis'], ['upperExt', 'Upper Ext'], ['lowerExt', 'Lower Ext'], ['genitaliaPerineum', 'Genitalia & Perineum'],
  ['back', 'Back'], ['tlsSpine', 'T.L.S Spine'], ['neurologicExam', 'Neurologic Exam'], ['vascular', 'Vascular'],
] as const;

export type TraumaForm = {
  arrival: string[];
  mechanism: string[];
  mechanismOther: string;
  airwayAssessment: string[];
  airwayIntervention: string[];
  breathingAssessment: string[];
  o2Sat: string;
  respiratoryRate: string;
  breathingIntervention: string[];
  activeExternalBleeding: boolean;
  bleedingLocation: string;
  internalBleeding: boolean;
  internalBleedingSites: string[];
  systolic: string;
  diastolic: string;
  pulse: string;
  capillaryRefill: string;
  efast: string;
  circulationIntervention: string[];
  packedCellUnits: string;
  gcsVerbal: string;
  gcsMotor: string;
  gcsEye: string;
  pupil: string;
  sensoryMotorLevel: string;
  disabilityIntubation: boolean;
  exposeLogRoll: string;
  hypothermiaPrevention: boolean;
} & Record<(typeof ampleFields)[number][0] | (typeof findingFields)[number][0], string>;
