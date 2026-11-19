import { getDatabase } from '@/db/runtime';
import { transcribe, VoiceError } from '@/lib/voice/openrouter';
import { medicalKeyterms, structureHistory, structureOrders, structureTrauma, traumaKeyterms, type PatientContext } from '@/lib/voice/structure';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

const audioFormats: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
};

async function loadPatient(patientId: string | null): Promise<PatientContext | null> {
  if (!patientId) return null;
  const db = await getDatabase();
  const patient = await db.prepare('SELECT sex, age FROM patients WHERE id = ?').bind(patientId).first<{ sex: string; age: number | null }>();
  if (!patient) return null;
  return { sex: patient.sex === 'زن' ? 'زن' : 'مرد', age: patient.age };
}

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

// The audio is the raw request body, not multipart: vinext treats every multipart POST
// as a progressive server action and caps it at the 1 MB server-action body limit.
export async function POST(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const mode = params.get('mode');
    if (mode !== 'history' && mode !== 'orders' && mode !== 'trauma') return fail('نوع درخواست صوتی نامعتبر است.', 400);

    const contentType = request.headers.get('content-type') ?? '';
    const format = audioFormats[contentType.split(';')[0].trim().toLowerCase()];
    if (!format) return fail('قالب فایل صوتی پشتیبانی نمی‌شود.', 415);

    if (Number(request.headers.get('content-length') ?? 0) > MAX_AUDIO_BYTES) return fail('فایل صوتی بیش از حد طولانی است.', 413);
    const audio = await request.arrayBuffer();
    if (audio.byteLength === 0) return fail('فایل صوتی دریافت نشد.', 400);
    if (audio.byteLength > MAX_AUDIO_BYTES) return fail('فایل صوتی بیش از حد طولانی است.', 413);

    const transcript = await transcribe(audio, format, mode === 'trauma' ? traumaKeyterms : medicalKeyterms);
    if (!transcript) return fail('گفتاری در صدای ضبط‌شده تشخیص داده نشد.', 422);

    const draft = mode === 'history'
      ? await structureHistory(transcript, await loadPatient(params.get('patientId')))
      : mode === 'trauma' ? await structureTrauma(transcript) : await structureOrders(transcript);
    return Response.json({ transcript, draft });
  } catch (error) {
    if (error instanceof VoiceError) return fail(error.message, error.status);
    console.error('Voice processing failed', error);
    return fail('پردازش صدا انجام نشد.', 500);
  }
}
