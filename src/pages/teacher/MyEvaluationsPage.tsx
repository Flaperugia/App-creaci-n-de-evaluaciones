import { useEffect, useRef, useState } from 'react';
import {
  BarChart2,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  ExternalLink,
  FilePlus2,
  FileText,
  Files,
  Lock,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAppState } from '../../context/AppStateContext';
import { SAMPLE_EXAMS } from '../../data/sampleData';
import {
  closeExamInFirestore,
  duplicateExamInFirestore,
  saveSampleExamToFirestore,
} from '../../services/firestoreService';
import { ExamDefinition, ExamStatus } from '../../types/assessment';

export function MyEvaluationsPage() {
  const { exams, firebaseUser } = useAppState();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | ExamStatus>('todas');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [shareExam, setShareExam] = useState<ExamDefinition | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<ExamDefinition | null>(
    null
  );
  const [duplicateCourse, setDuplicateCourse] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [closeTarget, setCloseTarget] = useState<ExamDefinition | null>(null);
  const [closing, setClosing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [seedingSample, setSeedingSample] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenuId(null);
        setShareExam(null);
        setDuplicateTarget(null);
        setCloseTarget(null);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const filteredExams = exams.filter((exam) => {
    const matchesStatus =
      statusFilter === 'todas' || exam.status === statusFilter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      exam.title.toLowerCase().includes(q) ||
      exam.subtitle.toLowerCase().includes(q) ||
      exam.course.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const handleCopyStudentLink = async (slug: string) => {
    const url = `${window.location.origin}/e/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Ignorado si no hay acceso al portapapeles
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCreateSampleInFirestore = async () => {
    if (!firebaseUser) return;
    setActionError(null);
    setSeedingSample(true);
    try {
      await saveSampleExamToFirestore(SAMPLE_EXAMS[0], firebaseUser);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo publicar el caso de prueba en Firestore.'
      );
    } finally {
      setSeedingSample(false);
    }
  };

  const handleConfirmDuplicate = async () => {
    if (!firebaseUser || !duplicateTarget) return;
    setActionError(null);
    setDuplicating(true);
    try {
      const newId = await duplicateExamInFirestore(
        duplicateTarget,
        duplicateCourse || duplicateTarget.course,
        firebaseUser
      );
      setDuplicateTarget(null);
      navigate(`/docente/editor/${newId}`);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo duplicar la evaluación.'
      );
    } finally {
      setDuplicating(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!closeTarget) return;
    setActionError(null);
    setClosing(true);
    try {
      await closeExamInFirestore(closeTarget);
      setCloseTarget(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo cerrar la evaluación.'
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36] text-balance">
            Mis evaluaciones
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-600">
            Creá, administrá y revisá tus evaluaciones.
          </p>
        </div>

        <Link
          to="/docente/crear"
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-[var(--brand-on-primary)] transition-colors whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Crear evaluación</span>
        </Link>
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {actionError}
        </div>
      )}

      {/* Empezar Section (2-card entry matching Mockup 2) */}
      <section aria-labelledby="empezar-heading" className="space-y-3">
        <h2
          id="empezar-heading"
          className="font-display text-lg font-bold text-[#0F1E36]"
        >
          Empezar
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            to="/docente/editor/nuevo"
            className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-[#FAFBFD]"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#F4F7FB] text-[#0F1E36]">
                <FilePlus2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-[#0F1E36]">
                  Nueva evaluación
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Creá una evaluación desde cero.
                </p>
              </div>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600"
              aria-hidden="true"
            />
          </Link>

          <Link
            to="/docente/crear?modo=duplicar"
            className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-[#FAFBFD]"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#F4F7FB] text-[#0F1E36]">
                <Files className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-[#0F1E36]">
                  Duplicar existente
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Tomá una evaluación previa y creá una copia.
                </p>
              </div>
            </div>
            <ChevronRight
              className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-600"
              aria-hidden="true"
            />
          </Link>
        </div>
      </section>

      {/* Evaluaciones anteriores Section */}
      <section aria-labelledby="anteriores-heading" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="anteriores-heading"
            className="font-display text-lg font-bold text-[#0F1E36]"
          >
            Evaluaciones anteriores
          </h2>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar evaluación o curso..."
                aria-label="Buscar evaluación o curso"
                className="h-10 w-full sm:w-60 rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-[#0F1E36] placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:outline-none"
              />
            </div>

            <div
              role="group"
              aria-label="Filtrar por estado"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1 overflow-x-auto"
            >
              {(
                [
                  { id: 'todas', label: 'Todas' },
                  { id: 'publicada', label: 'Publicadas' },
                  { id: 'borrador', label: 'Borradores' },
                  { id: 'cerrada', label: 'Cerradas' },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[#EEF4FB] text-[#0F1E36] font-semibold'
                        : 'text-slate-600 hover:text-[#0F1E36]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desktop Table */}
        <div
          ref={menuContainerRef}
          className="hidden md:block overflow-visible rounded-xl border border-slate-200 bg-white"
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Evaluación
                </th>
                <th scope="col" className="px-4 py-3">
                  Curso
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Última actualización
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredExams.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      {exams.length === 0
                        ? 'Todavía no tenés evaluaciones guardadas a tu nombre en Cloud Firestore.'
                        : 'No hay evaluaciones que coincidan con el filtro aplicado.'}
                    </p>
                    {exams.length === 0 && (
                      <button
                        type="button"
                        disabled={seedingSample}
                        onClick={() => void handleCreateSampleInFirestore()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>
                          {seedingSample
                            ? 'Publicando evaluación de prueba...'
                            : 'Publicar caso de prueba (Historia 2.º año) en Firestore'}
                        </span>
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredExams.map((exam) => {
                  const canViewResults =
                    exam.status !== 'borrador' || exam.submissionsCount > 0;
                  return (
                    <tr
                      key={exam.id}
                      className="transition-colors hover:bg-[#FAFBFD]"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#F4F7FB] text-slate-600">
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-display font-semibold text-[#0F1E36]">
                              {exam.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {exam.subtitle}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                        {exam.course}
                      </td>

                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge status={exam.status} />
                      </td>

                      <td className="px-4 py-3.5 text-slate-600 tabular-nums whitespace-nowrap">
                        {exam.updatedAt}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {canViewResults && (
                            <Link
                              to={`/docente/evaluaciones/${exam.id}/resultados`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap shrink-0"
                            >
                              <BarChart2
                                className="h-3.5 w-3.5 text-slate-600"
                                aria-hidden="true"
                              />
                              <span>Ver resultados</span>
                            </Link>
                          )}

                          <Link
                            to={`/docente/editor/${exam.id}`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap shrink-0"
                          >
                            <Edit3
                              className="h-3.5 w-3.5 text-slate-600"
                              aria-hidden="true"
                            />
                            <span>Editar</span>
                          </Link>

                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId((prev) =>
                                  prev === exam.id ? null : exam.id
                                )
                              }
                              aria-label={`Más acciones para ${exam.title}`}
                              aria-expanded={openMenuId === exam.id}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>

                            {openMenuId === exam.id && (
                              <div
                                role="menu"
                                className="absolute right-0 z-20 mt-1.5 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-lg"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    setDuplicateTarget(exam);
                                    setDuplicateCourse(exam.course);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  <span>Duplicar en borrador</span>
                                </button>

                                {exam.status !== 'borrador' && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setShareExam(exam);
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <Share2 className="h-3.5 w-3.5" />
                                    <span>Compartir enlace</span>
                                  </button>
                                )}

                                {exam.status === 'publicada' && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      navigate(`/e/${exam.slug}`);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    <span>Abrir vista estudiante</span>
                                  </button>
                                )}

                                {exam.status === 'publicada' && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setCloseTarget(exam);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                  >
                                    <Lock className="h-3.5 w-3.5" />
                                    <span>Cerrar evaluación</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="space-y-3 md:hidden">
          {filteredExams.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center space-y-3 text-sm text-slate-600">
              <p>
                {exams.length === 0
                  ? 'Todavía no tenés evaluaciones guardadas a tu nombre en Cloud Firestore.'
                  : 'No hay evaluaciones que coincidan con el filtro aplicado.'}
              </p>
              {exams.length === 0 && (
                <button
                  type="button"
                  disabled={seedingSample}
                  onClick={() => void handleCreateSampleInFirestore()}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0F1E36]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Publicar caso de prueba en Firestore</span>
                </button>
              )}
            </div>
          ) : (
            filteredExams.map((exam) => {
              const canViewResults =
                exam.status !== 'borrador' || exam.submissionsCount > 0;
              return (
                <article
                  key={exam.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-base font-semibold text-[#0F1E36]">
                        {exam.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {exam.subtitle}
                      </p>
                    </div>
                    <StatusBadge status={exam.status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                    <span>Curso: {exam.course}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{exam.updatedAt}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {canViewResults && (
                      <Link
                        to={`/docente/evaluaciones/${exam.id}/resultados`}
                        className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36]"
                      >
                        <BarChart2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Ver resultados</span>
                      </Link>
                    )}
                    <Link
                      to={`/docente/editor/${exam.id}`}
                      className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36]"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Editar</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicateTarget(exam);
                        setDuplicateCourse(exam.course);
                      }}
                      className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36]"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Duplicar</span>
                    </button>
                    {exam.status !== 'borrador' && (
                      <button
                        type="button"
                        onClick={() => setShareExam(exam)}
                        className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36]"
                      >
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Compartir</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* Modal Compartir enlace */}
      {shareExam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="space-y-1">
              <h3
                id="share-modal-title"
                className="font-display text-lg font-bold text-[#0F1E36]"
              >
                Compartir evaluación
              </h3>
              <p className="text-sm text-slate-600">{shareExam.title}</p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="student-share-url"
                className="block text-xs font-semibold text-slate-700"
              >
                Enlace público para estudiantes (sin cuenta ni soluciones)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="student-share-url"
                  type="text"
                  readOnly
                  value={`${window.location.origin}/e/${shareExam.slug}`}
                  className="h-10 flex-1 rounded-lg border border-slate-200 bg-[#F8FAFC] px-3 text-xs font-mono-tabular text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyStudentLink(shareExam.slug)}
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
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShareExam(null)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  const slug = shareExam.slug;
                  setShareExam(null);
                  navigate(`/e/${slug}`);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)]"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>Abrir vista estudiante</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Duplicar */}
      {duplicateTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dup-list-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="dup-list-modal-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              Duplicar evaluación
            </h3>
            <p className="text-sm text-slate-600">
              Se creará un borrador nuevo basado en{' '}
              <span className="font-semibold text-[#0F1E36]">
                {duplicateTarget.title}
              </span>{' '}
              sin copiar entregas anteriores.
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="dup-list-course"
                className="block text-xs font-semibold text-slate-700"
              >
                Curso asignado para la copia
              </label>
              <input
                id="dup-list-course"
                type="text"
                value={duplicateCourse}
                onChange={(e) => setDuplicateCourse(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-[#0F1E36]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateTarget(null)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={duplicating}
                onClick={() => void handleConfirmDuplicate()}
                className="h-10 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {duplicating ? 'Duplicando...' : 'Crear borrador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cerrar evaluación */}
      {closeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-list-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="close-list-modal-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              ¿Cerrar evaluación?
            </h3>
            <p className="text-sm text-slate-600">
              Al cerrar{' '}
              <span className="font-semibold text-[#0F1E36]">
                {closeTarget.title}
              </span>
              , el enlace público dejará de aceptar entregas estudiantiles.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCloseTarget(null)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={() => void handleConfirmClose()}
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
