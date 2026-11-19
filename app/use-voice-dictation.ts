'use client';

import { useEffect, useRef, useState } from 'react';

import type { VoiceMode, VoiceResult } from '@/lib/clinical-types';

export type DictationStatus = 'idle' | 'recording' | 'processing';

const MAX_RECORDING_MS = 5 * 60 * 1000;
const preferredMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function useVoiceDictation<T>(mode: VoiceMode, onResult: (result: VoiceResult<T>) => void, patientId?: string) {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // Release the microphone without uploading if the panel unmounts mid-recording.
  useEffect(() => () => {
    const recorder = recorderRef.current;
    window.clearTimeout(timerRef.current);
    if (!recorder) return;
    recorder.onstop = () => recorder.stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== 'inactive') recorder.stop();
  }, []);

  async function upload(blob: Blob) {
    if (!blob.size) {
      setStatus('idle');
      setError('صدایی ضبط نشد.');
      return;
    }
    setStatus('processing');
    try {
      const query = new URLSearchParams({ mode, ...(patientId ? { patientId } : {}) });
      const response = await fetch(`/api/voice?${query}`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      const data = (await response.json().catch(() => ({}))) as Partial<VoiceResult<T>> & { error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || `پردازش صدا انجام نشد (کد ${response.status}).`);
      onResult({ transcript: data.transcript ?? '', draft: data.draft });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'پردازش صدا انجام نشد.');
    } finally {
      setStatus('idle');
    }
  }

  async function start() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('این مرورگر از ضبط صدا پشتیبانی نمی‌کند.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('دسترسی به میکروفون داده نشد. مجوز میکروفون را در مرورگر فعال کنید.');
      return;
    }

    const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      window.clearTimeout(timerRef.current);
      recorderRef.current = null;
      void upload(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    };
    recorder.onerror = () => {
      setError('ضبط صدا با خطا متوقف شد.');
    };

    recorderRef.current = recorder;
    recorder.start();
    setStatus('recording');
    timerRef.current = window.setTimeout(stop, MAX_RECORDING_MS);
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  return { status, error, start, stop };
}
