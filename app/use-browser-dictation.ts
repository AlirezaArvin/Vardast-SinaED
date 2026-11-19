'use client';

import { useEffect, useRef, useState } from 'react';

import type { DictationStatus } from './use-voice-dictation';

// The DOM lib ships the result types but not the recognizer itself.
type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognizerClass = new () => Recognizer;

const errorMessages: Record<string, string> = {
  'not-allowed': 'دسترسی به میکروفون داده نشد. مجوز میکروفون را در مرورگر فعال کنید.',
  'service-not-allowed': 'مرورگر اجازه تشخیص گفتار را نمی‌دهد.',
  'audio-capture': 'میکروفونی پیدا نشد.',
  'network': 'اتصال به سرویس تشخیص گفتار مرورگر برقرار نشد.',
  'no-speech': 'گفتاری شنیده نشد.',
  'language-not-supported': 'مرورگر از تشخیص گفتار فارسی پشتیبانی نمی‌کند.',
};

function recognizerClass() {
  const scope = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

// Same contract as the server engine, but on the browser's Web Speech API: each finished phrase is
// handed to onText as it is recognised, and `interim` holds the phrase still being spoken.
// Chrome sends the audio to Google and Edge to Microsoft; Firefox has no implementation.
export function useBrowserDictation(onText: (text: string) => void) {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [error, setError] = useState('');
  const [interim, setInterim] = useState('');
  const recognizerRef = useRef<Recognizer | null>(null);

  useEffect(() => () => recognizerRef.current?.abort(), []);

  function start() {
    setError('');
    const Recognition = recognizerClass();
    if (!Recognition) {
      setError('این مرورگر از تشخیص گفتار پشتیبانی نمی‌کند. از Chrome یا Edge استفاده کنید.');
      return;
    }
    const recognizer = new Recognition();
    recognizer.lang = 'fa-IR';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (event) => {
      let pending = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (text) onText(text);
        } else {
          pending += result[0].transcript;
        }
      }
      setInterim(pending.trim());
    };
    recognizer.onerror = (event) => {
      if (event.error !== 'aborted') setError(errorMessages[event.error] ?? `تشخیص گفتار با خطا متوقف شد (${event.error}).`);
    };
    recognizer.onend = () => {
      recognizerRef.current = null;
      setInterim('');
      setStatus('idle');
    };
    recognizerRef.current = recognizer;
    recognizer.start();
    setStatus('recording');
  }

  // Stopping lets the browser deliver the last phrase before onend fires.
  function stop() {
    if (!recognizerRef.current) return;
    recognizerRef.current.stop();
    setStatus('processing');
  }

  return { status, error, interim, start, stop };
}
