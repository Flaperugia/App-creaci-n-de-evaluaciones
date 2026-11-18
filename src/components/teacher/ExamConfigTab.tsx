import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Save,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  closeExamInFirestore,
  saveExamGradingConfig,
} from '../../services/firestoreService';
import { ExamDefinition, ExamGradingConfig } from '../../types/assessment';

interface ExamConfigTabProps {
  exam: ExamDefinition;
}

export function ExamConfigTab({ exam }: ExamConfigTabProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const [mode, setMode] = useState<'libre' | 'escala_personalizada'>(
    exam.gradingConfig?.mode ?? 'libre'
  );
  const [scaleLabel, setScaleLabel] = useState(
    exam.gradingConfig?.scaleLabel ?? ''
  );
  const [passingScoreRaw, setPassingScoreRaw] = useState(
    typeof exam.gradingConfig?.passingScore === 'number'
      ? String(exam.gradingConfig.passingScore)
      : ''
  );
  const [passingUnit, setPassingUnit] = useState<'puntos' | 'porcentaje'>(
    exam.gradingConfig?.passingUnit ?? 'puntos'
  );

  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  const [configErr, setConfigErr] = useState<string | null>(null);

  const studentUrl = `${window.location.origin}/e/${exam.slug}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
    } catch {
      // Ignorado si no hay permisos de portapapeles
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveGradingConfig = async () => {
    setSavingConfig(true);
    setConfigMsg(null);
    setConfigErr(null);

    const parsedPassing = passingScoreRaw.trim()
      ? Number(passingScoreRaw.trim().replace(',', '.'))
      : null;

    if (
      mode === 'escala_personalizada' &&
      passingScoreRaw.trim() &&
      (parsedPassing === null || Number.isNaN(parsedPassing) || parsedPassing < 0)
    ) {
      setSavingConfig(false);
      setConfigErr('El valor mínimo de aprobación debe ser un número válido mayor o igual a 0.');
      return;
    }

    const nextCfg: ExamGradingConfig = {
      mode,
      scaleLabel: mode === 'escala_personalizada' ? scaleLabel.trim() : '',
      passingUnit,
      passingScore: mode === 'escala_personalizada' ? parsedPassing : null,
    };

    try {
      await saveExamGradingConfig(exam.id, nextCfg);
      setConfigMsg('Configuración de escala guardada en Cloud Firestore.');
    } catch (err) {
      setConfigErr(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar la configuración.'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCloseExam = async () => {
    setClosing(true);
    setConfigErr(null);
    try {
      await closeExamInFirestore(exam);
      setConfirmCloseOpen(false);
    } catch (err) {
      setConfigErr(
        err instanceof Error ? err.message : 'No se pudo cerrar la evaluación.'
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Datos generales e instrucciones */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <h2 className="font-display text-lg font-bold text-[#0F1E36]">
            Datos generales y acceso estudiantil
          </h2>
          {exam.status === 'publicada' && (
            <button
              type="button"
              onClick={() => setConfirmCloseOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Cerrar evaluación</span>
            </button>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <dt className="text-xs font-medium text-slate-500">Título</dt>
            <dd className="mt-0.5 font-semibold text-[#0F1E36]">
              {exam.title}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Tipo / Subtítulo
            </dt>
            <dd className="mt-0.5 text-[#0F1E36]">{exam.subtitle || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Año y curso
            </dt>
            <dd className="mt-0.5 text-[#0F1E36]">
              {[exam.yearLabel, exam.course].filter(Boolean).join(' · ') || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Docente(s)</dt>
            <dd className="mt-0.5 text-[#0F1E36]">
              {exam.teachersText || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Modalidad de intentos
            </dt>
            <dd className="mt-0.5 text-[#0F1E36]">
              Intento único (1)
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">
              Retroalimentación inmediata
            </dt>
            <dd className="mt-0.5 text-[#0F1E36]">
              {exam.feedbackEnabled
                ? 'Habilitada para preguntas cerradas'
                : 'Desactivada'}
            </dd>
          </div>
        </dl>

        {exam.initialInstructions && (
          <div className="rounded-lg border border-slate-200 bg-[#FAFBFD] p-4 space-y-1">
            <p className="text-xs font-semibold text-slate-500">
              Instrucciones iniciales de portada
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-line">
              {exam.initialInstructions}
            </p>
          </div>
        )}

        <div className="space-y-1.5 border-t border-slate-100 pt-4">
          <label
            htmlFor="config-student-url"
            className="block text-xs font-semibold text-slate-700"
          >
            Enlace único para estudiantes (sin soluciones)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="config-student-url"
              type="text"
              readOnly
              value={studentUrl}
              className="h-10 flex-1 rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 text-xs font-mono-tabular text-slate-700"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-700" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copiar enlace</span>
                  </>
                )}
              </button>

              {exam.status === 'publicada' && (
                <Link
                  to={`/e/${exam.slug}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-[var(--brand-on-primary)] whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Abrir portada</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Escala de calificación opcional (sin asumir escala fija) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5">
        <div className="space-y-1 border-b border-slate-100 pb-4">
          <h2 className="font-display text-lg font-bold text-[#0F1E36]">
            Escala de nota y criterio de aprobación
          </h2>
          <p className="text-xs sm:text-sm text-slate-600">
            La plataforma no asume una escala fija automática. Podés dejar la
            calificación libre o registrar una escala orientativa para el equipo
            docente.
          </p>
        </div>

        <div className="space-y-3">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-[#FAFBFD] p-4">
            <input
              type="radio"
              name="grading-mode"
              checked={mode === 'libre'}
              onChange={() => setMode('libre')}
              className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
            />
            <div>
              <span className="block text-sm font-semibold text-[#0F1E36]">
                Sin escala fija (nota numérica y aprobado/desaprobado manual)
              </span>
              <span className="block text-xs text-slate-600 mt-0.5">
                El docente carga la nota y selecciona Aprobado / Desaprobado en
                cada entrega según el criterio de la cátedra.
              </span>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-[#FAFBFD] p-4">
            <input
              type="radio"
              name="grading-mode"
              checked={mode === 'escala_personalizada'}
              onChange={() => setMode('escala_personalizada')}
              className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
            />
            <div>
              <span className="block text-sm font-semibold text-[#0F1E36]">
                Escala orientativa personalizada
              </span>
              <span className="block text-xs text-slate-600 mt-0.5">
                Muestra una referencia al corregir sin sobrescribir notas ni
                forzar estados automáticamente.
              </span>
            </div>
          </label>
        </div>

        {mode === 'escala_personalizada' && (
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-[#FAFBFD] p-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label
                htmlFor="grading-scale-label"
                className="block text-xs font-semibold text-[#0F1E36]"
              >
                Nombre de escala
              </label>
              <input
                id="grading-scale-label"
                type="text"
                maxLength={60}
                value={scaleLabel}
                onChange={(e) => setScaleLabel(e.target.value)}
                placeholder="Ej. 1 a 10 o 0 a 100"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="grading-passing-score"
                className="block text-xs font-semibold text-[#0F1E36]"
              >
                Mínimo de aprobación (referencia)
              </label>
              <input
                id="grading-passing-score"
                type="text"
                inputMode="decimal"
                value={passingScoreRaw}
                onChange={(e) => setPassingScoreRaw(e.target.value)}
                placeholder="Ej. 6 o 60"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono-tabular text-[#0F1E36]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="grading-passing-unit"
                className="block text-xs font-semibold text-[#0F1E36]"
              >
                Unidad
              </label>
              <select
                id="grading-passing-unit"
                value={passingUnit}
                onChange={(e) =>
                  setPassingUnit(e.target.value as 'puntos' | 'porcentaje')
                }
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36]"
              >
                <option value="puntos">Puntos totales</option>
                <option value="porcentaje">Porcentaje (%)</option>
              </select>
            </div>
          </div>
        )}

        {configErr && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs sm:text-sm text-rose-800"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 mt-0.5 text-rose-700"
              aria-hidden="true"
            />
            <span>{configErr}</span>
          </div>
        )}

        {configMsg && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs sm:text-sm text-emerald-800"
          >
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
            <span>{configMsg}</span>
          </div>
        )}

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={savingConfig}
            onClick={() => void handleSaveGradingConfig()}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {savingConfig ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            <span>Guardar configuración de escala</span>
          </button>
        </div>
      </section>

      {confirmCloseOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="config-close-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="config-close-modal-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              ¿Cerrar evaluación?
            </h3>
            <p className="text-sm text-slate-600">
              Al cerrar{' '}
              <span className="font-semibold text-[#0F1E36]">{exam.title}</span>
              , el enlace público dejará de admitir nuevas entregas estudiantiles.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCloseOpen(false)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={() => void handleCloseExam()}
                className="h-10 rounded-lg bg-[#0F1E36] px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {closing ? 'Cerrando...' : 'Cerrar evaluación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
