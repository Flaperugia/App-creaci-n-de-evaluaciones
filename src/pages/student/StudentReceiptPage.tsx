import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SchoolLogo } from '../../components/common/SchoolLogo';
import { useAppState } from '../../context/AppStateContext';
import {
  fetchStudentReceipt,
  readLocalStudentReceipt,
  StudentApiError,
  writeLocalStudentReceipt,
} from '../../services/studentApiService';
import { SubmittedAttemptReceipt } from '../../types/assessment';

export function StudentReceiptPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { schoolIdentity, lastReceipt, setLastReceipt, resetStudentDraft } =
    useAppState();

  const attemptIdParam = searchParams.get('intento')?.trim() || '';

  const [receipt, setReceipt] = useState<SubmittedAttemptReceipt | null>(() => {
    if (lastReceipt && lastReceipt.examSlug === slug) return lastReceipt;
    if (slug) return readLocalStudentReceipt(slug);
    return null;
  });
  const [loading, setLoading] = useState(!receipt && Boolean(attemptIdParam));
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadReceipt() {
      if (!attemptIdParam) {
        setLoading(false);
        return;
      }

      if (receipt && receipt.attemptId === attemptIdParam) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const fetched = await fetchStudentReceipt(attemptIdParam);
        if (cancelled) return;
        setReceipt(fetched);
        setLastReceipt(fetched);
        if (slug) {
          writeLocalStudentReceipt(slug, fetched);
        }
      } catch (err) {
        if (cancelled) return;
        if (!receipt) {
          setError(
            err instanceof StudentApiError
              ? err.message
              : 'No pudimos cargar el comprobante de entrega.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReceipt();
    return () => {
      cancelled = true;
    };
  }, [attemptIdParam, receipt, reloadNonce, setLastReceipt, slug]);

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
          Cargando comprobante...
        </p>
      </section>
    );
  }

  if (!receipt) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <div className="flex justify-center">
          <SchoolLogo identity={schoolIdentity} size="lg" />
        </div>
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          Comprobante no disponible
        </h1>
        <p className="mx-auto max-w-md text-sm text-slate-600">
          {error ||
            'No encontramos un envío confirmado en esta sesión. Si acabás de ingresar al enlace, iniciá desde la portada.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {attemptIdParam && (
            <button
              type="button"
              onClick={() => setReloadNonce((n) => n + 1)}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)]"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Reintentar</span>
            </button>
          )}
          {slug && (
            <Link
              to={`/e/${slug}`}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
            >
              Volver a la portada
            </Link>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="receipt-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-10 shadow-xs space-y-6"
    >
      <div className="flex flex-col items-start gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <SchoolLogo identity={schoolIdentity} size="md" />
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {schoolIdentity.name}
            </p>
            <h1
              id="receipt-title"
              className="font-display text-2xl font-bold text-[#0F1E36]"
            >
              Comprobante de entrega
            </h1>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>Entrega registrada</span>
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-[#FAFBFD] p-5 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-500">Evaluación</dt>
          <dd className="mt-0.5 font-semibold text-[#0F1E36]">
            {receipt.examTitle}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Curso / Docente</dt>
          <dd className="mt-0.5 text-[#0F1E36]">
            {[receipt.course, receipt.teachersText].filter(Boolean).join(' · ')}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Participante</dt>
          <dd className="mt-0.5 font-semibold text-[#0F1E36]">
            {receipt.participantName}
            <span className="ml-2 text-xs font-normal font-mono-tabular text-slate-500">
              (Intento {receipt.attemptNumber} de {receipt.maxAttempts})
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">
            Código y hora de envío
          </dt>
          <dd className="mt-0.5 font-mono-tabular text-xs text-slate-700">
            {receipt.attemptCode} · {receipt.submittedAtFormatted}
          </dd>
        </div>
      </dl>

      {receipt.hasPendingManualGrading && (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#F4F7FB] p-4 text-sm text-slate-700">
          <Clock
            className="h-5 w-5 shrink-0 mt-0.5 text-slate-600"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold text-[#0F1E36]">
              Preguntas abiertas y cuadros pendientes de corrección docente
            </p>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-600">
              Las respuestas escritas y cuadros comparativos serán revisados y
              calificados por tu docente.
            </p>
          </div>
        </div>
      )}

      {receipt.feedbackEnabled && receipt.closedFeedback.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-[#0F1E36]">
              Devolución de preguntas cerradas
            </h2>
            {receipt.autoScore !== null && receipt.maxAutoScore !== null && (
              <span className="rounded-md border border-slate-200 bg-[#FAFBFD] px-3 py-1 text-xs font-mono-tabular font-semibold text-[#0F1E36]">
                Puntaje automático: {receipt.autoScore} / {receipt.maxAutoScore}{' '}
                pts
              </span>
            )}
          </div>
          <div className="space-y-2.5">
            {receipt.closedFeedback.map((item) => (
              <div
                key={item.questionId}
                className="rounded-xl border border-slate-200 bg-white p-4 text-sm space-y-1.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-[#0F1E36]">{item.prompt}</p>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      item.isCorrect
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    {item.isCorrect ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Correcta</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Revisar</span>
                      </>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>Tu respuesta: {item.studentAnswerLabel}</span>
                  {item.pointsAwarded !== null && item.maxPoints !== null && (
                    <span className="font-mono-tabular">
                      {item.pointsAwarded} / {item.maxPoints} pts
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!receipt.feedbackEnabled && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-[#FAFBFD] px-4 py-3 text-xs sm:text-sm text-slate-600">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
          <span>
            La devolución inmediata está desactivada para esta evaluación. Tu
            docente compartirá los resultados luego de la corrección.
          </span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => {
            resetStudentDraft();
            navigate(`/e/${receipt.examSlug}`);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          <span>Volver a la portada</span>
        </button>
      </div>
    </section>
  );
}
