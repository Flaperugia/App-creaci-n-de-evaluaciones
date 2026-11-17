import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Eye,
  FileSpreadsheet,
  Inbox,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { SchoolLogo } from '../../components/common/SchoolLogo';
import { StatusBadge } from '../../components/common/StatusBadge';
import { AttemptDetailGradingPanel } from '../../components/teacher/AttemptDetailGradingPanel';
import { ExamConfigTab } from '../../components/teacher/ExamConfigTab';
import { ExamConsignasTab } from '../../components/teacher/ExamConsignasTab';
import { useAppState } from '../../context/AppStateContext';
import {
  fetchExamById,
  subscribeExamAttempts,
} from '../../services/firestoreService';
import {
  buildParticipantAttemptCounts,
  computeAttemptScoring,
  exportExamResultsToXlsx,
  exportResultsSheetToPdf,
  formatScore,
} from '../../services/gradingAndExportService';
import { ExamAttemptRecord, ExamDefinition } from '../../types/assessment';

type DetailTab = 'resultados' | 'consignas' | 'configuracion';
type CorrectionFilter = 'todas' | 'pendiente' | 'corregida';

export function EvaluationResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const { exams, allSchoolExams, firebaseUser, authStatus, schoolIdentity } =
    useAppState();

  const contextExam =
    exams.find((e) => e.id === examId) ??
    allSchoolExams.find((e) => e.id === examId);

  const [fetchedExam, setFetchedExam] = useState<ExamDefinition | null>(null);
  const [examLookupDone, setExamLookupDone] = useState(false);

  const exam = contextExam ?? fetchedExam ?? undefined;

  const [activeTab, setActiveTab] = useState<DetailTab>('resultados');
  const [attempts, setAttempts] = useState<ExamAttemptRecord[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [correctionFilter, setCorrectionFilter] =
    useState<CorrectionFilter>('todas');

  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSubId(null);
    setActiveTab('resultados');
    setFetchedExam(null);
    setExamLookupDone(false);
  }, [examId]);

  useEffect(() => {
    if (contextExam || !examId || !firebaseUser) {
      return;
    }
    let cancelled = false;
    fetchExamById(examId)
      .then((res) => {
        if (!cancelled) {
          setFetchedExam(res);
          setExamLookupDone(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExamLookupDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contextExam, examId, firebaseUser]);

  useEffect(() => {
    if (!exam || !firebaseUser) {
      setAttempts([]);
      setAttemptsLoading(false);
      return;
    }

    setAttemptsLoading(true);
    setAttemptsError(null);

    const unsub = subscribeExamAttempts(
      exam.id,
      firebaseUser.uid,
      authStatus === 'admin',
      (list) => {
        setAttempts(list);
        setAttemptsLoading(false);
        setAttemptsError(null);
      },
      (message) => {
        setAttemptsLoading(false);
        setAttemptsError(message);
      }
    );

    return () => unsub();
  }, [authStatus, exam, firebaseUser, reloadNonce]);

  const participantCounts = useMemo(
    () => buildParticipantAttemptCounts(attempts),
    [attempts]
  );

  const filteredAttempts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return attempts.filter((att) => {
      if (
        correctionFilter !== 'todas' &&
        att.correctionStatus !== correctionFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        att.participantName.toLowerCase().includes(q) ||
        att.attemptCode.toLowerCase().includes(q)
      );
    });
  }, [attempts, correctionFilter, searchQuery]);

  const selectedAttemptIndex = useMemo(
    () =>
      selectedSubId
        ? filteredAttempts.findIndex((a) => a.id === selectedSubId)
        : -1,
    [filteredAttempts, selectedSubId]
  );

  const selectedSubmission = useMemo(
    () => attempts.find((a) => a.id === selectedSubId) ?? null,
    [attempts, selectedSubId]
  );

  const pendingCount = useMemo(
    () => attempts.filter((a) => a.correctionStatus === 'pendiente').length,
    [attempts]
  );

  const handleExportXlsx = async () => {
    if (!exam || attempts.length === 0) return;
    setExportingXlsx(true);
    setExportError(null);
    try {
      await exportExamResultsToXlsx({
        exam,
        school: schoolIdentity,
        attempts,
      });
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el archivo XLSX.'
      );
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleExportPdfSheet = () => {
    if (!exam || attempts.length === 0) return;
    setExportError(null);
    try {
      exportResultsSheetToPdf({
        exam,
        school: schoolIdentity,
        attempts,
      });
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'No se pudo generar el archivo PDF.'
      );
    }
  };

  if (!exam && !examLookupDone) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
        <Loader2
          className="mx-auto h-6 w-6 animate-spin text-slate-500"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-slate-600">
          Cargando detalle de la evaluación...
        </p>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          Evaluación no encontrada o sin permiso de acceso
        </h1>
        <p className="text-sm text-slate-600">
          Solo podés consultar resultados de evaluaciones propias guardadas en
          Cloud Firestore.
        </p>
        <Link
          to="/docente/evaluaciones"
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0F1E36] hover:bg-slate-50"
        >
          Volver a Mis evaluaciones
        </Link>
      </div>
    );
  }

  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'resultados', label: 'Resultados', count: attempts.length },
    { id: 'consignas', label: 'Consignas', count: exam.consignas.length },
    { id: 'configuracion', label: 'Configuración' },
  ];

  return (
    <div className="space-y-6">
      {/* Encabezado institucional */}
      <div className="space-y-3 no-print">
        <Link
          to="/docente/evaluaciones"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0F1E36]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Volver a Mis evaluaciones</span>
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36]">
                {exam.title}
              </h1>
              <StatusBadge status={exam.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {[exam.subtitle, exam.yearLabel, exam.course, exam.teachersText]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {/* Pestañas: Resultados | Consignas | Configuración */}
      <div
        role="tablist"
        aria-label="Secciones de la evaluación"
        className="flex flex-wrap gap-1 border-b border-slate-200 no-print"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-[var(--brand-primary)] text-[#0F1E36]'
                  : 'border-transparent text-slate-600 hover:text-[#0F1E36]'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="font-mono-tabular text-xs text-slate-500">
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel: Resultados */}
      {activeTab === 'resultados' && (
        <div
          id="panel-resultados"
          role="tabpanel"
          aria-labelledby="tab-resultados"
          className="space-y-5"
        >
          {selectedSubmission ? (
            <AttemptDetailGradingPanel
              exam={exam}
              attempt={selectedSubmission}
              attemptIndex={
                selectedAttemptIndex >= 0 ? selectedAttemptIndex : 0
              }
              totalAttemptsInList={filteredAttempts.length || 1}
              participantTotalAttempts={
                participantCounts[
                  selectedSubmission.participantKey ||
                    selectedSubmission.participantName.trim().toLowerCase()
                ] ?? 1
              }
              onBack={() => setSelectedSubId(null)}
              onSelectPrevious={
                selectedAttemptIndex > 0
                  ? () =>
                      setSelectedSubId(
                        filteredAttempts[selectedAttemptIndex - 1].id
                      )
                  : undefined
              }
              onSelectNext={
                selectedAttemptIndex >= 0 &&
                selectedAttemptIndex < filteredAttempts.length - 1
                  ? () =>
                      setSelectedSubId(
                        filteredAttempts[selectedAttemptIndex + 1].id
                      )
                  : undefined
              }
            />
          ) : (
            <>
              {/* Encabezado imprimible solo para planilla */}
              <div className="hidden print-only border-b border-slate-300 pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <SchoolLogo identity={schoolIdentity} size="sm" />
                  <div>
                    <p className="text-xs font-semibold text-slate-600">
                      {schoolIdentity.name}
                    </p>
                    <h2 className="font-display text-lg font-bold text-[#0F1E36]">
                      Planilla de resultados · {exam.title}
                    </h2>
                    <p className="text-xs text-slate-600">
                      {[exam.yearLabel, exam.course, exam.teachersText]
                        .filter(Boolean)
                        .join(' · ')}{' '}
                      · Entregas: {attempts.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Barra de acciones de exportación, filtros y resumen */}
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between no-print">
                <div className="flex flex-1 flex-col gap-2.5 sm:flex-row sm:items-center">
                  <div className="relative flex-1 max-w-xs">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre o código..."
                      aria-label="Buscar entrega por nombre o código"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
                    />
                  </div>

                  <select
                    aria-label="Filtrar por estado de corrección"
                    value={correctionFilter}
                    onChange={(e) =>
                      setCorrectionFilter(e.target.value as CorrectionFilter)
                    }
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none"
                  >
                    <option value="todas">
                      Todas ({attempts.length})
                    </option>
                    <option value="pendiente">
                      Pendientes ({pendingCount})
                    </option>
                    <option value="corregida">
                      Corregidas ({attempts.length - pendingCount})
                    </option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={attempts.length === 0}
                    onClick={() => window.print()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap"
                  >
                    <Printer
                      className="h-4 w-4 text-slate-600"
                      aria-hidden="true"
                    />
                    <span>Imprimir planilla</span>
                  </button>

                  <button
                    type="button"
                    disabled={attempts.length === 0}
                    onClick={handleExportPdfSheet}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-45 whitespace-nowrap"
                  >
                    <Download
                      className="h-4 w-4 text-slate-600"
                      aria-hidden="true"
                    />
                    <span>Exportar PDF</span>
                  </button>

                  <button
                    type="button"
                    disabled={attempts.length === 0 || exportingXlsx}
                    onClick={() => void handleExportXlsx()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-45 whitespace-nowrap"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    {exportingXlsx ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>
                      {exportingXlsx ? 'Generando XLSX...' : 'Exportar XLSX'}
                    </span>
                  </button>
                </div>
              </div>

              {exportError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 no-print"
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 mt-0.5 text-rose-700"
                    aria-hidden="true"
                  />
                  <span>{exportError}</span>
                </div>
              )}

              {/* Estados de carga, error o vacío */}
              {attemptsLoading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
                  <Loader2
                    className="mx-auto h-6 w-6 animate-spin text-slate-500"
                    aria-hidden="true"
                  />
                  <p className="text-sm text-slate-600">
                    Cargando entregas registradas en Cloud Firestore...
                  </p>
                </div>
              ) : attemptsError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-6 space-y-3"
                >
                  <div className="flex items-start gap-2.5 text-rose-900">
                    <AlertCircle
                      className="h-5 w-5 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="space-y-1">
                      <h2 className="font-display text-base font-bold">
                        No se pudieron cargar las entregas
                      </h2>
                      <p className="text-sm text-rose-800">{attemptsError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReloadNonce((n) => n + 1)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300 bg-white px-3.5 text-xs font-semibold text-rose-900 hover:bg-rose-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reintentar</span>
                  </button>
                </div>
              ) : attempts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-3">
                  <Inbox
                    className="mx-auto h-8 w-8 text-slate-400"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-base font-bold text-[#0F1E36]">
                    Todavía no hay entregas registradas
                  </h2>
                  <p className="mx-auto max-w-md text-sm text-slate-600 leading-relaxed">
                    Cuando los estudiantes envíen esta evaluación desde{' '}
                    <code className="font-mono-tabular text-xs">
                      /e/{exam.slug}
                    </code>
                    , vas a poder corregir cada intento y exportar la planilla
                    en XLSX o PDF.
                  </p>
                  {exam.status === 'publicada' && (
                    <div className="pt-1">
                      <Link
                        to={`/e/${exam.slug}`}
                        className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
                      >
                        Abrir portada de estudiante
                      </Link>
                    </div>
                  )}
                </div>
              ) : filteredAttempts.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    No hay entregas que coincidan con el filtro aplicado.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCorrectionFilter('todas');
                    }}
                    className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0F1E36] hover:bg-slate-50"
                  >
                    Limpiar filtros
                  </button>
                </div>
              ) : (
                <>
                  {/* Tabla escritorio + imprimible */}
                  <div className="hidden md:block print:block overflow-x-auto print-overflow-visible rounded-xl border border-slate-200 bg-white">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-600">
                          <th scope="col" className="px-4 py-3">
                            Estudiante / Identificador
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Intentos
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Fecha de entrega
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Puntaje
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Corrección
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Nota
                          </th>
                          <th scope="col" className="px-4 py-3">
                            Resultado
                          </th>
                          <th
                            scope="col"
                            className="px-4 py-3 text-right no-print"
                          >
                            Acción
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredAttempts.map((sub) => {
                          const key =
                            sub.participantKey ||
                            sub.participantName.trim().toLowerCase();
                          const totalForParticipant =
                            participantCounts[key] ?? 1;
                          const scoring = computeAttemptScoring({
                            exam,
                            attempt: sub,
                          });
                          const scoreDisplay =
                            scoring.totalScore !== null
                              ? `${formatScore(scoring.totalScore)}${scoring.maxTotalScore !== null ? ` / ${formatScore(scoring.maxTotalScore)}` : ''} pts`
                              : '—';

                          return (
                            <tr
                              key={sub.id}
                              onClick={() => setSelectedSubId(sub.id)}
                              className="cursor-pointer transition-colors hover:bg-[#FAFBFD]"
                            >
                              <td className="px-4 py-3.5 font-medium text-[#0F1E36]">
                                <div>{sub.participantName}</div>
                                <div className="text-xs font-mono-tabular text-slate-500">
                                  {sub.attemptCode}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 font-mono-tabular text-slate-700 whitespace-nowrap">
                                Intento {sub.attemptNumber}
                                {totalForParticipant > 1 && (
                                  <span className="block text-xs text-slate-500">
                                    {totalForParticipant} en total
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 tabular-nums text-slate-600 whitespace-nowrap">
                                {sub.submittedAt}
                              </td>
                              <td className="px-4 py-3.5 font-mono-tabular text-[#0F1E36] whitespace-nowrap">
                                {scoreDisplay}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <StatusBadge status={sub.correctionStatus} />
                              </td>
                              <td className="px-4 py-3.5 font-mono-tabular font-semibold text-[#0F1E36] whitespace-nowrap">
                                {sub.finalGrade ?? '—'}
                              </td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                <StatusBadge status={sub.resultStatus} />
                              </td>
                              <td
                                className="px-4 py-3.5 text-right no-print"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedSubId(sub.id)}
                                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36] hover:bg-slate-50"
                                >
                                  <Eye
                                    className="h-3.5 w-3.5"
                                    aria-hidden="true"
                                  />
                                  <span>
                                    {sub.correctionStatus === 'corregida'
                                      ? 'Ver / Editar'
                                      : 'Corregir'}
                                  </span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Tarjetas móviles */}
                  <div className="space-y-3 md:hidden print:hidden">
                    {filteredAttempts.map((sub) => {
                      const key =
                        sub.participantKey ||
                        sub.participantName.trim().toLowerCase();
                      const totalForParticipant = participantCounts[key] ?? 1;
                      const scoring = computeAttemptScoring({
                        exam,
                        attempt: sub,
                      });
                      const scoreDisplay =
                        scoring.totalScore !== null
                          ? `${formatScore(scoring.totalScore)}${scoring.maxTotalScore !== null ? ` / ${formatScore(scoring.maxTotalScore)}` : ''} pts`
                          : '—';

                      return (
                        <article
                          key={sub.id}
                          className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-display text-base font-bold text-[#0F1E36]">
                                {sub.participantName}
                              </h3>
                              <p className="text-xs font-mono-tabular text-slate-500">
                                {sub.attemptCode} · Intento {sub.attemptNumber}{' '}
                                ({totalForParticipant} total)
                              </p>
                            </div>
                            <StatusBadge status={sub.correctionStatus} />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                            <span className="tabular-nums">
                              {sub.submittedAt}
                            </span>
                            <span className="font-mono-tabular font-semibold text-[#0F1E36]">
                              {scoreDisplay}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">
                                Nota:{' '}
                                <strong className="font-mono-tabular text-[#0F1E36]">
                                  {sub.finalGrade ?? '—'}
                                </strong>
                              </span>
                              <StatusBadge status={sub.resultStatus} />
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedSubId(sub.id)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F1E36]"
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>
                                {sub.correctionStatus === 'corregida'
                                  ? 'Ver / Editar'
                                  : 'Corregir'}
                              </span>
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Panel: Consignas */}
      {activeTab === 'consignas' && (
        <div
          id="panel-consignas"
          role="tabpanel"
          aria-labelledby="tab-consignas"
        >
          <ExamConsignasTab exam={exam} />
        </div>
      )}

      {/* Panel: Configuración */}
      {activeTab === 'configuracion' && (
        <div
          id="panel-configuracion"
          role="tabpanel"
          aria-labelledby="tab-configuracion"
        >
          <ExamConfigTab exam={exam} />
        </div>
      )}
    </div>
  );
}
