'use client';

import { useEffect, useRef } from 'react';
import { LoaderCircle, Mic, Square } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { useBrowserDictation } from './use-browser-dictation';
import { useVoiceDictation } from './use-voice-dictation';

// Engine behind the per-field mics:
// 'server'  - ElevenLabs Scribe through /api/voice: biased toward medical terms, uses OpenRouter credit.
// 'browser' - the browser's own speech recognition: free and live, but no medical vocabulary.
const FIELD_ENGINE: 'server' | 'browser' = 'browser';

type DictationProps = { value: string; onValueChange: (value: string) => void };

function appendText(current: string, spoken: string) {
  return current.trim() ? `${current.trimEnd()} ${spoken}` : spoken;
}

function useServerDictation(onText: (text: string) => void) {
  const voice = useVoiceDictation<string>('text', ({ transcript }) => onText(transcript));
  return { ...voice, interim: '' };
}

const useEngine = FIELD_ENGINE === 'browser' ? useBrowserDictation : useServerDictation;

// Dictation appends to whatever the field holds when the text arrives, so typing during
// recording is kept. Refs avoid the stale value captured when recording started, and the
// value is advanced immediately because the browser engine can deliver several phrases at once.
function useFieldDictation({ value, onValueChange }: DictationProps) {
  const latest = useRef({ value, onValueChange });
  useEffect(() => {
    latest.current = { value, onValueChange };
  });
  return useEngine((text) => {
    const next = appendText(latest.current.value, text);
    latest.current.value = next;
    latest.current.onValueChange(next);
  });
}

// The button sits on the physical left so it stays clear of the text whether a dir="auto"
// field resolves to Persian (RTL, text ends on the left) or English (LTR, padding on the left).
function DictationButton({ voice, disabled, className }: { voice: ReturnType<typeof useFieldDictation>; disabled?: boolean; className: string }) {
  const recording = voice.status === 'recording';
  const processing = voice.status === 'processing';
  return (
    <button
      type="button"
      disabled={disabled || processing}
      onClick={recording ? voice.stop : voice.start}
      aria-label={recording ? 'پایان ضبط' : 'ضبط صوتی این فیلد'}
      title={recording ? 'پایان ضبط' : 'ضبط صوتی این فیلد'}
      className={cn(
        'absolute left-1 grid size-7 place-items-center rounded-md transition disabled:pointer-events-none disabled:opacity-40',
        recording ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-[#eaf6f3] hover:text-[#0d6b63]',
        className,
      )}
    >
      {recording ? <Square className="size-3 animate-pulse fill-current" /> : processing ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
    </button>
  );
}

function DictationStatusLine({ voice }: { voice: ReturnType<typeof useFieldDictation> }) {
  if (voice.error) return <span className="text-xs text-red-600">{voice.error}</span>;
  return voice.interim ? <span dir="auto" className="text-xs text-slate-400">{voice.interim}…</span> : null;
}

export function DictationInput({ value, onValueChange, className, disabled, ...props }: Omit<React.ComponentProps<'input'>, 'value' | 'onChange'> & DictationProps) {
  const voice = useFieldDictation({ value, onValueChange });
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="relative">
        <Input {...props} disabled={disabled} value={value} onChange={(event) => onValueChange(event.target.value)} className={cn('pl-9', className)} />
        <DictationButton voice={voice} disabled={disabled} className="top-1/2 -translate-y-1/2" />
      </div>
      <DictationStatusLine voice={voice} />
    </div>
  );
}

export function DictationTextarea({ value, onValueChange, className, disabled, ...props }: Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> & DictationProps) {
  const voice = useFieldDictation({ value, onValueChange });
  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <div className="relative">
        <Textarea {...props} disabled={disabled} value={value} onChange={(event) => onValueChange(event.target.value)} className={cn('pl-9', className)} />
        <DictationButton voice={voice} disabled={disabled} className="top-1.5" />
      </div>
      <DictationStatusLine voice={voice} />
    </div>
  );
}
