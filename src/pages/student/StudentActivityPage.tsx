import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  Save,
  Send,
  WifiOff,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ComparativeTableView } from '../../components/common/ComparativeTableView';
import { SurveyStandardQuestion } from '../../components/common/SurveyStandardQuestion';
import { useAppState } from '../../context/AppStateContext';
import { usePublicExam } from '../../hooks/usePublicExam';
import {
  clearLocalStudentDraft,
  fetchStudentProgress,
  isQuestionAnswered,
  readLocalStudentDraft,
  saveStudentProgress,
  StoredLocalStudentDraft,
  StudentApiError,
  submitStudentAttempt,
  writeLocalStudentDraft,
  writeLocalStudentReceipt,
} from '../../services/studentApiService';
import {
  QuestionItem,
  StudentAnswerValue,
  StudentSessionDraft,
} from '../../types/assessment';

type SyncStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

export function StudentActivityPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const {
    studentDraft,
    hydrateStudentDraft,
    updateStudentDraftMeta,
    updateStudentAnswer,
    setStudentStep,
    resetStudentDraft,
    setLastReceipt,
  } = useAppState();
  const { exam, loading, errorType, errorMessage, reload } = usePublicExam(slug);

  const [sessionBootstrapping, setSessionBootstrapping] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const latestDraftRef = useRef<StudentSessionDraft | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const bootstrappedSlugRef = useRef<string | null>(null);

  useEffect(() => {
    latestDraftRef.current = studentDraft;
  }, [studentDraft]);

  const syncDraftToCloud = useCallback(
    async (draftOverride?: StudentSessionDraft) => {
      const target = draftOverride ?? latestDraftRef.current;
      if (
        !target ||
        !target.participantKey ||
        !target.idempotencyKey ||
        !target.studentName.trim()
      ) {
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus('offline');
        setSyncError(null);
        writeLocalStudentDraft(target.examSlug, {
          ...target,
          pendingCloudSync: true,
          updatedAtMs: Date.now(),
        });
        return;
      }

      setSyncStatus('saving');
      setSyncError(null);

      try {
        const res = await saveStudentProgress({
          slug: target.examSlug,
          participantKey: target.participantKey,
          participantName: target.studentName,
          idempotencyKey: target.idempotencyKey,
          currentStepIndex: target.currentStepIndex,
          answers: target.answers,
        });

        setSyncStatus('saved');
        setSyncError(null);

        const current = latestDraftRef.current;
        if (
          current &&
          current.examSlug === target.examSlug &&
          current.idempotencyKey === target.idempotencyKey
        ) {
          updateStudentDraftMeta({ lastSyncedCloudAt: res.savedAt });
          writeLocalStudentDraft(current.examSlug, {
            ...current,
            lastSyncedCloudAt: res.savedAt,
            pendingCloudSync: false,
            updatedAtMs: Date.now(),
          });
        }
      } catch (err) {
        if (err instanceof StudentApiError && err.status === 0) {
          setSyncStatus('offline');
          setSyncError(null);
        } else if (err instanceof StudentApiError && err.code === 'MAX_ATTEMPTS_REACHED') {
          setSyncStatus('error');
          setSyncError(err.message);
        } else if (err instanceof StudentApiError && err.status === 410) {
          setSyncStatus('error');
          setSyncError(err.message);
        } else {
          setSyncStatus('error');
          setSyncError(
            err instanceof Error
              ? err.message
              : 'No se pudo sincronizar con el servidor. Tu avance sigue guardado en este dispositivo.'
          );
        }
        writeLocalStudentDraft(target.examSlug, {
          ...target,
          pendingCloudSync: true,
          updatedAtMs: Date.now(),
        });
      }
    },
    [updateStudentDraftMeta]
  );

  // Listeners de conectividad para reconexión automática transparente
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      const current = latestDraftRef.current;
      if (current && current.examSlug === slug) {
        void syncDraftToCloud(current);
      }
    };
    const handleOffline = () => {
      setIsOffline(true);
      setSyncStatus('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [slug, syncDraftToCloud]);

  // Restauración de sesión al montar o recargar página (F5)
  useEffect(() => {
    if (loading) return;
    if (!exam || !slug) {
      setSessionBootstrapping(false);
      return;
    }

    if (bootstrappedSlugRef.current === slug) {
      setSessionBootstrapping(false);
      return;
    }

    let cancelled = false;

    async function restoreSession() {
      if (!slug || !exam) return;

      // Caso 1: ya está hidratado en memoria con clave de backend
      if (
        studentDraft &&
        studentDraft.examSlug === slug &&
        studentDraft.participantKey &&
        studentDraft.idempotencyKey
      ) {
        bootstrappedSlugRef.current = slug;
        setSessionBootstrapping(false);
        return;
      }

      // Caso 2: recarga de página -> recuperar desde localStorage + servidor
      const localDraft: StoredLocalStudentDraft | null =
        readLocalStudentDraft(slug);

      if (!localDraft || !localDraft.participantKey || !localDraft.idempotencyKey) {
        bootstrappedSlugRef.current = slug;
        setSessionBootstrapping(false);
        navigate(`/e/${slug}`, { replace: true });
        return;
      }

      // Hidratar de inmediato para evitar parpadeo mientras consulta el servidor
      hydrateStudentDraft(localDraft);

      try {
        const remote = await fetchStudentProgress(slug, localDraft.participantKey);
        if (cancelled) return;

        if (!remote.draft) {
          // El intento ya se envió antes (o no hay borrador activo)
          if (remote.attemptsUsed >= remote.maxAttempts && remote.lastSubmittedAttemptId) {
            clearLocalStudentDraft(slug);
            resetStudentDraft();
            navigate(
              `/e/${slug}/recibo?intento=${encodeURIComponent(remote.lastSubmittedAttemptId)}`,
              { replace: true }
            );
            return;
          }
          clearLocalStudentDraft(slug);
          resetStudentDraft();
          navigate(`/e/${slug}`, { replace: true });
          return;
        }

        const shouldPushLocal = Boolean(localDraft.pendingCloudSync);
        const merged: StudentSessionDraft = {
          examSlug: slug,
          examId: remote.examId,
          participantKey: localDraft.participantKey,
          studentName: remote.participantName || localDraft.studentName,
          idempotencyKey: shouldPushLocal
            ? localDraft.idempotencyKey
            : remote.draft.idempotencyKey,
          attemptNumber: remote.attemptsUsed + 1,
          maxAttempts: remote.maxAttempts,
          startedAt: remote.draft.startedAt || localDraft.startedAt,
          currentStepIndex: shouldPushLocal
            ? localDraft.currentStepIndex
            : remote.draft.currentStepIndex,
          answers: shouldPushLocal
            ? localDraft.answers
            : Object.keys(remote.draft.answers).length > 0
              ? remote.draft.answers
              : localDraft.answers,
          lastSavedLocallyAt: localDraft.lastSavedLocallyAt,
          lastSyncedCloudAt: remote.draft.lastSavedAt,
        };

        hydrateStudentDraft(merged);
        writeLocalStudentDraft(slug, {
          ...merged,
          pendingCloudSync: shouldPushLocal,
          updatedAtMs: Date.now(),
        });

        if (shouldPushLocal) {
          void syncDraftToCloud(merged);
        } else if (remote.draft.lastSavedAt) {
          setSyncStatus('saved');
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof StudentApiError && err.status === 0) {
          setSyncStatus('offline');
        } else if (err instanceof StudentApiError && err.status === 404) {
          setSessionError(
            'No se encontró una sesión activa en el servidor para este identificador.'
          );
        } else {
          // Seguir operando con el respaldo local mientras se restablece conexión
          setSyncStatus('offline');
        }
      } finally {
        if (!cancelled) {
          bootstrappedSlugRef.current = slug;
          setSessionBootstrapping(false);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [
    exam,
    hydrateStudentDraft,
    loading,
    navigate,
    resetStudentDraft,
    slug,
    studentDraft,
    syncDraftToCloud,
  ]);

  // Auto-guardado transparente en localStorage + nube con debounce
  useEffect(() => {
    if (
      sessionBootstrapping ||
      !studentDraft ||
      studentDraft.examSlug !== slug ||
      !studentDraft.participantKey ||
      !studentDraft.idempotencyKey
    ) {
      return;
    }

    const nowLabel = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    writeLocalStudentDraft(studentDraft.examSlug, {
      ...studentDraft,
      lastSavedLocallyAt: nowLabel,
      pendingCloudSync: true,
      updatedAtMs: Date.now(),
    });

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      void syncDraftToCloud(latestDraftRef.current ?? studentDraft);
    }, 700);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    sessionBootstrapping,
    slug,
    studentDraft?.answers,
    studentDraft?.currentStepIndex,
    syncDraftToCloud,
  ]);

  if (loading || sessionBootstrapping) {
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
          {loading ? 'Cargando evaluación...' : 'Recuperando tu progreso...'}
        </p>
      </section>
    );
  }

  if (!exam) {
    const isNetwork = errorType === 'network';
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          {isNetwork
            ? 'Error de conexión'
            : errorType === 'closed'
              ? 'Evaluación cerrada'
              : 'Evaluación no disponible'}
        </h1>
        <p className="text-sm text-slate-600">
          {errorMessage || 'Esta evaluación no está publicada o ya fue cerrada.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {isNetwork && (
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
          {slug && (
            <Link
              to={`/e/${slug}`}
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
            >
              Ir a la portada
            </Link>
          )}
        </div>
      </section>
    );
  }

  if (sessionError || !studentDraft || studentDraft.examSlug !== exam.slug) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          Iniciá desde la portada
        </h1>
        <p className="text-sm text-slate-600">
          {sessionError ||
            'Para comenzar o retomar tu evaluación, ingresá tu identificador en la portada.'}
        </p>
        <Link
          to={`/e/${exam.slug}`}
          className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-[var(--brand-on-primary)]"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <span>Ir a la portada</span>
        </Link>
      </section>
    );
  }

  const totalSteps = exam.consignas.length;
  const currentStep = Math.min(
    studentDraft.currentStepIndex,
    Math.max(0, totalSteps - 1)
  );
  const consigna = exam.consignas[currentStep];
  const answers = studentDraft.answers;
  const progressPercent =
    totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 100;

  const allQuestions = exam.consignas.flatMap((c) => c.questions);
  const unansweredCount = allQuestions.filter(
    (q) => !isQuestionAnswered(q, answers[q.id])
  ).length;
  const answeredCount = allQuestions.length - unansweredCount;

  const flushCloudSync = (nextStepIndex?: number) => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const nextDraft: StudentSessionDraft =
      typeof nextStepIndex === 'number'
        ? { ...studentDraft, currentStepIndex: nextStepIndex }
        : studentDraft;
    void syncDraftToCloud(nextDraft);
  };

  const handleManualSave = () => {
    flushCloudSync();
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      const targetStep = currentStep - 1;
      setStudentStep(targetStep);
      flushCloudSync(targetStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      const targetStep = currentStep + 1;
      setStudentStep(targetStep);
      flushCloudSync(targetStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      flushCloudSync();
      setSubmitError(null);
      setConfirmOpen(true);
    }
  };

  const handleConfirmSubmit = async () => {
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
      setConfirmOpen(false);
      navigate(
        `/e/${exam.slug}/recibo?intento=${encodeURIComponent(receipt.attemptId)}`
      );
    } catch (err) {
      if (err instanceof StudentApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(
          'No pudimos confirmar el envío por un problema de conexión. Tus respuestas siguen guardadas: podés reintentar sin duplicar el intento.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestionInput = (question: QuestionItem) => {
    const current = answers[question.id];

    if (
      question.type === 'abierta' ||
      question.type === 'opcion_multiple' ||
      question.type === 'verdadero_falso'
    ) {
      return (
        <SurveyStandardQuestion
          question={question}
          value={current}
          onChange={(nextVal) => updateStudentAnswer(question.id, nextVal)}
        />
      );
    }

    if (question.type === 'relacionar' && question.matchPairs) {
      const mapping = current?.type === 'relacionar' ? current.mapping : {};
      const rightOptions = question.matchPairs.map((p) => p.right);
      return (
        <div className="space-y-3">
          <p className="text-base font-bold text-[#0F1E36]">{question.prompt}</p>
          <div className="space-y-2.5">
            {question.matchPairs.map((pair) => (
              <div
                key={pair.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-[#FAFBFD] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium text-[#0F1E36]">
                  {pair.left}
                </span>
                <select
                  value={mapping[pair.id] ?? ''}
                  onChange={(e) =>
                    updateStudentAnswer(question.id, {
                      type: 'relacionar',
                      mapping: { ...mapping, [pair.id]: e.target.value },
                    })
                  }
                  aria-label={`Emparejar ${pair.left}`}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36]"
                >
                  <option value="">Seleccionar correspondencia...</option>
                  {rightOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (
      question.type === 'clasificar' &&
      question.classifyItems &&
      question.categories
    ) {
      const assignments =
        current?.type === 'clasificar' ? current.assignments : {};
      return (
        <div className="space-y-3">
          <p className="text-base font-bold text-[#0F1E36]">{question.prompt}</p>
          <div className="space-y-2.5">
            {question.classifyItems.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-[#FAFBFD] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-[#0F1E36]">{item.text}</span>
                <select
                  value={assignments[item.id] ?? ''}
                  onChange={(e) =>
                    updateStudentAnswer(question.id, {
                      type: 'clasificar',
                      assignments: {
                        ...assignments,
                        [item.id]: e.target.value,
                      },
                    })
                  }
                  aria-label={`Categoría para ${item.text}`}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36]"
                >
                  <option value="">Elegir categoría...</option>
                  {question.categories!.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (question.type === 'cuadro_comparativo' && question.comparativeTable) {
      const cells =
        current?.type === 'cuadro_comparativo' ? current.cells : {};
      return (
        <div className="space-y-3">
          <p className="text-base font-bold text-[#0F1E36]">{question.prompt}</p>
          <ComparativeTableView
            config={question.comparativeTable}
            mode="student"
            values={cells}
            onChangeCell={(rowId, colId, val) => {
              const prevRow = cells[rowId] ?? {};
              const next: StudentAnswerValue = {
                type: 'cuadro_comparativo',
                cells: {
                  ...cells,
                  [rowId]: { ...prevRow, [colId]: val },
                },
              };
              updateStudentAnswer(question.id, next);
            }}
          />
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-xs space-y-6">
        {isOffline && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-900"
          >
            <WifiOff
              className="h-4 w-4 shrink-0 mt-0.5 text-amber-700"
              aria-hidden="true"
            />
            <span>
              Sin conexión a internet. Tus respuestas se guardan en este
              dispositivo y se sincronizarán automáticamente al reconectar.
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36]">
              {exam.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {exam.course ? `${exam.course} · ` : ''}
              Docente: {exam.teachersText}
            </p>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-center">
            <span className="text-sm font-semibold font-mono-tabular text-[#0F1E36] whitespace-nowrap">
              Actividad {currentStep + 1} de {totalSteps}
            </span>
            <div
              role="progressbar"
              aria-valuenow={currentStep + 1}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-label={`Actividad ${currentStep + 1} de ${totalSteps}`}
              className="h-2.5 w-28 sm:w-32 overflow-hidden rounded-full bg-slate-200"
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: 'var(--brand-primary)',
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-[#FAFBFD] px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-slate-600">Nombre y apellido:</span>
            <span className="font-semibold text-[#0F1E36]">
              {studentDraft.studentName}
            </span>
            {typeof studentDraft.attemptNumber === 'number' &&
              typeof studentDraft.maxAttempts === 'number' && (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-mono-tabular text-slate-600">
                  Intento {studentDraft.attemptNumber} de{' '}
                  {studentDraft.maxAttempts}
                </span>
              )}
          </div>
          <Link
            to={`/e/${exam.slug}`}
            className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-[#0F1E36] hover:underline"
          >
            Cambiar participante
          </Link>
        </div>

        <hr className="border-slate-200" />

        {consigna && (
          <div className="space-y-5">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center rounded-full bg-[#E3EEFA] px-3 py-1 text-xs font-bold text-[#0B3B70]">
                  Consigna {currentStep + 1}
                </span>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F1E36]">
                  {consigna.title}
                </h2>
              </div>
              {consigna.instructions && (
                <p className="text-sm sm:text-base leading-relaxed text-slate-600 whitespace-pre-line">
                  {consigna.instructions}
                </p>
              )}
            </div>

            {consigna.image && (
              <figure className="overflow-hidden rounded-xl border border-slate-200 bg-[#FAFBFD]">
                <img
                  src={consigna.image.url}
                  alt={consigna.image.alt || consigna.title}
                  referrerPolicy="no-referrer"
                  className="max-h-72 w-full object-contain"
                />
              </figure>
            )}

            {consigna.contextBoxText && (
              <div className="rounded-xl border border-slate-200 bg-[#F4F7FB] p-4 sm:p-5 space-y-1.5">
                {consigna.contextBoxTitle && (
                  <h3 className="font-display text-base font-bold text-[#0F1E36]">
                    {consigna.contextBoxTitle}
                  </h3>
                )}
                <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                  {consigna.contextBoxText}
                </p>
              </div>
            )}

            <div className="space-y-6 pt-1">
              {consigna.questions.map((question) => (
                <div key={question.id} className="space-y-3">
                  {(question.label &&
                    question.label !== consigna.contextBoxTitle) ||
                  question.points !== null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        {question.label &&
                        question.label !== consigna.contextBoxTitle
                          ? question.label
                          : ''}
                      </span>
                      {question.points !== null && (
                        <span className="text-xs font-mono-tabular text-slate-500">
                          {question.points.toFixed(2).replace('.', ',')} pts
                        </span>
                      )}
                    </div>
                  ) : null}

                  {question.image && (
                    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-[#FAFBFD]">
                      <img
                        src={question.image.url}
                        alt={question.image.alt || question.prompt}
                        referrerPolicy="no-referrer"
                        className="max-h-64 w-full object-contain"
                      />
                    </figure>
                  )}

                  {renderQuestionInput(question)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estado transparente de guardado y sincronización */}
        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#FAFBFD] px-3.5 py-2.5 text-xs text-slate-600"
        >
          <div className="flex items-center gap-2">
            {syncStatus === 'saving' && (
              <>
                <Loader2
                  className="h-3.5 w-3.5 animate-spin text-slate-500"
                  aria-hidden="true"
                />
                <span>Guardando progreso en el servidor...</span>
              </>
            )}
            {syncStatus === 'saved' && (
              <>
                <Cloud
                  className="h-3.5 w-3.5 text-emerald-700"
                  aria-hidden="true"
                />
                <span>
                  Progreso guardado en este dispositivo y en el servidor
                  {studentDraft.lastSyncedCloudAt
                    ? ` (${studentDraft.lastSyncedCloudAt})`
                    : ''}
                  . Si recargás la página no perdés tu avance.
                </span>
              </>
            )}
            {syncStatus === 'offline' && (
              <>
                <CloudOff
                  className="h-3.5 w-3.5 text-amber-700"
                  aria-hidden="true"
                />
                <span>
                  Guardado localmente en este dispositivo. Se sincronizará al
                  volver la conexión.
                </span>
              </>
            )}
            {syncStatus === 'error' && (
              <>
                <AlertCircle
                  className="h-3.5 w-3.5 text-rose-700"
                  aria-hidden="true"
                />
                <span className="text-rose-800">
                  {syncError ||
                    'No se pudo sincronizar con el servidor. Guardado en este dispositivo.'}
                </span>
              </>
            )}
            {syncStatus === 'idle' && (
              <>
                <Cloud className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>
                  El progreso se guarda automáticamente mientras respondés.
                </span>
              </>
            )}
          </div>

          {syncStatus === 'error' && (
            <button
              type="button"
              onClick={() => flushCloudSync()}
              className="inline-flex items-center gap-1 font-semibold text-[#0B3B70] hover:underline"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              <span>Reintentar sincronización</span>
            </button>
          )}
        </div>

        <hr className="border-slate-200" />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-700 hover:bg-slate-200/70 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Anterior</span>
          </button>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleManualSave}
              disabled={syncStatus === 'saving'}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
            >
              <Save className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <span>Guardar avance</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)] whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <span>
                {currentStep < totalSteps - 1
                  ? 'Siguiente'
                  : 'Enviar evaluación'}
              </span>
              {currentStep < totalSteps - 1 ? (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </article>

      {/* Diálogo accesible de confirmación antes del envío definitivo */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-dialog-title"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {unansweredCount > 0 ? (
                  <AlertTriangle
                    className="h-6 w-6 shrink-0 mt-0.5 text-amber-600"
                    aria-hidden="true"
                  />
                ) : (
                  <CheckCircle2
                    className="h-6 w-6 shrink-0 mt-0.5 text-emerald-700"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <h2
                    id="submit-dialog-title"
                    className="font-display text-lg font-bold text-[#0F1E36]"
                  >
                    {unansweredCount > 0
                      ? `Hay ${unansweredCount} ${unansweredCount === 1 ? 'respuesta' : 'respuestas'} sin completar. ¿Querés enviar igual?`
                      : '¿Confirmás el envío de tu evaluación?'}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {unansweredCount > 0
                      ? `Completaste ${answeredCount} de ${allQuestions.length} preguntas. Podés volver a revisar o enviar tus respuestas como están.`
                      : `Completaste las ${allQuestions.length} preguntas. Una vez enviada no podrás modificar este intento.`}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                aria-label="Cerrar diálogo"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-[#FAFBFD]">
              {exam.consignas.map((con, idx) => {
                const conAnswered = con.questions.filter((q) =>
                  isQuestionAnswered(q, answers[q.id])
                ).length;
                const missing = con.questions.length - conAnswered;
                return (
                  <div
                    key={con.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs sm:text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[#0F1E36]">
                        Actividad {idx + 1}:
                      </span>{' '}
                      <span className="text-slate-600 truncate">
                        {con.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`font-mono-tabular text-xs ${
                          missing > 0
                            ? 'font-semibold text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {conAnswered}/{con.questions.length}
                      </span>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => {
                          setConfirmOpen(false);
                          setStudentStep(idx);
                          flushCloudSync(idx);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-xs font-semibold hover:underline disabled:opacity-50"
                        style={{ color: 'var(--brand-primary)' }}
                      >
                        Ir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800"
              >
                <AlertCircle
                  className="h-4 w-4 shrink-0 mt-0.5 text-rose-700"
                  aria-hidden="true"
                />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
              >
                {unansweredCount > 0 ? 'Volver a revisar' : 'Revisar respuestas'}
              </button>

              <button
                type="button"
                disabled={submitting || isOffline}
                onClick={() => void handleConfirmSubmit()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {submitting ? (
                  <>
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
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
          </div>
        </div>
      )}
    </>
  );
}
