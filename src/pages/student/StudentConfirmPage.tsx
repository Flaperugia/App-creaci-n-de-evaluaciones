import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppState } from '../../context/AppStateContext';
import { usePublicExam } from '../../hooks/usePublicExam';
import {
  clearLocalStudentDraft,
  isQuestionAnswered,
  readLocalStudentDraft,
  StudentApiError,
  submitStudentAttempt,
  writeLocalStudentReceipt,
} from '../../services/studentApiService';

export function StudentConfirmPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const {
    studentDraft,
    hydrateStudentDraft,
    setStudentStep,
    resetStudentDraft,
    setLastReceipt,
  } = useAppState();
  const { exam, loading, errorType, errorMessage, reload } = usePublicExam(slug);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    if (!studentDraft || studentDraft.examSlug !== slug) {
      const localDraft = readLocalStudentDraft(slug);
      if (localDraft && localDraft.participantKey && localDraft.idempotencyKey) {
        hydrateStudentDraft(localDraft);
      }
    }
  }, [hydrateStudentDraft, slug, studentDraft]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
        <div className="flex justify-center">
          <Loader2
            className="h-6 w-6 animate-spin text-slate-500"
            aria-hidden="true"
          />
        </div>
        <p className="font-display text-base font-semibold text-[#0F1E36]">
          Verificando resumen...
        </p>
      </section>
    );
  }

  if (!exam) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          {errorType === 'network'
            ? 'Error de conexión'
            : 'Evaluación no disponible'}
        </h1>
        <p className="text-sm text-slate-600">
          {errorMessage || 'Esta evaluación no está publicada o ya fue cerrada.'}
        </p>
        {errorType === 'network' && (
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)]"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Reintentar</span>
          </button>
        )}
      </section>
    );
  }

  if (
    !studentDraft ||
    studentDraft.examSlug !== exam.slug ||
    !studentDraft.participantKey ||
    !studentDraft.idempotencyKey
  ) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          No hay un intento activo para enviar
        </h1>
        <p className="text-sm text-slate-600">
          Iniciá o retomá la evaluación desde la portada ingresando tu
          identificador.
        </p>
        <Link
          to={`/e/${exam.slug}`}
          className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-[var(--brand-on-primary)]"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          Ir a la portada
        </Link>
      </section>
    );
  }

  const answers = studentDraft.answers;
  const allQuestions = exam.consignas.flatMap((c) => c.questions);
  const unansweredCount = allQuestions.filter(
    (q) => !isQuestionAnswered(q, answers[q.id])
  ).length;
  const answeredCount = allQuestions.length - unansweredCount;

  const handleSubmit = async () => {
    if (
      submitting ||
      !studentDraft.participantKey ||
      !studentDraft.idempotencyKey
    ) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { receipt } = await submitStudentAttempt({
        slug: exam.slug,
        participantName: studentDraft.studentName,
        participantKey: studentDraft.participantKey,
        idempotencyKey: studentDraft.idempotencyKey,
        answers: studentDraft.answers,
      });
      writeLocalStudentReceipt(exam.slug, receipt);
      setLastReceipt(receipt);
      clearLocalStudentDraft(exam.slug);
      resetStudentDraft();
      navigate(
        `/e/${exam.slug}/recibo?intento=${encodeURIComponent(receipt.attemptId)}`
      );
    } catch (err) {
      if (err instanceof StudentApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(
          'No pudimos confirmar el envío. Tus respuestas siguen guardadas: reintentá sin duplicar el intento.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="confirm-title"
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6"
    >
      <div className="space-y-1">
        <h1
          id="confirm-title"
          className="font-display text-2xl font-bold text-[#0F1E36]"
        >
          Confirmar entrega
        </h1>
        <p className="text-sm text-slate-600">
          {exam.title} · Participante:{' '}
          <span className="font-semibold text-[#0F1E36]">
            {studentDraft.studentName}
          </span>
        </p>
      </div>

      {unansweredCount > 0 ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <AlertTriangle
            className="h-5 w-5 shrink-0 mt-0.5 text-amber-700"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">
              Hay {unansweredCount}{' '}
              {unansweredCount === 1 ? 'respuesta' : 'respuestas'} sin
              completar. ¿Querés enviar igual?
            </p>
            <p className="text-xs sm:text-sm text-amber-800">
              Podés volver a revisar tus respuestas o enviar la evaluación como
              está.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2
            className="h-5 w-5 shrink-0 mt-0.5 text-emerald-700"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold">
              Completaste todas las preguntas ({answeredCount} de{' '}
              {allQuestions.length})
            </p>
            <p className="text-xs sm:text-sm text-emerald-800">
              Revisá el resumen antes de confirmar el envío definitivo.
            </p>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
        {exam.consignas.map((con, idx) => {
          const conAnswered = con.questions.filter((q) =>
            isQuestionAnswered(q, answers[q.id])
          ).length;
          return (
            <div
              key={con.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">
                  Actividad {idx + 1}
                </p>
                <p className="font-display text-sm font-semibold text-[#0F1E36] truncate">
                  {con.title}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-mono-tabular text-slate-600">
                  {conAnswered} / {con.questions.length} respondidas
                </span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setStudentStep(idx);
                    navigate(`/e/${exam.slug}/actividad`);
                  }}
                  className="text-xs font-semibold hover:underline disabled:opacity-50"
                  style={{ color: 'var(--brand-primary)' }}
                >
                  Revisar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {submitError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle
            className="h-4 w-4 shrink-0 mt-0.5 text-rose-700"
            aria-hidden="true"
          />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={submitting}
          onClick={() => navigate(`/e/${exam.slug}/actividad`)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>
            {unansweredCount > 0 ? 'Volver a revisar' : 'Revisar respuestas'}
          </span>
        </button>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-60"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Enviando...</span>
            </>
          ) : submitError ? (
            <>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Reintentar envío</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>
                {unansweredCount > 0
                  ? 'Enviar como está'
                  : 'Enviar definitivamente'}
              </span>
            </>
          )}
        </button>
      </div>
    </section>
  );
}
