import { useState } from 'react';
import { ArrowLeft, ChevronRight, FilePlus2, Files } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAppState } from '../../context/AppStateContext';
import { duplicateExamInFirestore } from '../../services/firestoreService';

export function CreateEvaluationHubPage() {
  const { exams, firebaseUser } = useAppState();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode =
    searchParams.get('modo') === 'duplicar' ? 'duplicar' : 'elegir';

  const [mode, setMode] = useState<'elegir' | 'duplicar'>(initialMode);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(
    exams[0]?.id ?? ''
  );
  const [targetCourse, setTargetCourse] = useState('3.º B');
  const [duplicating, setDuplicating] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);

  const effectiveSelectedId =
    exams.some((e) => e.id === selectedSourceId)
      ? selectedSourceId
      : (exams[0]?.id ?? '');

  const handleDuplicateConfirm = async () => {
    if (!firebaseUser) return;
    const source = exams.find((e) => e.id === effectiveSelectedId);
    if (!source) return;

    setDupError(null);
    setDuplicating(true);
    try {
      const newId = await duplicateExamInFirestore(
        source,
        targetCourse.trim() || source.course,
        firebaseUser
      );
      navigate(`/docente/editor/${newId}`);
    } catch (err) {
      setDupError(
        err instanceof Error
          ? err.message
          : 'No se pudo duplicar la evaluación en Cloud Firestore.'
      );
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/docente/evaluaciones"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0F1E36]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Volver a Mis evaluaciones</span>
        </Link>

        <h1 className="mt-3 font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36] text-balance">
          Crear evaluación
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-600">
          Elegí si querés armar una evaluación nueva desde cero o duplicar una
          existente.
        </p>
      </div>

      {/* Two primary choices */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate('/docente/editor/nuevo')}
          className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 text-left transition-colors hover:border-slate-300 hover:bg-[#FAFBFD]"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#F4F7FB] text-[#0F1E36]">
              <FilePlus2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-base font-bold text-[#0F1E36]">
                Nueva evaluación
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Definí los datos generales y cargá consignas desde cero.
              </p>
            </div>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-slate-600"
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={() => setMode('duplicar')}
          className={`group flex items-center justify-between gap-4 rounded-xl border p-6 text-left transition-colors ${
            mode === 'duplicar'
              ? 'border-[var(--brand-primary)] bg-[#F4F8FD]'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-[#FAFBFD]'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#0F1E36]">
              <Files className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="font-display text-base font-bold text-[#0F1E36]">
                Duplicar existente
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Tomá una evaluación anterior, asignale otro curso y editala como
                borrador.
              </p>
            </div>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-slate-600"
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Duplicate selector panel */}
      {mode === 'duplicar' && (
        <section
          aria-labelledby="duplicar-panel-title"
          className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
        >
          <div>
            <h2
              id="duplicar-panel-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              Seleccioná la evaluación a duplicar
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Se copiarán las consignas, preguntas y puntajes en un nuevo
              borrador con nueva identidad y cero intentos registrados.
            </p>
          </div>

          {exams.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-6 text-center space-y-3">
              <p className="text-sm text-slate-600">
                Todavía no tenés evaluaciones guardadas en Firestore para
                duplicar.
              </p>
              <button
                type="button"
                onClick={() => navigate('/docente/editor/nuevo')}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)]"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <FilePlus2 className="h-4 w-4" />
                <span>Crear evaluación nueva</span>
              </button>
            </div>
          ) : (
            <>
              <div
                className="space-y-2.5"
                role="radiogroup"
                aria-label="Evaluaciones previas"
              >
                {exams.map((exam) => {
                  const selected = effectiveSelectedId === exam.id;
                  return (
                    <label
                      key={exam.id}
                      className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
                        selected
                          ? 'border-[var(--brand-primary)] bg-[#F4F8FD]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="radio"
                          name="duplicate-source"
                          checked={selected}
                          onChange={() => setSelectedSourceId(exam.id)}
                          className="h-4 w-4 accent-[var(--brand-primary)]"
                        />
                        <div className="min-w-0">
                          <p className="font-display text-sm font-semibold text-[#0F1E36] truncate">
                            {exam.title}
                          </p>
                          <p className="text-xs text-slate-500">
                            {exam.course} · {exam.consignas.length} consigna(s) ·{' '}
                            {exam.updatedAt}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={exam.status} />
                    </label>
                  );
                })}
              </div>

              {dupError && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900"
                >
                  {dupError}
                </div>
              )}

              <div className="flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-xs space-y-1.5">
                  <label
                    htmlFor="target-course-input"
                    className="block text-sm font-medium text-[#0F1E36]"
                  >
                    Curso para la copia
                  </label>
                  <input
                    id="target-course-input"
                    type="text"
                    value={targetCourse}
                    onChange={(e) => setTargetCourse(e.target.value)}
                    placeholder="Ej. 3.º B"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void handleDuplicateConfirm()}
                  disabled={!effectiveSelectedId || duplicating}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50 whitespace-nowrap"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <span>
                    {duplicating
                      ? 'Creando borrador...'
                      : 'Crear copia en borrador'}
                  </span>
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
