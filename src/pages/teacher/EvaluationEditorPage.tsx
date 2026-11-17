import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  GraduationCap,
  Lock,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ComparativeTableView } from '../../components/common/ComparativeTableView';
import { ImageAttachmentField } from '../../components/common/ImageAttachmentField';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SurveyStandardQuestion } from '../../components/common/SurveyStandardQuestion';
import { useAppState } from '../../context/AppStateContext';
import {
  closeExamInFirestore,
  duplicateExamInFirestore,
  fetchExamById,
  publishExam,
  saveExamDraft,
  validateExamForPublish,
} from '../../services/firestoreService';
import {
  ComparativeTableConfig,
  ConsignaBlock,
  CURRENT_EXAM_SCHEMA_VERSION,
  ExamDefinition,
  QuestionItem,
  QuestionType,
  StudentAnswerValue,
} from '../../types/assessment';

const EDITOR_QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'abierta', label: 'Respuesta abierta / desarrollo' },
  { value: 'opcion_multiple', label: 'Opción múltiple (única o múltiple)' },
  { value: 'verdadero_falso', label: 'Verdadero / Falso' },
  { value: 'cuadro_comparativo', label: 'Cuadro comparativo' },
];

const LEGACY_TYPE_LABELS: Partial<Record<QuestionType, string>> = {
  relacionar: 'Relacionar pares (solo lectura heredada)',
  clasificar: 'Clasificar categorías (solo lectura heredada)',
};

function makeUid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultComparativeTable(): ComparativeTableConfig {
  const col1 = makeUid('col');
  const col2 = makeUid('col');
  return {
    criteriaHeader: 'Criterio de comparación',
    scoringMode: 'por_fila',
    columns: [
      { id: col1, title: 'Columna A' },
      { id: col2, title: 'Columna B' },
    ],
    rows: [
      { id: makeUid('row'), criterion: 'Criterio 1', points: 1, modelAnswers: {} },
      { id: makeUid('row'), criterion: 'Criterio 2', points: 1, modelAnswers: {} },
    ],
  };
}

function createBlankExam(
  teacherName: string,
  ownerEmail: string,
  ownerId?: string
): ExamDefinition {
  const now = Date.now();
  return {
    id: `exam-nuevo-${now}`,
    schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
    slug: `evaluacion-${now.toString().slice(-6)}`,
    title: '',
    subtitle: '',
    yearLabel: '2.º año',
    course: '2.º A',
    teachersText: teacherName || 'Docente',
    ownerId,
    ownerEmail,
    initialInstructions:
      'Leé atentamente cada consigna antes de responder. Podés revisar tus respuestas antes de confirmar la entrega.',
    maxAttempts: 1,
    feedbackEnabled: true,
    status: 'borrador',
    updatedAt: 'Sin guardar aún',
    submissionsCount: 0,
    consignas: [
      {
        id: makeUid('con'),
        order: 1,
        title: 'Consigna 1',
        instructions: 'Leé la situación y respondé con tus propias palabras.',
        questions: [
          {
            id: makeUid('q'),
            type: 'abierta',
            label: 'Pregunta 1',
            prompt: '',
            points: 1,
            modelAnswer: '',
          },
        ],
      },
    ],
  };
}

function cloneConsignaWithFreshIds(source: ConsignaBlock, nextOrder: number): ConsignaBlock {
  return {
    ...source,
    id: makeUid('con'),
    order: nextOrder,
    title: source.title ? `${source.title} (Copia)` : `Consigna ${nextOrder}`,
    image: source.image ? { ...source.image } : undefined,
    questions: source.questions.map((q) => {
      const cloned: QuestionItem = {
        ...q,
        id: makeUid('q'),
        image: q.image ? { ...q.image } : undefined,
      };
      if (q.options) {
        cloned.options = q.options.map((opt) => ({
          ...opt,
          id: makeUid('opt'),
        }));
      }
      if (q.comparativeTable) {
        const colIdMap: Record<string, string> = {};
        const newCols = q.comparativeTable.columns.map((col) => {
          const newId = makeUid('col');
          colIdMap[col.id] = newId;
          return { id: newId, title: col.title };
        });
        const newRows = q.comparativeTable.rows.map((row) => {
          const remappedAnswers: Record<string, string> = {};
          if (row.modelAnswers) {
            Object.entries(row.modelAnswers).forEach(([oldColId, val]) => {
              const targetColId = colIdMap[oldColId];
              if (targetColId) remappedAnswers[targetColId] = val;
            });
          }
          return {
            id: makeUid('row'),
            criterion: row.criterion,
            points: row.points,
            modelAnswers: remappedAnswers,
          };
        });
        cloned.comparativeTable = {
          ...q.comparativeTable,
          columns: newCols,
          rows: newRows,
        };
      }
      return cloned;
    }),
  };
}

export function EvaluationEditorPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { firebaseUser, authRecord, exams, allSchoolExams } = useAppState();

  const [draft, setDraft] = useState<ExamDefinition>(() =>
    createBlankExam(
      authRecord?.name || firebaseUser?.displayName || '',
      firebaseUser?.email || '',
      firebaseUser?.uid
    )
  );
  const [loadingExam, setLoadingExam] = useState<boolean>(
    Boolean(examId && examId !== 'nuevo')
  );
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState<1 | 2 | 3>(examId && examId !== 'nuevo' ? 2 : 1);
  const [expandedModelIds, setExpandedModelIds] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Confirmations (without window.confirm / window.alert)
  const [confirmDeleteConsignaId, setConfirmDeleteConsignaId] = useState<string | null>(null);
  const [confirmDeleteQuestion, setConfirmDeleteQuestion] = useState<{
    conId: string;
    qId: string;
  } | null>(null);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateCourse, setDuplicateCourse] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingExam, setClosingExam] = useState(false);

  // Interactive student preview state in Step 3
  const [previewStepIdx, setPreviewStepIdx] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, StudentAnswerValue>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!examId || examId === 'nuevo') {
        setNotFound(false);
        setLoadingExam(false);
        setDraft(
          createBlankExam(
            authRecord?.name || firebaseUser?.displayName || '',
            firebaseUser?.email || '',
            firebaseUser?.uid
          )
        );
        setStep(1);
        return;
      }

      setLoadingExam(true);
      setNotFound(false);

      const inMemory =
        exams.find((e) => e.id === examId) ??
        allSchoolExams.find((e) => e.id === examId);

      try {
        const remote = await fetchExamById(examId);
        if (cancelled) return;
        const resolved = remote ?? inMemory;
        if (!resolved) {
          setNotFound(true);
        } else {
          setDraft(structuredClone(resolved));
          setDuplicateCourse(resolved.course);
        }
      } catch {
        if (!cancelled) {
          if (inMemory) {
            setDraft(structuredClone(inMemory));
            setDuplicateCourse(inMemory.course);
          } else {
            setNotFound(true);
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingExam(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Only re-fetch when examId changes so active edits are never overwritten by snapshot updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const isLockedPublished =
    draft.status === 'publicada' && draft.submissionsCount > 0;
  const isClosed = draft.status === 'cerrada';
  const isReadOnly = isLockedPublished || isClosed;

  const uploaderUid = firebaseUser?.uid ?? draft.ownerId ?? '';
  const storageExamFolderId =
    draft.id && !draft.id.startsWith('exam-nuevo-') ? draft.id : 'borrador';

  const toggleModelAnswer = (qId: string) => {
    setExpandedModelIds((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const showSuccess = (text: string) => {
    setStatusFeedback({ type: 'success', text });
  };

  const showError = (text: string) => {
    setStatusFeedback({ type: 'error', text });
  };

  const handleSaveDraft = async () => {
    if (!firebaseUser || isReadOnly) return;
    setStatusFeedback(null);
    setSaving(true);
    try {
      const saved = await saveExamDraft(draft, firebaseUser);
      const isNew = draft.id.startsWith('exam-nuevo-');
      setDraft((prev) => ({
        ...prev,
        id: saved.examId,
        slug: saved.slug,
        ownerId: prev.ownerId ?? firebaseUser.uid,
        schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
        updatedAt: 'Guardado recién en Firestore',
      }));
      showSuccess('Borrador guardado en Cloud Firestore.');
      if (isNew) {
        navigate(`/docente/editor/${saved.examId}`, { replace: true });
      }
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el borrador en Firestore.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateConsigna = (
    conId: string,
    patch: Partial<ConsignaBlock>
  ) => {
    if (isReadOnly) return;
    setDraft((prev) => ({
      ...prev,
      consignas: prev.consignas.map((c) =>
        c.id === conId ? { ...c, ...patch } : c
      ),
    }));
  };

  const handleMoveConsigna = (index: number, direction: -1 | 1) => {
    if (isReadOnly) return;
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= draft.consignas.length) return;
    setDraft((prev) => {
      const copy = [...prev.consignas];
      const [moved] = copy.splice(index, 1);
      copy.splice(nextIdx, 0, moved);
      return {
        ...prev,
        consignas: copy.map((c, idx) => ({ ...c, order: idx + 1 })),
      };
    });
  };

  const handleDuplicateConsigna = (index: number) => {
    if (isReadOnly) return;
    setDraft((prev) => {
      const source = prev.consignas[index];
      if (!source) return prev;
      const cloned = cloneConsignaWithFreshIds(source, index + 2);
      const copy = [...prev.consignas];
      copy.splice(index + 1, 0, cloned);
      return {
        ...prev,
        consignas: copy.map((c, idx) => ({ ...c, order: idx + 1 })),
      };
    });
    showSuccess(`Consigna ${index + 1} duplicada. Recordá guardar el borrador.`);
  };

  const confirmAndDeleteConsigna = () => {
    if (isReadOnly || !confirmDeleteConsignaId) return;
    if (draft.consignas.length <= 1) {
      setConfirmDeleteConsignaId(null);
      return;
    }
    setDraft((prev) => ({
      ...prev,
      consignas: prev.consignas
        .filter((c) => c.id !== confirmDeleteConsignaId)
        .map((c, idx) => ({ ...c, order: idx + 1 })),
    }));
    setConfirmDeleteConsignaId(null);
    showSuccess('Consigna eliminada del borrador.');
  };

  const handleAddConsigna = () => {
    if (isReadOnly) return;
    const num = draft.consignas.length + 1;
    const newConsigna: ConsignaBlock = {
      id: makeUid('con'),
      order: num,
      title: `Consigna ${num}`,
      instructions: 'Indicá las pautas para esta actividad.',
      questions: [
        {
          id: makeUid('q'),
          type: 'abierta',
          label: 'Pregunta 1',
          prompt: '',
          points: 1,
          modelAnswer: '',
        },
      ],
    };
    setDraft((prev) => ({
      ...prev,
      consignas: [...prev.consignas, newConsigna],
    }));
  };

  const handleAddQuestion = (conId: string) => {
    if (isReadOnly) return;
    setDraft((prev) => ({
      ...prev,
      consignas: prev.consignas.map((c) => {
        if (c.id !== conId) return c;
        const nextNum = c.questions.length + 1;
        const q: QuestionItem = {
          id: makeUid('q'),
          type: 'abierta',
          label: `Pregunta ${nextNum}`,
          prompt: '',
          points: 1,
          modelAnswer: '',
        };
        return { ...c, questions: [...c.questions, q] };
      }),
    }));
  };

  const handleUpdateQuestion = (
    conId: string,
    qId: string,
    patch: Partial<QuestionItem>
  ) => {
    if (isReadOnly) return;
    setDraft((prev) => ({
      ...prev,
      consignas: prev.consignas.map((c) => {
        if (c.id !== conId) return c;
        return {
          ...c,
          questions: c.questions.map((q) => {
            if (q.id !== qId) return q;
            const updated: QuestionItem = { ...q, ...patch };
            if (patch.type === 'opcion_multiple' && !updated.options) {
              updated.options = [
                { id: makeUid('opt'), label: 'Opción A', isCorrect: true },
                { id: makeUid('opt'), label: 'Opción B', isCorrect: false },
              ];
              updated.allowMultiple = Boolean(updated.allowMultiple);
            }
            if (
              patch.type === 'verdadero_falso' &&
              updated.correctBoolean === undefined
            ) {
              updated.correctBoolean = true;
            }
            if (
              patch.type === 'cuadro_comparativo' &&
              !updated.comparativeTable
            ) {
              updated.comparativeTable = createDefaultComparativeTable();
            }
            return updated;
          }),
        };
      }),
    }));
  };

  const confirmAndDeleteQuestion = () => {
    if (isReadOnly || !confirmDeleteQuestion) return;
    const { conId, qId } = confirmDeleteQuestion;
    setDraft((prev) => ({
      ...prev,
      consignas: prev.consignas.map((c) => {
        if (c.id !== conId || c.questions.length <= 1) return c;
        return { ...c, questions: c.questions.filter((q) => q.id !== qId) };
      }),
    }));
    setConfirmDeleteQuestion(null);
  };

  const updateComparativeTable = (
    conId: string,
    qId: string,
    updater: (tbl: ComparativeTableConfig) => ComparativeTableConfig
  ) => {
    if (isReadOnly) return;
    setDraft((prev) => ({
      ...prev,
      consignas: prev.consignas.map((c) => {
        if (c.id !== conId) return c;
        return {
          ...c,
          questions: c.questions.map((q) => {
            if (q.id !== qId) return q;
            const currentTbl = q.comparativeTable ?? createDefaultComparativeTable();
            return {
              ...q,
              comparativeTable: updater(currentTbl),
            };
          }),
        };
      }),
    }));
  };

  // Step 3 validation checks (using shared validateExamForPublish + summary rows)
  const detailedErrors = validateExamForPublish(draft);
  const validationChecks = [
    {
      id: 'title',
      label: 'Datos generales completos (título, curso y máximo de intentos ≥ 1)',
      ok:
        draft.title.trim().length > 0 &&
        draft.course.trim().length > 0 &&
        Number.isInteger(draft.maxAttempts) &&
        draft.maxAttempts >= 1,
    },
    {
      id: 'consignas',
      label: 'Todas las consignas tienen al menos una pregunta con enunciado',
      ok:
        draft.consignas.length > 0 &&
        draft.consignas.every(
          (c) =>
            c.questions.length > 0 &&
            c.questions.every((q) => q.prompt.trim().length > 0)
        ),
    },
    {
      id: 'closed',
      label: 'Las preguntas cerradas y tablas comparativas están completas y válidas',
      ok: draft.consignas.every((c) =>
        c.questions.every((q) => {
          if (q.type === 'opcion_multiple') {
            const opts = q.options ?? [];
            const correctCount = opts.filter((o) => o.isCorrect).length;
            return (
              opts.length >= 2 &&
              opts.every((o) => o.label.trim().length > 0) &&
              correctCount >= 1 &&
              (q.allowMultiple || correctCount === 1)
            );
          }
          if (q.type === 'verdadero_falso') {
            return typeof q.correctBoolean === 'boolean';
          }
          if (q.type === 'cuadro_comparativo') {
            const tbl = q.comparativeTable;
            return (
              !!tbl &&
              tbl.columns.length > 0 &&
              tbl.rows.length > 0 &&
              tbl.columns.every((col) => col.title.trim().length > 0) &&
              tbl.rows.every((row) => row.criterion.trim().length > 0)
            );
          }
          return true;
        })
      ),
    },
    {
      id: 'images',
      label: 'Las imágenes adjuntas están en Firebase Storage y tienen texto alternativo',
      ok: draft.consignas.every(
        (c) =>
          (!c.image ||
            (!c.image.url.startsWith('data:image/') &&
              c.image.alt.trim().length > 0)) &&
          c.questions.every(
            (q) =>
              !q.image ||
              (!q.image.url.startsWith('data:image/') &&
                q.image.alt.trim().length > 0)
          )
      ),
    },
  ];
  const canPublish = detailedErrors.length === 0 && !isReadOnly;

  const handlePublish = async () => {
    if (!firebaseUser || !canPublish) return;
    setStatusFeedback(null);
    setPublishing(true);
    try {
      const saved = await publishExam(draft, firebaseUser);
      const isNew = draft.id.startsWith('exam-nuevo-');
      setDraft((prev) => ({
        ...prev,
        id: saved.examId,
        slug: saved.slug,
        ownerId: prev.ownerId ?? firebaseUser.uid,
        schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
        status: 'publicada',
        updatedAt: 'Publicada recién en Firestore',
      }));
      showSuccess(
        'Evaluación publicada en Firestore. El enlace estudiantil ya está activo sin exponer respuestas modelo.'
      );
      if (isNew) {
        navigate(`/docente/editor/${saved.examId}`, { replace: true });
      }
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : 'No se pudo publicar la evaluación en Firestore.'
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleCopyPublishedUrl = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/e/${draft.slug}`
      );
    } catch {
      // Silencio si el portapapeles no está disponible
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDuplicateFromReadOnly = async () => {
    if (!firebaseUser) return;
    setDuplicating(true);
    try {
      const newId = await duplicateExamInFirestore(
        draft,
        duplicateCourse || draft.course,
        firebaseUser
      );
      setShowDuplicateModal(false);
      navigate(`/docente/editor/${newId}`);
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : 'No se pudo duplicar la evaluación.'
      );
    } finally {
      setDuplicating(false);
    }
  };

  const handleCloseExam = async () => {
    setClosingExam(true);
    try {
      await closeExamInFirestore(draft);
      setDraft((prev) => ({ ...prev, status: 'cerrada' }));
      setShowCloseModal(false);
      showSuccess('Evaluación cerrada. Ya no admite nuevas entregas estudiantiles.');
    } catch (err) {
      showError(
        err instanceof Error ? err.message : 'No se pudo cerrar la evaluación.'
      );
    } finally {
      setClosingExam(false);
    }
  };

  if (loadingExam) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-10 text-center space-y-2">
        <p className="font-display text-base font-semibold text-[#0F1E36]">
          Cargando evaluación desde Cloud Firestore...
        </p>
        <p className="text-xs text-slate-500">
          Recuperando consignas, preguntas y configuración.
        </p>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-xl font-bold text-[#0F1E36]">
          Evaluación no encontrada
        </h1>
        <p className="text-sm text-slate-600">
          No encontramos este borrador o no tenés permisos para abrirlo.
        </p>
        <Link
          to="/docente/evaluaciones"
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0F1E36] hover:bg-slate-50"
        >
          Volver a Mis evaluaciones
        </Link>
      </section>
    );
  }

  const safePreviewIdx = Math.min(
    previewStepIdx,
    Math.max(0, draft.consignas.length - 1)
  );
  const previewConsigna = draft.consignas[safePreviewIdx];

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Top Actions matching Mockup 3 */}
      <div className="space-y-3">
        <Link
          to="/docente/evaluaciones"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0F1E36]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Mis evaluaciones</span>
        </Link>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36] text-balance">
                {examId && examId !== 'nuevo'
                  ? 'Editar evaluación'
                  : 'Crear evaluación'}
              </h1>
              <StatusBadge status={draft.status} />
            </div>
            {(draft.title || draft.course) && (
              <p className="text-sm text-slate-600 truncate">
                {draft.title || 'Sin título'} · {draft.course || 'Sin curso'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setPreviewStepIdx(0);
                setStep(3);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap"
            >
              <Eye className="h-4 w-4 text-slate-600" aria-hidden="true" />
              <span>Vista previa</span>
            </button>

            {!isReadOnly && (
              <button
                type="button"
                disabled={saving || publishing}
                onClick={() => void handleSaveDraft()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <Save className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span>{saving ? 'Guardando...' : 'Guardar borrador'}</span>
              </button>
            )}

            {!isReadOnly ? (
              <button
                type="button"
                onClick={() => {
                  setPreviewStepIdx(0);
                  setStep(3);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Publicar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDuplicateCourse(draft.course);
                  setShowDuplicateModal(true);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Duplicar para editar</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Immutability notice when published with submissions or closed */}
      {isReadOnly && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5">
            <Lock
              className="h-5 w-5 shrink-0 mt-0.5 text-amber-700"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold">
                {isClosed
                  ? 'Evaluación cerrada (solo lectura)'
                  : `Evaluación publicada con ${draft.submissionsCount} entrega(s) registrada(s)`}
              </p>
              <p className="text-xs text-amber-900 mt-0.5">
                Para resguardar la integridad de las respuestas estudiantiles, no
                se permiten modificaciones retroactivas. Podés duplicarla como un
                nuevo borrador.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {draft.status === 'publicada' && (
              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                className="inline-flex h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-950 hover:bg-amber-100/60"
              >
                Cerrar evaluación
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stepper matching Mockup 3 */}
      <nav aria-label="Pasos de creación" className="py-1">
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          {(
            [
              { num: 1, label: '1. Datos generales' },
              { num: 2, label: '2. Consignas' },
              { num: 3, label: '3. Vista previa y publicación' },
            ] as const
          ).map((item, idx) => {
            const isCurrent = step === item.num;
            const isDone = step > item.num;
            return (
              <li key={item.num} className="flex items-center gap-3 flex-1">
                <button
                  type="button"
                  onClick={() => setStep(item.num)}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isCurrent
                      ? 'border-[#B8D0EC] bg-[#E8F1FC] text-[#0F1E36] font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isCurrent
                        ? 'text-[var(--brand-on-primary)]'
                        : isDone
                          ? 'border border-slate-300 bg-white text-slate-700'
                          : 'border border-slate-300 bg-white text-slate-600'
                    }`}
                    style={
                      isCurrent
                        ? { backgroundColor: 'var(--brand-primary)' }
                        : undefined
                    }
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : item.num}
                  </span>
                  <span>{item.label}</span>
                </button>
                {idx < 2 && (
                  <div
                    className="hidden h-px w-6 shrink-0 bg-slate-300 sm:block"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {statusFeedback && (
        <div
          role={statusFeedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
            statusFeedback.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <span>{statusFeedback.text}</span>
          <button
            type="button"
            onClick={() => setStatusFeedback(null)}
            aria-label="Cerrar mensaje"
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* PASO 1: DATOS GENERALES */}
      {step === 1 && (
        <section
          aria-labelledby="step1-title"
          className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
        >
          <div>
            <h2
              id="step1-title"
              className="font-display text-xl font-bold text-[#0F1E36]"
            >
              Datos generales de la evaluación
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Completá la información institucional que verán los estudiantes en
              la portada.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <label
                htmlFor="exam-title"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Título de la evaluación *
              </label>
              <input
                id="exam-title"
                type="text"
                disabled={isReadOnly}
                maxLength={180}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Ej. Evaluación de Historia · 2.º año"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label
                htmlFor="exam-subtitle"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Tipo o subtítulo
              </label>
              <input
                id="exam-subtitle"
                type="text"
                disabled={isReadOnly}
                maxLength={180}
                value={draft.subtitle}
                onChange={(e) =>
                  setDraft({ ...draft, subtitle: e.target.value })
                }
                placeholder="Ej. Evaluación integradora · Unidad 2"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="exam-year"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Año
              </label>
              <input
                id="exam-year"
                type="text"
                disabled={isReadOnly}
                maxLength={60}
                value={draft.yearLabel}
                onChange={(e) =>
                  setDraft({ ...draft, yearLabel: e.target.value })
                }
                placeholder="Ej. 2.º año"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="exam-course"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Curso *
              </label>
              <input
                id="exam-course"
                type="text"
                disabled={isReadOnly}
                maxLength={60}
                value={draft.course}
                onChange={(e) => setDraft({ ...draft, course: e.target.value })}
                placeholder="Ej. 2.º A"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="exam-teachers"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Docente(s)
              </label>
              <input
                id="exam-teachers"
                type="text"
                disabled={isReadOnly}
                maxLength={160}
                value={draft.teachersText}
                onChange={(e) =>
                  setDraft({ ...draft, teachersText: e.target.value })
                }
                placeholder="Ej. Prof. Gómez"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="exam-attempts"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Cantidad máxima de intentos *
              </label>
              <input
                id="exam-attempts"
                type="number"
                disabled={isReadOnly}
                min={1}
                max={10}
                step={1}
                value={draft.maxAttempts}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setDraft({
                    ...draft,
                    maxAttempts: Number.isNaN(parsed)
                      ? 1
                      : Math.max(1, Math.min(10, parsed)),
                  });
                }}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-mono-tabular text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label
                htmlFor="exam-instructions"
                className="block text-sm font-medium text-[#0F1E36]"
              >
                Instrucciones iniciales
              </label>
              <textarea
                id="exam-instructions"
                rows={3}
                disabled={isReadOnly}
                maxLength={2000}
                value={draft.initialInstructions}
                onChange={(e) =>
                  setDraft({ ...draft, initialInstructions: e.target.value })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-[#FAFBFD] p-4">
                <input
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={draft.feedbackEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, feedbackEnabled: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
                />
                <div>
                  <span className="block text-sm font-semibold text-[#0F1E36]">
                    Habilitar retroalimentación al entregar
                  </span>
                  <span className="block text-xs text-slate-600 mt-0.5">
                    Si está activada, al finalizar se mostrará devolución solo
                    para las preguntas cerradas. Las abiertas y cuadros
                    comparativos quedan pendientes de corrección docente.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {!isReadOnly ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveDraft()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
              >
                <Save className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span>{saving ? 'Guardando...' : 'Guardar borrador'}</span>
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)]"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <span>Continuar a Consignas</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      )}

      {/* PASO 2: CONSIGNAS */}
      {step === 2 && (
        <div className="space-y-6">
          {draft.consignas.map((consigna, cIdx) => {
            const hasContextBox =
              consigna.contextBoxTitle !== undefined ||
              consigna.contextBoxText !== undefined;

            return (
              <section
                key={consigna.id}
                aria-label={`Consigna ${cIdx + 1}`}
                className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
              >
                {/* Consigna Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <h2 className="font-display text-lg font-bold text-[#0F1E36]">
                    Consigna {cIdx + 1}
                  </h2>
                  {!isReadOnly && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMoveConsigna(cIdx, -1)}
                        disabled={cIdx === 0}
                        aria-label={`Subir consigna ${cIdx + 1}`}
                        title="Subir consigna"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveConsigna(cIdx, 1)}
                        disabled={cIdx === draft.consignas.length - 1}
                        aria-label={`Bajar consigna ${cIdx + 1}`}
                        title="Bajar consigna"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicateConsigna(cIdx)}
                        aria-label={`Duplicar consigna ${cIdx + 1}`}
                        title="Duplicar consigna"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Duplicar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteConsignaId(consigna.id)}
                        disabled={draft.consignas.length <= 1}
                        aria-label={`Eliminar consigna ${cIdx + 1}`}
                        title="Eliminar consigna"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Editable Title, Instructions, Context Box & Consigna Image */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label
                      htmlFor={`con-title-${consigna.id}`}
                      className="text-xs font-medium text-slate-500"
                    >
                      Título de la consigna
                    </label>
                    <input
                      id={`con-title-${consigna.id}`}
                      type="text"
                      disabled={isReadOnly}
                      maxLength={180}
                      value={consigna.title}
                      onChange={(e) =>
                        handleUpdateConsigna(consigna.id, {
                          title: e.target.value,
                        })
                      }
                      placeholder="Ej. Del voto cantado a la ciudadanía activa"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-display text-base sm:text-lg font-bold text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor={`con-inst-${consigna.id}`}
                      className="text-xs font-medium text-slate-500"
                    >
                      Texto introductorio / indicación para el estudiante
                    </label>
                    <textarea
                      id={`con-inst-${consigna.id}`}
                      rows={2}
                      disabled={isReadOnly}
                      maxLength={2000}
                      value={consigna.instructions}
                      onChange={(e) =>
                        handleUpdateConsigna(consigna.id, {
                          instructions: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-[#FAFBFD] px-3 py-2 text-sm text-slate-700 focus:border-[var(--brand-primary)] focus:bg-white focus:outline-none disabled:bg-slate-50"
                    />
                  </div>

                  {/* Optional Context Box (e.g., Caso histórico / Fuente) */}
                  {!hasContextBox ? (
                    !isReadOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateConsigna(consigna.id, {
                            contextBoxTitle: 'Caso o fuente de lectura',
                            contextBoxText: '',
                          })
                        }
                        className="text-xs font-semibold hover:underline"
                        style={{ color: 'var(--brand-primary)' }}
                      >
                        + Agregar recuadro de texto / caso de lectura (opcional)
                      </button>
                    )
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-[#F4F7FB] p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">
                          Recuadro de lectura / caso contextual
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateConsigna(consigna.id, {
                                contextBoxTitle: undefined,
                                contextBoxText: undefined,
                              })
                            }
                            className="text-xs font-medium text-rose-700 hover:underline"
                          >
                            Quitar recuadro
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        disabled={isReadOnly}
                        maxLength={180}
                        value={consigna.contextBoxTitle ?? ''}
                        onChange={(e) =>
                          handleUpdateConsigna(consigna.id, {
                            contextBoxTitle: e.target.value,
                          })
                        }
                        placeholder="Título del caso (ej. Caso 1 · Año 1908)"
                        aria-label="Título del recuadro de lectura"
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0F1E36]"
                      />
                      <textarea
                        rows={3}
                        disabled={isReadOnly}
                        maxLength={4000}
                        value={consigna.contextBoxText ?? ''}
                        onChange={(e) =>
                          handleUpdateConsigna(consigna.id, {
                            contextBoxText: e.target.value,
                          })
                        }
                        placeholder="Texto fuente o situación para analizar..."
                        aria-label="Contenido del recuadro de lectura"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F1E36]"
                      />
                    </div>
                  )}

                  {/* Consigna Image via Firebase Storage */}
                  <ImageAttachmentField
                    image={consigna.image}
                    ownerId={uploaderUid}
                    examId={storageExamFolderId}
                    label="Adjuntar imagen opcional a la consigna"
                    disabled={isReadOnly}
                    onChange={(nextImg) =>
                      handleUpdateConsigna(consigna.id, { image: nextImg })
                    }
                  />
                </div>

                {/* Questions inside this Consigna */}
                <div className="space-y-4">
                  {consigna.questions.map((question, qIdx) => {
                    const showModel = !!expandedModelIds[question.id];
                    const isLegacyType =
                      question.type === 'relacionar' ||
                      question.type === 'clasificar';

                    return (
                      <div
                        key={question.id}
                        className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4"
                      >
                        {/* Question Header: Label / Type / Points */}
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[200px]">
                            <input
                              type="text"
                              disabled={isReadOnly}
                              value={question.label ?? `Pregunta ${qIdx + 1}`}
                              onChange={(e) =>
                                handleUpdateQuestion(consigna.id, question.id, {
                                  label: e.target.value,
                                })
                              }
                              aria-label="Subtítulo o caso de la pregunta"
                              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 font-display text-sm font-bold text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
                            />

                            <select
                              disabled={isReadOnly}
                              value={question.type}
                              onChange={(e) =>
                                handleUpdateQuestion(consigna.id, question.id, {
                                  type: e.target.value as QuestionType,
                                })
                              }
                              aria-label="Tipo de pregunta"
                              className="h-9 rounded-lg border border-slate-200 bg-[#FAFBFD] px-2.5 text-xs font-medium text-slate-700 focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
                            >
                              {EDITOR_QUESTION_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                              {isLegacyType && (
                                <option value={question.type}>
                                  {LEGACY_TYPE_LABELS[question.type]}
                                </option>
                              )}
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 rounded-full bg-[#E8F0FE] px-3 py-1">
                              <input
                                type="number"
                                disabled={isReadOnly}
                                step="0.05"
                                min="0"
                                value={question.points ?? ''}
                                placeholder="—"
                                onChange={(e) =>
                                  handleUpdateQuestion(
                                    consigna.id,
                                    question.id,
                                    {
                                      points:
                                        e.target.value === ''
                                          ? null
                                          : Math.max(0, Number(e.target.value)),
                                    }
                                  )
                                }
                                aria-label="Puntaje de la pregunta"
                                className="w-12 bg-transparent text-right text-xs font-semibold font-mono-tabular text-[#0B3B70] focus:outline-none"
                              />
                              <span className="text-xs font-semibold text-[#0B3B70]">
                                pts
                              </span>
                            </div>

                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDeleteQuestion({
                                    conId: consigna.id,
                                    qId: question.id,
                                  })
                                }
                                disabled={consigna.questions.length <= 1}
                                aria-label={`Eliminar pregunta ${qIdx + 1}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Question Prompt */}
                        <div className="space-y-1">
                          <label
                            htmlFor={`q-prompt-${question.id}`}
                            className="text-xs font-medium text-slate-500"
                          >
                            Enunciado de la pregunta *
                          </label>
                          <textarea
                            id={`q-prompt-${question.id}`}
                            rows={2}
                            disabled={isReadOnly}
                            value={question.prompt}
                            onChange={(e) =>
                              handleUpdateQuestion(consigna.id, question.id, {
                                prompt: e.target.value,
                              })
                            }
                            placeholder="Escribí el enunciado claro de la pregunta..."
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-50"
                          />
                        </div>

                        {/* Optional Question Image via Firebase Storage */}
                        <ImageAttachmentField
                          image={question.image}
                          ownerId={uploaderUid}
                          examId={storageExamFolderId}
                          label="Adjuntar imagen opcional a esta pregunta"
                          disabled={isReadOnly}
                          onChange={(nextImg) =>
                            handleUpdateQuestion(consigna.id, question.id, {
                              image: nextImg,
                            })
                          }
                        />

                        {/* TIPO 1: ABIERTA */}
                        {question.type === 'abierta' && (
                          <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200 bg-[#FAFBFD] px-3.5 py-3 text-sm text-slate-400">
                              Respuesta escrita del estudiante (se renderiza con SurveyJS MIT)
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleModelAnswer(question.id)}
                              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-[#F3F5F8] px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-200/60"
                            >
                              <span className="flex items-center gap-2">
                                <GraduationCap
                                  className="h-4 w-4 text-slate-600"
                                  aria-hidden="true"
                                />
                                <span>
                                  Respuesta modelo para corrección (privada)
                                </span>
                              </span>
                              <span className="text-xs text-slate-500">
                                {showModel ? 'Ocultar' : 'Editar'}
                              </span>
                            </button>

                            {showModel && (
                              <textarea
                                rows={2}
                                disabled={isReadOnly}
                                value={question.modelAnswer ?? ''}
                                onChange={(e) =>
                                  handleUpdateQuestion(
                                    consigna.id,
                                    question.id,
                                    { modelAnswer: e.target.value }
                                  )
                                }
                                placeholder="Criterios o respuesta esperada (nunca se publica a estudiantes)..."
                                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-[#0F1E36] disabled:bg-slate-50"
                              />
                            )}
                          </div>
                        )}

                        {/* TIPO 2: OPCIÓN MÚLTIPLE */}
                        {question.type === 'opcion_multiple' && (
                          <div className="space-y-3 rounded-lg border border-slate-200 bg-[#FAFBFD] p-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700">
                                Opciones y clave privada de corrección
                              </span>
                              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-[#0F1E36]">
                                <input
                                  type="checkbox"
                                  disabled={isReadOnly}
                                  checked={!!question.allowMultiple}
                                  onChange={(e) => {
                                    const nextAllow = e.target.checked;
                                    let nextOpts = question.options ?? [];
                                    if (!nextAllow) {
                                      let foundFirst = false;
                                      nextOpts = nextOpts.map((o) => {
                                        if (o.isCorrect && !foundFirst) {
                                          foundFirst = true;
                                          return o;
                                        }
                                        return { ...o, isCorrect: false };
                                      });
                                    }
                                    handleUpdateQuestion(
                                      consigna.id,
                                      question.id,
                                      {
                                        allowMultiple: nextAllow,
                                        options: nextOpts,
                                      }
                                    );
                                  }}
                                  className="h-4 w-4 accent-[var(--brand-primary)]"
                                />
                                <span>Permitir varias respuestas correctas</span>
                              </label>
                            </div>

                            <div className="space-y-2">
                              {(question.options ?? []).map((opt, oIdx) => (
                                <div
                                  key={opt.id}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type={
                                      question.allowMultiple
                                        ? 'checkbox'
                                        : 'radio'
                                    }
                                    disabled={isReadOnly}
                                    name={`correct-${question.id}`}
                                    checked={!!opt.isCorrect}
                                    onChange={(e) => {
                                      const nextOpts = (
                                        question.options ?? []
                                      ).map((o) => {
                                        if (question.allowMultiple) {
                                          return o.id === opt.id
                                            ? {
                                                ...o,
                                                isCorrect: e.target.checked,
                                              }
                                            : o;
                                        }
                                        return {
                                          ...o,
                                          isCorrect: o.id === opt.id,
                                        };
                                      });
                                      handleUpdateQuestion(
                                        consigna.id,
                                        question.id,
                                        { options: nextOpts }
                                      );
                                    }}
                                    aria-label={`Marcar opción ${oIdx + 1} como correcta`}
                                    className="h-4 w-4 accent-[var(--brand-primary)]"
                                  />
                                  <input
                                    type="text"
                                    disabled={isReadOnly}
                                    value={opt.label}
                                    onChange={(e) => {
                                      const nextOpts = (
                                        question.options ?? []
                                      ).map((o) =>
                                        o.id === opt.id
                                          ? { ...o, label: e.target.value }
                                          : o
                                      );
                                      handleUpdateQuestion(
                                        consigna.id,
                                        question.id,
                                        { options: nextOpts }
                                      );
                                    }}
                                    placeholder={`Texto de opción ${oIdx + 1}`}
                                    className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F1E36] disabled:bg-slate-50"
                                  />
                                  {!isReadOnly &&
                                    (question.options?.length ?? 0) > 2 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleUpdateQuestion(
                                            consigna.id,
                                            question.id,
                                            {
                                              options: (
                                                question.options ?? []
                                              ).filter((o) => o.id !== opt.id),
                                            }
                                          )
                                        }
                                        aria-label={`Quitar opción ${oIdx + 1}`}
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                </div>
                              ))}
                            </div>

                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateQuestion(
                                    consigna.id,
                                    question.id,
                                    {
                                      options: [
                                        ...(question.options ?? []),
                                        {
                                          id: makeUid('opt'),
                                          label: `Opción ${(question.options?.length ?? 0) + 1}`,
                                          isCorrect: false,
                                        },
                                      ],
                                    }
                                  )
                                }
                                className="text-xs font-semibold hover:underline"
                                style={{ color: 'var(--brand-primary)' }}
                              >
                                + Agregar opción
                              </button>
                            )}
                          </div>
                        )}

                        {/* TIPO 3: VERDADERO / FALSO */}
                        {question.type === 'verdadero_falso' && (
                          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-[#FAFBFD] px-3.5 py-2.5 text-sm">
                            <span className="text-xs font-semibold text-slate-600">
                              Respuesta correcta (privada):
                            </span>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                disabled={isReadOnly}
                                name={`vf-${question.id}`}
                                checked={question.correctBoolean === true}
                                onChange={() =>
                                  handleUpdateQuestion(
                                    consigna.id,
                                    question.id,
                                    { correctBoolean: true }
                                  )
                                }
                                className="accent-[var(--brand-primary)]"
                              />
                              <span>Verdadero</span>
                            </label>
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="radio"
                                disabled={isReadOnly}
                                name={`vf-${question.id}`}
                                checked={question.correctBoolean === false}
                                onChange={() =>
                                  handleUpdateQuestion(
                                    consigna.id,
                                    question.id,
                                    { correctBoolean: false }
                                  )
                                }
                                className="accent-[var(--brand-primary)]"
                              />
                              <span>Falso</span>
                            </label>
                          </div>
                        )}

                        {/* TIPO 4: CUADRO COMPARATIVO */}
                        {question.type === 'cuadro_comparativo' &&
                          question.comparativeTable && (
                            <div className="space-y-4 rounded-xl border border-slate-200 bg-[#FAFBFD] p-4">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="block text-xs font-semibold text-slate-700">
                                    Encabezado de columna de criterios
                                  </label>
                                  <input
                                    type="text"
                                    disabled={isReadOnly}
                                    value={
                                      question.comparativeTable.criteriaHeader
                                    }
                                    onChange={(e) =>
                                      updateComparativeTable(
                                        consigna.id,
                                        question.id,
                                        (tbl) => ({
                                          ...tbl,
                                          criteriaHeader: e.target.value,
                                        })
                                      )
                                    }
                                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] disabled:bg-slate-50"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="block text-xs font-semibold text-slate-700">
                                    Modo de puntuación del cuadro
                                  </label>
                                  <select
                                    disabled={isReadOnly}
                                    value={question.comparativeTable.scoringMode}
                                    onChange={(e) =>
                                      updateComparativeTable(
                                        consigna.id,
                                        question.id,
                                        (tbl) => ({
                                          ...tbl,
                                          scoringMode:
                                            e.target.value === 'por_celda'
                                              ? 'por_celda'
                                              : 'por_fila',
                                        })
                                      )
                                    }
                                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] disabled:bg-slate-50"
                                  >
                                    <option value="por_fila">Por fila</option>
                                    <option value="por_celda">Por celda</option>
                                  </select>
                                </div>
                              </div>

                              {/* Columnas */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-700">
                                    Columnas del cuadro
                                  </span>
                                  {!isReadOnly && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateComparativeTable(
                                          consigna.id,
                                          question.id,
                                          (tbl) => ({
                                            ...tbl,
                                            columns: [
                                              ...tbl.columns,
                                              {
                                                id: makeUid('col'),
                                                title: `Columna ${tbl.columns.length + 1}`,
                                              },
                                            ],
                                          })
                                        )
                                      }
                                      className="text-xs font-semibold hover:underline"
                                      style={{ color: 'var(--brand-primary)' }}
                                    >
                                      + Agregar columna
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {question.comparativeTable.columns.map(
                                    (col, colIdx) => (
                                      <div
                                        key={col.id}
                                        className="flex items-center gap-2"
                                      >
                                        <input
                                          type="text"
                                          disabled={isReadOnly}
                                          value={col.title}
                                          onChange={(e) =>
                                            updateComparativeTable(
                                              consigna.id,
                                              question.id,
                                              (tbl) => ({
                                                ...tbl,
                                                columns: tbl.columns.map((c) =>
                                                  c.id === col.id
                                                    ? {
                                                        ...c,
                                                        title: e.target.value,
                                                      }
                                                    : c
                                                ),
                                              })
                                            )
                                          }
                                          aria-label={`Título de columna ${colIdx + 1}`}
                                          placeholder={`Columna ${colIdx + 1}`}
                                          className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] disabled:bg-slate-50"
                                        />
                                        {!isReadOnly &&
                                          question.comparativeTable!.columns
                                            .length > 1 && (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateComparativeTable(
                                                  consigna.id,
                                                  question.id,
                                                  (tbl) => ({
                                                    ...tbl,
                                                    columns: tbl.columns.filter(
                                                      (c) => c.id !== col.id
                                                    ),
                                                  })
                                                )
                                              }
                                              aria-label={`Eliminar columna ${col.title}`}
                                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                          )}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>

                              {/* Filas fijas + respuestas modelo privadas por celda */}
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold text-slate-700">
                                    Filas fijas (criterios) y respuestas modelo
                                    privadas
                                  </span>
                                  {!isReadOnly && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateComparativeTable(
                                          consigna.id,
                                          question.id,
                                          (tbl) => ({
                                            ...tbl,
                                            rows: [
                                              ...tbl.rows,
                                              {
                                                id: makeUid('row'),
                                                criterion: `Criterio ${tbl.rows.length + 1}`,
                                                points: 1,
                                                modelAnswers: {},
                                              },
                                            ],
                                          })
                                        )
                                      }
                                      className="text-xs font-semibold hover:underline"
                                      style={{ color: 'var(--brand-primary)' }}
                                    >
                                      + Agregar fila
                                    </button>
                                  )}
                                </div>

                                <div className="space-y-3">
                                  {question.comparativeTable.rows.map(
                                    (row, rIdx) => (
                                      <div
                                        key={row.id}
                                        className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <input
                                            type="text"
                                            disabled={isReadOnly}
                                            value={row.criterion}
                                            onChange={(e) =>
                                              updateComparativeTable(
                                                consigna.id,
                                                question.id,
                                                (tbl) => ({
                                                  ...tbl,
                                                  rows: tbl.rows.map((r) =>
                                                    r.id === row.id
                                                      ? {
                                                          ...r,
                                                          criterion:
                                                            e.target.value,
                                                        }
                                                      : r
                                                  ),
                                                })
                                              )
                                            }
                                            aria-label={`Criterio de fila ${rIdx + 1}`}
                                            placeholder={`Criterio ${rIdx + 1}`}
                                            className="h-9 flex-1 min-w-[180px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-[#0F1E36] disabled:bg-slate-50"
                                          />
                                          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-[#FAFBFD] px-2.5 h-9">
                                            <input
                                              type="number"
                                              disabled={isReadOnly}
                                              step="0.25"
                                              min="0"
                                              value={row.points ?? ''}
                                              onChange={(e) =>
                                                updateComparativeTable(
                                                  consigna.id,
                                                  question.id,
                                                  (tbl) => ({
                                                    ...tbl,
                                                    rows: tbl.rows.map((r) =>
                                                      r.id === row.id
                                                        ? {
                                                            ...r,
                                                            points:
                                                              e.target.value ===
                                                              ''
                                                                ? undefined
                                                                : Math.max(
                                                                    0,
                                                                    Number(
                                                                      e.target
                                                                        .value
                                                                    )
                                                                  ),
                                                          }
                                                        : r
                                                    ),
                                                  })
                                                )
                                              }
                                              aria-label={`Puntaje fila ${rIdx + 1}`}
                                              className="w-12 bg-transparent text-right text-xs font-mono-tabular text-[#0F1E36]"
                                            />
                                            <span className="text-[11px] text-slate-500">
                                              pts
                                            </span>
                                          </div>
                                          {!isReadOnly &&
                                            question.comparativeTable!.rows
                                              .length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  updateComparativeTable(
                                                    consigna.id,
                                                    question.id,
                                                    (tbl) => ({
                                                      ...tbl,
                                                      rows: tbl.rows.filter(
                                                        (r) => r.id !== row.id
                                                      ),
                                                    })
                                                  )
                                                }
                                                aria-label={`Eliminar fila ${row.criterion}`}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                          {question.comparativeTable!.columns.map(
                                            (col) => (
                                              <div
                                                key={col.id}
                                                className="space-y-1"
                                              >
                                                <label className="block text-[11px] font-medium text-slate-500">
                                                  Modelo privado · {col.title}
                                                </label>
                                                <input
                                                  type="text"
                                                  disabled={isReadOnly}
                                                  value={
                                                    row.modelAnswers?.[
                                                      col.id
                                                    ] ?? ''
                                                  }
                                                  onChange={(e) =>
                                                    updateComparativeTable(
                                                      consigna.id,
                                                      question.id,
                                                      (tbl) => ({
                                                        ...tbl,
                                                        rows: tbl.rows.map(
                                                          (r) =>
                                                            r.id === row.id
                                                              ? {
                                                                  ...r,
                                                                  modelAnswers:
                                                                    {
                                                                      ...(r.modelAnswers ??
                                                                        {}),
                                                                      [col.id]:
                                                                        e.target
                                                                          .value,
                                                                    },
                                                                }
                                                              : r
                                                        ),
                                                      })
                                                    )
                                                  }
                                                  placeholder="Respuesta esperada opcional..."
                                                  className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-[#0F1E36] disabled:bg-slate-50"
                                                />
                                              </div>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2 pt-1">
                                <p className="text-xs font-medium text-slate-600">
                                  Vista previa adaptativa (escritorio en tabla ·
                                  móvil en tarjetas):
                                </p>
                                <ComparativeTableView
                                  config={question.comparativeTable}
                                  mode="teacher_preview"
                                  showModelAnswers
                                />
                              </div>
                            </div>
                          )}

                        {isLegacyType && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                            Tipo heredado ({question.type}). Podés conservarlo o
                            cambiarlo a uno de los 4 tipos principales.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add question dashed button matching Mockup 3 */}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleAddQuestion(consigna.id)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>Agregar otra pregunta</span>
                  </button>
                )}
              </section>
            );
          })}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {!isReadOnly ? (
              <button
                type="button"
                onClick={handleAddConsigna}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0F1E36] hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Agregar otra consigna</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              {!isReadOnly && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveDraft()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
                >
                  <Save className="h-4 w-4 text-slate-600" />
                  <span>{saving ? 'Guardando...' : 'Guardar borrador'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setPreviewStepIdx(0);
                  setStep(3);
                }}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)]"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <span>Vista previa y publicar</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASO 3: VISTA PREVIA Y PUBLICACIÓN */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Interactive Student Preview (without model answers) */}
          <section
            aria-labelledby="preview-heading"
            className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8 space-y-6"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2
                  id="preview-heading"
                  className="font-display text-lg font-bold text-[#0F1E36]"
                >
                  Vista previa estudiantil interactiva
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Así visualizan los estudiantes las consignas (las respuestas
                  modelo y claves privadas nunca se muestran acá).
                </p>
              </div>
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-[#F4F7FB] px-2.5 py-1 text-xs font-medium text-slate-700 self-start">
                Modo prueba sin guardado
              </span>
            </div>

            {previewConsigna && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center rounded-full bg-[#E3EEFA] px-3 py-1 text-xs font-bold text-[#0B3B70]">
                      Consigna {safePreviewIdx + 1} de {draft.consignas.length}
                    </span>
                    <h3 className="font-display text-xl font-bold text-[#0F1E36]">
                      {previewConsigna.title || `Consigna ${safePreviewIdx + 1}`}
                    </h3>
                  </div>
                </div>

                {previewConsigna.instructions && (
                  <p className="text-sm leading-relaxed text-slate-600">
                    {previewConsigna.instructions}
                  </p>
                )}

                {previewConsigna.image && (
                  <figure className="overflow-hidden rounded-xl border border-slate-200 bg-[#FAFBFD]">
                    <img
                      src={previewConsigna.image.url}
                      alt={previewConsigna.image.alt || previewConsigna.title}
                      referrerPolicy="no-referrer"
                      className="max-h-72 w-full object-contain"
                    />
                  </figure>
                )}

                {previewConsigna.contextBoxText && (
                  <div className="rounded-xl border border-slate-200 bg-[#F4F7FB] p-4 space-y-1">
                    {previewConsigna.contextBoxTitle && (
                      <h4 className="font-display text-sm font-bold text-[#0F1E36]">
                        {previewConsigna.contextBoxTitle}
                      </h4>
                    )}
                    <p className="text-sm text-slate-700">
                      {previewConsigna.contextBoxText}
                    </p>
                  </div>
                )}

                <div className="space-y-6">
                  {previewConsigna.questions.map((q) => (
                    <div key={q.id} className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        {q.label && (
                          <span className="text-xs font-semibold text-slate-500">
                            {q.label}
                          </span>
                        )}
                        {q.points !== null && (
                          <span className="text-xs font-mono-tabular text-slate-500">
                            {q.points.toFixed(2).replace('.', ',')} pts
                          </span>
                        )}
                      </div>

                      {q.image && (
                        <figure className="overflow-hidden rounded-xl border border-slate-200 bg-[#FAFBFD]">
                          <img
                            src={q.image.url}
                            alt={q.image.alt || q.prompt}
                            referrerPolicy="no-referrer"
                            className="max-h-64 w-full object-contain"
                          />
                        </figure>
                      )}

                      {(q.type === 'abierta' ||
                        q.type === 'opcion_multiple' ||
                        q.type === 'verdadero_falso') && (
                        <SurveyStandardQuestion
                          question={q}
                          value={previewAnswers[q.id]}
                          onChange={(nextVal) =>
                            setPreviewAnswers((prev) => ({
                              ...prev,
                              [q.id]: nextVal,
                            }))
                          }
                        />
                      )}

                      {q.type === 'cuadro_comparativo' &&
                        q.comparativeTable && (
                          <div className="space-y-2.5">
                            <p className="text-base font-bold text-[#0F1E36]">
                              {q.prompt || 'Cuadro comparativo'}
                            </p>
                            <ComparativeTableView
                              config={q.comparativeTable}
                              mode="student"
                              values={
                                previewAnswers[q.id]?.type ===
                                'cuadro_comparativo'
                                  ? (
                                      previewAnswers[q.id] as Extract<
                                        StudentAnswerValue,
                                        { type: 'cuadro_comparativo' }
                                      >
                                    ).cells
                                  : {}
                              }
                              onChangeCell={(rowId, colId, val) => {
                                const existing =
                                  previewAnswers[q.id]?.type ===
                                  'cuadro_comparativo'
                                    ? (
                                        previewAnswers[q.id] as Extract<
                                          StudentAnswerValue,
                                          { type: 'cuadro_comparativo' }
                                        >
                                      ).cells
                                    : {};
                                setPreviewAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: {
                                    type: 'cuadro_comparativo',
                                    cells: {
                                      ...existing,
                                      [rowId]: {
                                        ...(existing[rowId] ?? {}),
                                        [colId]: val,
                                      },
                                    },
                                  },
                                }));
                              }}
                            />
                          </div>
                        )}
                    </div>
                  ))}
                </div>

                {draft.consignas.length > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      disabled={safePreviewIdx === 0}
                      onClick={() =>
                        setPreviewStepIdx((p) => Math.max(0, p - 1))
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>Consigna anterior</span>
                    </button>
                    <button
                      type="button"
                      disabled={safePreviewIdx >= draft.consignas.length - 1}
                      onClick={() =>
                        setPreviewStepIdx((p) =>
                          Math.min(draft.consignas.length - 1, p + 1)
                        )
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <span>Siguiente consigna</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Validation & Publishing Panel */}
          <section
            aria-labelledby="step3-title"
            className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6"
          >
            <div>
              <h2
                id="step3-title"
                className="font-display text-xl font-bold text-[#0F1E36]"
              >
                Validación y publicación en Firestore
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Al publicar, se crea la versión pública en{' '}
                <code className="font-mono-tabular text-xs">examPublic</code>{' '}
                sin respuestas modelo ni soluciones.
              </p>
            </div>

            <div className="space-y-2.5">
              {validationChecks.map((check) => (
                <div
                  key={check.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                    check.ok
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  {check.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
                  )}
                  <span>{check.label}</span>
                </div>
              ))}
            </div>

            {detailedErrors.length > 0 && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1.5 text-xs text-amber-950"
              >
                <p className="font-semibold">
                  Corregí estos puntos antes de publicar:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  {detailedErrors.slice(0, 6).map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                Enlace público para estudiantes
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/e/${draft.slug}`}
                  className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono-tabular text-slate-700"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyPublishedUrl()}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap"
                >
                  {copiedLink ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-700" />
                      <span>Enlace copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar enlace</span>
                    </>
                  )}
                </button>
                {draft.status === 'publicada' && (
                  <button
                    type="button"
                    onClick={() => navigate(`/e/${draft.slug}`)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-[#0F1E36] hover:bg-slate-50 whitespace-nowrap"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Abrir vista estudiante</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Volver a Consignas
              </button>

              {!isReadOnly && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={saving || publishing}
                    onClick={() => void handleSaveDraft()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4 text-slate-600" />
                    <span>{saving ? 'Guardando...' : 'Guardar borrador'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canPublish || publishing || saving}
                    onClick={() => void handlePublish()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {publishing
                        ? 'Publicando...'
                        : draft.status === 'publicada'
                          ? 'Actualizar publicación'
                          : 'Publicar evaluación'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Modal confirmar eliminación de consigna */}
      {confirmDeleteConsignaId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-con-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="delete-con-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              ¿Eliminar esta consigna?
            </h3>
            <p className="text-sm text-slate-600">
              Se quitarán todas las preguntas incluidas dentro de esta consigna.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteConsignaId(null)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAndDeleteConsigna}
                className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
              >
                Eliminar consigna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación de pregunta */}
      {confirmDeleteQuestion && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-q-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="delete-q-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              ¿Eliminar esta pregunta?
            </h3>
            <p className="text-sm text-slate-600">
              Esta acción quitará la pregunta y su configuración del borrador.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteQuestion(null)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmAndDeleteQuestion}
                className="h-10 rounded-lg bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800"
              >
                Eliminar pregunta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal duplicar evaluación bloqueada */}
      {showDuplicateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dup-exam-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="dup-exam-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              Duplicar evaluación en nuevo borrador
            </h3>
            <p className="text-sm text-slate-600">
              Se copiarán las consignas y puntajes en un borrador nuevo con
              identidad propia y cero entregas.
            </p>
            <div className="space-y-1.5">
              <label
                htmlFor="dup-course-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Curso para la nueva copia
              </label>
              <input
                id="dup-course-input"
                type="text"
                value={duplicateCourse}
                onChange={(e) => setDuplicateCourse(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-[#0F1E36]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDuplicateModal(false)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={duplicating}
                onClick={() => void handleDuplicateFromReadOnly()}
                className="h-10 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {duplicating ? 'Duplicando...' : 'Crear borrador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar cierre de evaluación */}
      {showCloseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="close-exam-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <h3
              id="close-exam-title"
              className="font-display text-lg font-bold text-[#0F1E36]"
            >
              ¿Cerrar esta evaluación?
            </h3>
            <p className="text-sm text-slate-600">
              El enlace estudiantil dejará de recibir nuevas entregas. Podrás
              seguir viendo resultados y duplicar la evaluación cuando quieras.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={closingExam}
                onClick={() => void handleCloseExam()}
                className="h-10 rounded-lg bg-[#0F1E36] px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {closingExam ? 'Cerrando...' : 'Cerrar evaluación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
