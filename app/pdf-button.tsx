'use client';

import { FileDown } from 'lucide-react';

import { Button } from '@/components/ui/button';

// Acrobat red, so the export reads as "PDF" at a glance.
export function PdfButton({ disabled, disabledHint, onClick, size, className = '' }: { disabled: boolean; disabledHint: string; onClick: () => void; size?: 'default' | 'lg'; className?: string }) {
  return <Button size={size} disabled={disabled} title={disabled ? disabledHint : 'ساخت فایل PDF برای چاپ یا بایگانی'} onClick={onClick} className={`bg-[#B30B00] text-white hover:bg-[#960900] ${className}`}><FileDown /> خروجی PDF</Button>;
}
