'use client';

import { LoaderCircle, Mic, MicOff, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import type { DictationStatus } from './use-voice-dictation';

export function VoiceBanner({ status, error, transcript, onStart, onStop, disabled, title, subtitle, startLabel = 'شروع ضبط فارسی' }: { status: DictationStatus; error: string; transcript: string; onStart: () => void; onStop: () => void; disabled: boolean; title: string; subtitle: string; startLabel?: string }) {
  const recording = status === 'recording';
  const processing = status === 'processing';
  return (
    <Card className={`border-0 shadow-sm ring-1 ${recording ? 'bg-red-50 ring-red-200' : 'bg-[#eaf6f3] ring-teal-200'}`}><CardContent className="space-y-3">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className={`grid size-12 place-items-center rounded-2xl ${recording ? 'bg-red-100 text-red-700' : 'bg-white text-[#0d6b63]'}`}>{recording ? <Mic className="animate-pulse" /> : processing ? <LoaderCircle className="animate-spin" /> : <Sparkles />}</span><div><h2 className="font-black">{title}</h2><p className="mt-1 text-xs text-slate-600">{subtitle}</p></div></div><Button size="lg" disabled={disabled || processing} onClick={recording ? onStop : onStart} className={`h-12 shrink-0 gap-2 rounded-xl px-6 text-base font-bold shadow-sm [&_svg:not([class*='size-'])]:size-5 ${recording ? 'bg-red-600 text-white' : 'bg-[#0d4f4a] text-white'}`}>{recording ? <><MicOff /> پایان ضبط و ساخت پیش‌نویس</> : processing ? <><LoaderCircle className="animate-spin" /> در حال تبدیل گفتار…</> : <><Mic /> {startLabel}</>}</Button></div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {transcript && <details className="rounded-lg bg-white/70 p-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-600">متن پیاده‌شده از صدا</summary><p dir="auto" className="mt-2 leading-7 text-slate-700">{transcript}</p></details>}
    </CardContent></Card>
  );
}
