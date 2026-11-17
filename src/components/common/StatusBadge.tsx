import {
  CheckCircle2,
  Clock,
  FileEdit,
  Lock,
  XCircle,
} from 'lucide-react';
import { ExamStatus } from '../../types/assessment';

type BadgeVariant =
  | ExamStatus
  | 'pendiente'
  | 'corregida'
  | 'aprobado'
  | 'desaprobado';

interface StatusBadgeProps {
  status: BadgeVariant;
}

const STATUS_MAP: Record<
  BadgeVariant,
  { label: string; bg: string; text: string; Icon: typeof CheckCircle2 }
> = {
  publicada: {
    label: 'Publicada',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    Icon: CheckCircle2,
  },
  borrador: {
    label: 'Borrador',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    Icon: FileEdit,
  },
  cerrada: {
    label: 'Cerrada',
    bg: 'bg-slate-100 border-slate-200',
    text: 'text-slate-700',
    Icon: Lock,
  },
  pendiente: {
    label: 'Pendiente',
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    Icon: Clock,
  },
  corregida: {
    label: 'Corregida',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    Icon: CheckCircle2,
  },
  aprobado: {
    label: 'Aprobado',
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    Icon: CheckCircle2,
  },
  desaprobado: {
    label: 'Desaprobado',
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-800',
    Icon: XCircle,
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status];
  const Icon = cfg.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${cfg.bg} ${cfg.text}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{cfg.label}</span>
    </span>
  );
}
