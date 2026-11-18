import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Info,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SchoolLogo } from '../../components/common/SchoolLogo';
import { useAppState } from '../../context/AppStateContext';
import { usePublicExam } from '../../hooks/usePublicExam';
import {
  readLocalStudentDraft,
  startStudentAttempt,
  StudentApiError,
  writeLocalStudentDraft,
} from '../../services/studentApiService';
import { StudentSessionDraft } from '../../types/assessment';

export function StudentCoverPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { schoolIdentity, studentDraft, hydrateStudentDraft } = useAppState();
  const { exam, loading, errorType, errorMessage, reload } = usePublicExam(slug);

  const [studentName, setStudentName] = useState('');
  const [hasExistingLocalDraft, setHasExistingLocalDraft] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedReceiptAttemptId, setBlockedReceiptAttemptId] = useState<
    string | null
  >(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!slug) return;
    if (studentDraft?.examSlug === slug && studentDraft.studentName) {
      setStudentName(studentDraft.studentName);
      setHasExistingLocalDraft(Boolean(studentDraft.idempotencyKey));
      return;
    }
    const stored = readLocalStudentDraft(slug);
    if (stored && stored.studentName) {
      setStudentName(stored.studentName);
      setHasExistingLocalDraft(Boolean(stored.idempotencyKey));
    }
  }, [slug, studentDraft]);

  if (loading) {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3"
      >
        <div className="flex justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-slate-500"
            aria-hidden="true"
          />
        </div>
        <p className="font-display text-base font-semibold text-[#0F1E36]">
          Cargando evaluación...
        </p>
      </section>
    );
  }

  if (!exam) {
    const isNetwork = errorType === 'network';
    const isClosed = errorType === 'closed';

    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <div className="flex justify-center">
          <SchoolLogo identity={schoolIdentity} size="lg" />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#0F1E36]">
          {isNetwork
            ? 'No pudimos conectar con la evaluación'
            : isClosed
              ? 'Evaluación cerrada'
              : 'Evaluación no disponible'}
        </h1>
        <p className="mx-auto max-w-md text-sm text-slate-600">
          {errorMessage ||
            'El enlace solicitado no corresponde a una evaluación publicada activa o fue cerrado por el docente.'}
        </p>
        {isNetwork && (
          <div className="pt-2">
            <button
              type="button"
              onClick={reload}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-[var(--brand-on-primary)]"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Reintentar</span>
            </button>
          </div>
        )}
      </section>
    );
  }

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = studentName.trim();
    if (!trimmed) {
      setError('Ingresá tu nombre y apellido o código de participante.');
      return;
    }

    setError(null);
    setBlockedReceiptAttemptId(null);
    setStarting(true);

    try {
      const res = await startStudentAttempt(exam.slug, trimmed);
      const localExisting = readLocalStudentDraft(exam.slug);

      // Si el dispositivo tenía cambios pendientes de sincronizar para el mismo participante e idempotencyKey, conservarlos
      const shouldKeepPendingLocal =
        localExisting &&
        localExisting.pendingCloudSync &&
        localExisting.participantKey === res.participantKey &&
        localExisting.idempotencyKey === res.draft.idempotencyKey;

      const hydrated: StudentSessionDraft = {
        examSlug: exam.slug,
        examId: res.examId,
        participantKey: res.participantKey,
        studentName: res.participantName,
        idempotencyKey: res.draft.idempotencyKey,
        attemptNumber: 1,
        maxAttempts: 1,
        startedAt: res.draft.startedAt,
        currentStepIndex: shouldKeepPendingLocal
          ? localExisting.currentStepIndex
          : res.draft.currentStepIndex,
        answers: shouldKeepPendingLocal
          ? localExisting.answers
          : res.draft.answers,
        lastSavedLocallyAt: localExisting?.lastSavedLocallyAt,
        lastSyncedCloudAt: res.draft.lastSavedAt,
      };

      writeLocalStudentDraft(exam.slug, {
        ...hydrated,
        pendingCloudSync: Boolean(shouldKeepPendingLocal),
        updatedAtMs: Date.now(),
      });
      hydrateStudentDraft(hydrated);
      navigate(`/e/${exam.slug}/actividad`);
    } catch (err) {
      if (err instanceof StudentApiError) {
        setError(err.message);
        setBlockedReceiptAttemptId(err.attemptId ?? null);
      } else {
        setError(
          'No se pudo iniciar la evaluación. Verificá tu conexión e intentá nuevamente.'
        );
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <section
      aria-labelledby="student-cover-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs space-y-6"
    >
      {isOffline && (
        <div
          role="status"
          className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900"
        >
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span>
            Estás sin conexión a internet. Necesitás conexión para verificar tus
            intentos disponibles e iniciar la evaluación.
          </span>
        </div>
      )}

      <div className="flex flex-col items-start gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center">
        <SchoolLogo identity={schoolIdentity} size="lg" />
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-wide text-slate-500">
            {schoolIdentity.name}
          </p>
          <h1
            id="student-cover-title"
            className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36] text-balance"
          >
            {exam.title}
          </h1>
          <p className="text-sm text-slate-600">
            {[exam.subtitle, exam.yearLabel, exam.course, exam.teachersText]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-[#F4F7FB] p-4 sm:p-5 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#0F1E36]">
          <BookOpen className="h-4 w-4 text-slate-600" aria-hidden="true" />
          <span>Indicaciones generales</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
          {exam.initialInstructions ||
            'Leé cada consigna con atención antes de responder. Podés avanzar entre actividades y revisar tus respuestas antes del envío definitivo.'}
        </p>
        <p className="text-xs text-slate-500">
          Actividades totales: {exam.consignas.length} · Entrega única (1 intento
          por participante)
        </p>
      </div>

      <form onSubmit={handleStart} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="student-fullname"
            className="block text-sm font-semibold text-[#0F1E36]"
          >
            Nombre y apellido <span className="text-rose-600">*</span>
          </label>
          <input
            id="student-fullname"
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            value={studentName}
            onChange={(e) => {
              setStudentName(e.target.value);
              if (error) setError(null);
              if (blockedReceiptAttemptId) setBlockedReceiptAttemptId(null);
            }}
            placeholder="Ej. EST-04 o María Belén Rivas"
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-[#0F1E36] placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:outline-none"
          />
          <p className="text-xs text-slate-600 leading-relaxed">
            Para pruebas con menores o ensayos de usabilidad, se recomienda usar{' '}
            <strong className="font-semibold text-[#0F1E36]">
              códigos ficticios o seudónimos
            </strong>{' '}
            (por ejemplo, <span className="font-mono-tabular">ALUMNO-01</span>) en
            lugar de datos personales reales.
          </p>
          <p className="flex items-start gap-1.5 text-xs text-slate-500">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Acceso sin contraseña: el identificador ingresado asocia tu intento y
              permite recuperar tu avance si recargás la página.
            </span>
          </p>

          {hasExistingLocalDraft && !error && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Detectamos una sesión previa en este dispositivo. Al iniciar con el
              mismo identificador, vas a retomar el avance guardado.
            </p>
          )}

          {error && (
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-rose-800"
            >
              <div className="flex items-start gap-2">
                <AlertCircle
                  className="h-4 w-4 shrink-0 mt-0.5 text-rose-700"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
              {blockedReceiptAttemptId && (
                <div className="pl-6">
                  <Link
                    to={`/e/${exam.slug}/recibo?intento=${encodeURIComponent(
                      blockedReceiptAttemptId
                    )}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-rose-900 underline underline-offset-2 hover:text-rose-950"
                  >
                    <span>Ver comprobante de la entrega registrada</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={starting || isOffline}
            className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold text-[var(--brand-on-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {starting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Iniciando...</span>
              </>
            ) : (
              <>
                <span>Iniciar evaluación</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
