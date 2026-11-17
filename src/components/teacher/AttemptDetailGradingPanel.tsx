import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  Printer,
  Save,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { ComparativeTableView } from '../common/ComparativeTableView';
import { SchoolLogo } from '../common/SchoolLogo';
import { StatusBadge } from '../common/StatusBadge';
import { useAppState } from '../../context/AppStateContext';
import { saveAttemptGrading } from '../../services/firestoreService';
import {
  computeAttemptScoring,
  exportSingleAttemptToPdf,
  formatScore,
} from '../../services/gradingAndExportService';
import {
  ExamAttemptRecord,
  ExamDefinition,
  QuestionItem,
} from '../../types/assessment';

interface AttemptDetailGradingPanelProps {
  exam: ExamDefinition;
  attempt: ExamAttemptRecord;
  attemptIndex: number;
  totalAttemptsInList: number;
  participantTotalAttempts: number;
  onBack: () => void;
  onSelectPrevious?: () => void;
  onSelectNext?: () => void;
}

function parseNumericScore(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const num = Number(normalized);
  if (Number.isNaN(num) || num < 0) return null;
  return Number(num.toFixed(2));
}

export function AttemptDetailGradingPanel({
  exam,
  attempt,
  attemptIndex,
  totalAttemptsInList,
  participantTotalAttempts,
  onBack,
  onSelectPrevious,
  onSelectNext,
}: AttemptDetailGradingPanelProps) {
  const { firebaseUser, authRecord, schoolIdentity } = useAppState();

  // Estado editable inicializado solo al cambiar de entrega para nunca pisar correcciones previas
  const [manualScores, setManualScores] = useState<
    Record<string, number | null>
  >(() => ({ ...attempt.manualScores }));
  const [tableRowScores, setTableRowScores] = useState<
    Record<string, Record<string, number | null>>
  >(() => ({ ...attempt.tableRowScores }));
  const [questionNotes, setQuestionNotes] = useState<Record<string, string>>(
    () => ({ ...attempt.questionNotes })
  );
  const [finalGradeInput, setFinalGradeInput] = useState<string>(
    attempt.finalGrade ?? ''
  );
  const [resultStatus, setResultStatus] = useState<
    'pendiente' | 'aprobado' | 'desaprobado'
  >(attempt.resultStatus);
  const [correctionStatus, setCorrectionStatus] = useState<
    'pendiente' | 'corregida'
  >(attempt.correctionStatus);

  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setManualScores({ ...attempt.manualScores });
    setTableRowScores({ ...attempt.tableRowScores });
    setQuestionNotes({ ...attempt.questionNotes });
    setFinalGradeInput(attempt.finalGrade ?? '');
    setResultStatus(attempt.resultStatus);
    setCorrectionStatus(attempt.correctionStatus);
    setIsDirty(false);
    setSaveMessage(null);
    setSaveError(null);
  }, [attempt.id]);

  // Recalcular puntaje acumulado en vivo sin sobrescribir las correcciones previas
  const scoring = useMemo(
    () =>
      computeAttemptScoring({
        exam,
        attempt,
        manualScoresOverride: manualScores,
        tableRowScoresOverride: tableRowScores,
      }),
    [exam, attempt, manualScores, tableRowScores]
  );

  // Referencia orientativa si el docente configuró una escala opcional en la pestaña Configuración
  const optionalScaleHint = useMemo(() => {
    const cfg = exam.gradingConfig;
    if (!cfg || cfg.mode !== 'escala_personalizada') return null;
    if (
      typeof cfg.passingScore !== 'number' ||
      scoring.totalScore === null
    ) {
      return cfg.scaleLabel ? `Escala configurada: ${cfg.scaleLabel}` : null;
    }
    if (cfg.passingUnit === 'porcentaje') {
      if (!scoring.maxTotalScore || scoring.maxTotalScore <= 0) return null;
      const pct = Math.round((scoring.totalScore / scoring.maxTotalScore) * 100);
      return `Porcentaje alcanzado: ${pct}% (criterio configurado: >= ${cfg.passingScore}%)`;
    }
    return `Criterio configurado: >= ${formatScore(cfg.passingScore)} pts`;
  }, [exam.gradingConfig, scoring.maxTotalScore, scoring.totalScore]);

  const handleManualScoreChange = (questionId: string, raw: string) => {
    const parsed = parseNumericScore(raw);
    setManualScores((prev) => ({
      ...prev,
      [questionId]: parsed,
    }));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleRowScoreChange = (
    questionId: string,
    rowId: string,
    raw: string
  ) => {
    const parsed = parseNumericScore(raw);
    setTableRowScores((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] ?? {}),
        [rowId]: parsed,
      },
    }));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleNoteChange = (questionId: string, text: string) => {
    setQuestionNotes((prev) => ({
      ...prev,
      [questionId]: text,
    }));
    setIsDirty(true);
    setSaveMessage(null);
  };

  const handleSave = async (markAsCompleted?: boolean) => {
    if (!firebaseUser) return;
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const nextCorrectionStatus: 'pendiente' | 'corregida' =
      markAsCompleted === true ? 'corregida' : correctionStatus;

    try {
      await saveAttemptGrading({
        attemptId: attempt.id,
        manualScores,
        tableRowScores,
        questionNotes,
        autoScore: scoring.autoScore,
        maxAutoScore: scoring.maxAutoScore,
        manualScore: scoring.manualScore,
        totalScore: scoring.totalScore,
        maxTotalScore: scoring.maxTotalScore,
        correctionStatus: nextCorrectionStatus,
        resultStatus,
        finalGrade: finalGradeInput.trim() || null,
        graderUser: firebaseUser,
        graderDisplayName:
          authRecord?.name ||
          firebaseUser.displayName ||
          firebaseUser.email ||
          'Docente',
      });
      if (markAsCompleted) {
        setCorrectionStatus('corregida');
      }
      setIsDirty(false);
      setSaveMessage('Corrección guardada correctamente en Cloud Firestore.');
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la corrección. Verificá tu conexión e intentá nuevamente.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    exportSingleAttemptToPdf({
      exam,
      school: schoolIdentity,
      attempt,
      manualScoresOverride: manualScores,
      tableRowScoresOverride: tableRowScores,
      questionNotesOverride: questionNotes,
      finalGradeOverride: finalGradeInput.trim() || '—',
      resultStatusOverride: resultStatus,
      correctionStatusOverride: correctionStatus,
    });
  };

  const renderQuestionCard = (
    q: QuestionItem,
    cIdx: number,
    qIdx: number
  ) => {
    const summary = scoring.questionSummaries.find(
      (s) => s.question.id === q.id
    );
    const ans = attempt.rawAnswers[q.id];
    const maxPts = summary?.maxPoints ?? null;

    if (q.type === 'opcion_multiple' || q.type === 'verdadero_falso') {
      const isCorrect = summary?.isCorrect ?? false;
      return (
        <div
          key={q.id}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 break-inside-avoid"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500">
                Consigna {cIdx + 1} · Pregunta {qIdx + 1} ·{' '}
                {q.type === 'verdadero_falso'
                  ? 'Verdadero / Falso (evaluación automática)'
                  : 'Opción múltiple (evaluación automática)'}
              </p>
              <h3 className="font-display text-base font-bold text-[#0F1E36]">
                {q.prompt}
              </h3>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  isCorrect
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-rose-200 bg-rose-50 text-rose-800'
                }`}
              >
                {isCorrect ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Correcta</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Incorrecta</span>
                  </>
                )}
              </span>

              {maxPts !== null && (
                <span className="rounded-md border border-slate-200 bg-[#FAFBFD] px-2.5 py-1 text-xs font-mono-tabular font-semibold text-[#0F1E36]">
                  {formatScore(summary?.autoAwardedPoints)} /{' '}
                  {formatScore(maxPts)} pts
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-[#FAFBFD] p-3.5 space-y-1">
              <p className="text-xs font-semibold text-slate-500">
                Respuesta del estudiante
              </p>
              <p className="text-sm text-[#0F1E36]">
                {summary?.studentLabel || 'Sin responder'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] p-3.5 space-y-1">
              <p className="text-xs font-semibold text-slate-600">
                Clave correcta (privada docente)
              </p>
              <p className="text-sm font-medium text-[#0F1E36]">
                {summary?.teacherKeyLabel}
              </p>
            </div>
          </div>

          <div className="no-print">
            <label
              htmlFor={`note-${q.id}`}
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Observación docente (opcional)
            </label>
            <input
              id={`note-${q.id}`}
              type="text"
              maxLength={400}
              value={questionNotes[q.id] ?? ''}
              onChange={(e) => handleNoteChange(q.id, e.target.value)}
              placeholder="Comentario opcional para esta respuesta..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>
          {questionNotes[q.id] && (
            <p className="hidden print:block text-xs text-slate-700">
              <span className="font-semibold">Observación docente:</span>{' '}
              {questionNotes[q.id]}
            </p>
          )}
        </div>
      );
    }

    if (q.type === 'cuadro_comparativo' && q.comparativeTable) {
      const cells =
        ans?.type === 'cuadro_comparativo' ? ans.cells : {};
      const rowScoresMap = tableRowScores[q.id] ?? {};
      const hasRowScoresEntered = q.comparativeTable.rows.some(
        (r) => typeof rowScoresMap[r.id] === 'number'
      );

      return (
        <div
          key={q.id}
          className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 break-inside-avoid"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-500">
                Consigna {cIdx + 1} · Pregunta {qIdx + 1} · Cuadro comparativo
                (corrección manual)
              </p>
              <h3 className="font-display text-base font-bold text-[#0F1E36]">
                {q.prompt}
              </h3>
            </div>

            <span className="rounded-md border border-slate-200 bg-[#FAFBFD] px-2.5 py-1 text-xs font-mono-tabular font-semibold text-[#0F1E36]">
              Subtotal: {formatScore(summary?.manualAwardedPoints)} /{' '}
              {formatScore(maxPts)} pts
            </span>
          </div>

          <ComparativeTableView
            config={q.comparativeTable}
            mode="grading_review"
            values={cells}
            showModelAnswers
          />

          {/* Puntaje por fila de tabla + puntaje manual alternativo por pregunta */}
          <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-4 space-y-3">
            <p className="text-xs font-semibold text-[#0F1E36]">
              Asignación de puntaje por fila del cuadro
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {q.comparativeTable.rows.map((row) => {
                const rowVal = rowScoresMap[row.id];
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#0F1E36] truncate">
                        {row.criterion}
                      </p>
                      {typeof row.points === 'number' && (
                        <p className="text-[11px] font-mono-tabular text-slate-500">
                          Máx. {formatScore(row.points)} pts
                        </p>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.25"
                      min={0}
                      max={typeof row.points === 'number' ? row.points : undefined}
                      aria-label={`Puntaje fila ${row.criterion}`}
                      value={typeof rowVal === 'number' ? String(rowVal) : ''}
                      onChange={(e) =>
                        handleRowScoreChange(q.id, row.id, e.target.value)
                      }
                      placeholder="0"
                      className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-right text-sm font-mono-tabular text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            {!hasRowScoresEntered && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 no-print">
                <label
                  htmlFor={`manual-total-${q.id}`}
                  className="text-xs text-slate-600"
                >
                  O asignar puntaje manual total al cuadro completo:
                </label>
                <input
                  id={`manual-total-${q.id}`}
                  type="number"
                  step="0.25"
                  min={0}
                  max={maxPts ?? undefined}
                  value={
                    typeof manualScores[q.id] === 'number'
                      ? String(manualScores[q.id])
                      : ''
                  }
                  onChange={(e) =>
                    handleManualScoreChange(q.id, e.target.value)
                  }
                  placeholder="Puntaje"
                  className="h-9 w-28 rounded-lg border border-slate-200 bg-white px-2.5 text-right text-sm font-mono-tabular text-[#0F1E36]"
                />
              </div>
            )}
          </div>

          <div className="no-print">
            <label
              htmlFor={`note-${q.id}`}
              className="block text-xs font-medium text-slate-600 mb-1"
            >
              Observación docente (opcional)
            </label>
            <textarea
              id={`note-${q.id}`}
              rows={2}
              maxLength={800}
              value={questionNotes[q.id] ?? ''}
              onChange={(e) => handleNoteChange(q.id, e.target.value)}
              placeholder="Devolución sobre el cuadro comparativo..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>
          {questionNotes[q.id] && (
            <p className="hidden print:block text-xs text-slate-700">
              <span className="font-semibold">Observación docente:</span>{' '}
              {questionNotes[q.id]}
            </p>
          )}
        </div>
      );
    }

    // Pregunta abierta (y relacionar / clasificar si existieran)
    const manualVal = manualScores[q.id];
    return (
      <div
        key={q.id}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 break-inside-avoid"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500">
              Consigna {cIdx + 1} · Pregunta {qIdx + 1} ·{' '}
              {q.type === 'abierta'
                ? 'Respuesta abierta (corrección manual)'
                : q.type === 'relacionar'
                  ? 'Relacionar pares (corrección manual)'
                  : 'Clasificar categorías (corrección manual)'}
            </p>
            <h3 className="font-display text-base font-bold text-[#0F1E36]">
              {q.prompt}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              htmlFor={`score-${q.id}`}
              className="text-xs font-medium text-slate-600"
            >
              Puntaje:
            </label>
            <input
              id={`score-${q.id}`}
              type="number"
              step="0.25"
              min={0}
              max={maxPts ?? undefined}
              value={typeof manualVal === 'number' ? String(manualVal) : ''}
              onChange={(e) => handleManualScoreChange(q.id, e.target.value)}
              placeholder="—"
              className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2.5 text-right text-sm font-mono-tabular font-semibold text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
            />
            {maxPts !== null && (
              <span className="text-xs font-mono-tabular text-slate-500">
                / {formatScore(maxPts)} pts
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-[#FAFBFD] p-4 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">
              Respuesta del estudiante
            </p>
            <p className="text-sm leading-relaxed text-[#0F1E36] whitespace-pre-line">
              {summary?.studentLabel || 'Sin responder'}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] p-4 space-y-1.5">
            <p className="text-xs font-semibold text-slate-600">
              Respuesta modelo privada docente
            </p>
            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
              {summary?.teacherKeyLabel || 'Sin respuesta modelo cargada'}
            </p>
          </div>
        </div>

        <div className="no-print">
          <label
            htmlFor={`note-${q.id}`}
            className="block text-xs font-medium text-slate-600 mb-1"
          >
            Observación docente (opcional)
          </label>
          <textarea
            id={`note-${q.id}`}
            rows={2}
            maxLength={800}
            value={questionNotes[q.id] ?? ''}
            onChange={(e) => handleNoteChange(q.id, e.target.value)}
            placeholder="Anotación de corrección para esta pregunta..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
          />
        </div>
        {questionNotes[q.id] && (
          <p className="hidden print:block text-xs text-slate-700">
            <span className="font-semibold">Observación docente:</span>{' '}
            {questionNotes[q.id]}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Barra superior de navegación y acciones de entrega individual */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Volver a la planilla</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              disabled={!onSelectPrevious}
              onClick={onSelectPrevious}
              aria-label="Entrega anterior"
              className="inline-flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2.5 text-xs font-mono-tabular text-slate-600">
              {attemptIndex + 1} / {totalAttemptsInList}
            </span>
            <button
              type="button"
              disabled={!onSelectNext}
              onClick={onSelectNext}
              aria-label="Entrega siguiente"
              className="inline-flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>Descargar PDF</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap"
          >
            <Printer className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* Encabezado institucional de la entrega (visible también en PDF imprimible) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <SchoolLogo identity={schoolIdentity} size="sm" />
            <div>
              <p className="text-xs font-semibold text-slate-500">
                {schoolIdentity.name} · {exam.title}
              </p>
              <h2 className="font-display text-xl font-bold text-[#0F1E36]">
                {attempt.participantName}
              </h2>
              <p className="text-xs text-slate-600 font-mono-tabular mt-0.5">
                Código {attempt.attemptCode} · Intento {attempt.attemptNumber}{' '}
                (total entregas del participante: {participantTotalAttempts}) ·
                Entregado: {attempt.submittedAt}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={correctionStatus} />
            <StatusBadge status={resultStatus} />
          </div>
        </div>

        {/* Resumen numérico sin sobrescribir correcciones previas */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-[#FAFBFD] p-3.5">
            <p className="text-xs text-slate-500">
              Automático (opción múltiple y V/F)
            </p>
            <p className="mt-1 font-display text-lg font-bold font-mono-tabular text-[#0F1E36]">
              {formatScore(scoring.autoScore)} /{' '}
              {formatScore(scoring.maxAutoScore)} pts
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-[#FAFBFD] p-3.5">
            <p className="text-xs text-slate-500">
              Manual (abiertas y cuadros)
            </p>
            <p className="mt-1 font-display text-lg font-bold font-mono-tabular text-[#0F1E36]">
              {formatScore(scoring.manualScore)} /{' '}
              {formatScore(scoring.maxManualScore)} pts
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] p-3.5">
            <p className="text-xs font-semibold text-slate-600">
              Puntaje total acumulado
            </p>
            <p className="mt-1 font-display text-lg font-bold font-mono-tabular text-[#0F1E36]">
              {formatScore(scoring.totalScore)} /{' '}
              {formatScore(scoring.maxTotalScore)} pts
            </p>
          </div>
        </div>

        {(attempt.gradedByName || attempt.gradedByEmail) && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-[#FAFBFD] px-3.5 py-2.5 text-xs text-slate-600">
            <UserCheck
              className="h-4 w-4 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <span>
              Última corrección registrada por{' '}
              <strong className="font-semibold text-[#0F1E36]">
                {attempt.gradedByName || attempt.gradedByEmail}
              </strong>{' '}
              ({attempt.gradedByEmail}) · {attempt.gradedAt || 'Reciente'}
            </span>
          </div>
        )}
      </section>

      {/* Consignas y preguntas de la entrega */}
      <div className="space-y-4">
        {exam.consignas.map((con, cIdx) => (
          <div key={con.id} className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-semibold text-slate-500">
                Consigna {cIdx + 1}
              </p>
              <h3 className="font-display text-base font-bold text-[#0F1E36]">
                {con.title}
              </h3>
            </div>
            {con.questions.map((q, qIdx) => renderQuestionCard(q, cIdx, qIdx))}
          </div>
        ))}
      </div>

      {/* Panel de cierre de calificación: Nota numérica, Aprobado/Desaprobado y guardado */}
      <section
        aria-labelledby="cierre-calificacion-heading"
        className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5 break-inside-avoid"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3
              id="cierre-calificacion-heading"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              Calificación final y estado
            </h3>
            <p className="text-xs text-slate-600">
              {optionalScaleHint ||
                'Sin escala automática fija: ingresá la nota numérica y seleccioná el estado según el criterio institucional.'}
            </p>
          </div>
          {scoring.pendingManualItemsCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {scoring.pendingManualItemsCount} ítem(s) manual(es) sin puntaje
                asignado
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label
              htmlFor="attempt-final-grade"
              className="block text-xs font-semibold text-[#0F1E36]"
            >
              Nota numérica
            </label>
            <input
              id="attempt-final-grade"
              type="text"
              inputMode="decimal"
              maxLength={20}
              value={finalGradeInput}
              onChange={(e) => {
                setFinalGradeInput(e.target.value);
                setIsDirty(true);
                setSaveMessage(null);
              }}
              placeholder="Ej. 8,50 o 85"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-mono-tabular text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="attempt-result-status"
              className="block text-xs font-semibold text-[#0F1E36]"
            >
              Resultado de aprobación
            </label>
            <select
              id="attempt-result-status"
              value={resultStatus}
              onChange={(e) => {
                setResultStatus(
                  e.target.value as 'pendiente' | 'aprobado' | 'desaprobado'
                );
                setIsDirty(true);
                setSaveMessage(null);
              }}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
            >
              <option value="pendiente">Pendiente</option>
              <option value="aprobado">Aprobado</option>
              <option value="desaprobado">Desaprobado</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="attempt-correction-status"
              className="block text-xs font-semibold text-[#0F1E36]"
            >
              Estado de corrección
            </label>
            <select
              id="attempt-correction-status"
              value={correctionStatus}
              onChange={(e) => {
                setCorrectionStatus(
                  e.target.value as 'pendiente' | 'corregida'
                );
                setIsDirty(true);
                setSaveMessage(null);
              }}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
            >
              <option value="pendiente">Pendiente</option>
              <option value="corregida">Corregida</option>
            </select>
          </div>
        </div>

        {saveError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm text-rose-800 no-print"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 mt-0.5 text-rose-700"
              aria-hidden="true"
            />
            <span>{saveError}</span>
          </div>
        )}

        {saveMessage && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs sm:text-sm text-emerald-800 no-print"
          >
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
            <span>{saveMessage}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 no-print">
          <span className="text-xs text-slate-500">
            {isDirty
              ? 'Tenés cambios sin guardar.'
              : 'Los puntajes previos se conservan intactos al guardar.'}
          </span>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4 text-slate-600" aria-hidden="true" />
              )}
              <span>Guardar avance</span>
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Guardar como corregida</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
