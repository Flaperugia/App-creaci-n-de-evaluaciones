import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  ClosedFeedbackItem,
  ConsignaBlock,
  ExamDefinition,
  QuestionItem,
  StudentAnswerValue,
  StudentSessionDraft,
  SubmittedAttemptReceipt,
} from '../types/assessment';

export class StudentApiError extends Error {
  status: number;
  code?: string;
  attemptId?: string | null;

  constructor(
    message: string,
    status: number,
    code?: string,
    attemptId?: string | null
  ) {
    super(message);
    this.name = 'StudentApiError';
    this.status = status;
    this.code = code;
    this.attemptId = attemptId;
  }
}

export interface StartAttemptResponse {
  resumed: boolean;
  attemptsUsed: number;
  maxAttempts: number;
  examId: string;
  participantKey: string;
  participantName: string;
  draft: {
    idempotencyKey: string;
    currentStepIndex: number;
    answers: Record<string, StudentAnswerValue>;
    startedAt: string;
    lastSavedAt?: string;
  };
}

export interface ProgressLookupResponse {
  examId: string;
  attemptsUsed: number;
  maxAttempts: number;
  participantName: string;
  lastSubmittedAttemptId: string | null;
  draft: {
    idempotencyKey: string;
    currentStepIndex: number;
    answers: Record<string, StudentAnswerValue>;
    startedAt: string;
    lastSavedAt?: string;
  } | null;
}

export interface StoredLocalStudentDraft extends StudentSessionDraft {
  pendingCloudSync?: boolean;
  updatedAtMs?: number;
}

interface ClosedKeyEntry {
  type: 'opcion_multiple' | 'verdadero_falso';
  prompt?: string;
  points?: number | null;
  allowMultiple?: boolean;
  correctOptionIds?: string[];
  correctBoolean?: boolean;
}

const DRAFT_STORAGE_PREFIX = 'eval_student_draft_v1_';
const RECEIPT_STORAGE_PREFIX = 'eval_student_receipt_v1_';

function isValidId(id: string): boolean {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

function isValidSlug(slug: string): boolean {
  return (
    typeof slug === 'string' &&
    slug.length >= 3 &&
    slug.length <= 128 &&
    /^[a-z0-9-]+$/.test(slug)
  );
}

export function normalizeParticipantName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// Fallback determinístico si crypto.subtle no está disponible en algún entorno HTTP de prueba
function fnv1aHexFallback(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const p3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}${p3}`;
}

export async function deriveParticipantKey(rawName: string): Promise<string> {
  const norm = normalizeParticipantName(rawName);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoded = new TextEncoder().encode(norm);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `p_${hex.slice(0, 24)}`;
  }
  return `p_${fnv1aHexFallback(norm)}`;
}

export function generateIdempotencyKey(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(12);
    globalThis.crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sub_${hex}`;
  }
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function formatFirestoreDateInfo(value: unknown): {
  iso: string;
  formatted: string;
} {
  const date = value instanceof Timestamp ? value.toDate() : new Date();
  return {
    iso: date.toISOString(),
    formatted: date.toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    }),
  };
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Defensa en profundidad: garantiza que ninguna lectura estudiantil incluya soluciones
export function stripSensitiveExamFields(
  consignas: ConsignaBlock[]
): ConsignaBlock[] {
  return (consignas ?? []).map((con) => ({
    ...con,
    questions: (con.questions ?? []).map((q) => {
      const clean = { ...q };
      delete clean.modelAnswer;
      delete clean.correctBoolean;
      if (clean.options) {
        clean.options = clean.options.map(({ id, label }) => ({ id, label }));
      }
      if (clean.classifyItems) {
        clean.classifyItems = clean.classifyItems.map(({ id, text }) => ({
          id,
          text,
          category: '',
        }));
      }
      if (clean.comparativeTable) {
        clean.comparativeTable = {
          ...clean.comparativeTable,
          rows: clean.comparativeTable.rows.map(({ id, criterion, points }) => ({
            id,
            criterion,
            ...(typeof points === 'number' ? { points } : {}),
          })),
        };
      }
      return clean;
    }),
  }));
}

function mapPublicExam(
  slug: string,
  d: Record<string, unknown>
): ExamDefinition {
  return {
    id: String(d.examId ?? slug),
    schemaVersion: typeof d.schemaVersion === 'number' ? d.schemaVersion : 1,
    slug: String(d.slug ?? slug),
    title: String(d.title ?? 'Evaluación'),
    subtitle: String(d.subtitle ?? ''),
    yearLabel: String(d.yearLabel ?? ''),
    course: String(d.course ?? ''),
    teachersText: String(d.teachersText ?? ''),
    ownerId: typeof d.ownerId === 'string' ? d.ownerId : undefined,
    ownerEmail: '',
    initialInstructions: String(d.initialInstructions ?? ''),
    maxAttempts: 1,
    feedbackEnabled: Boolean(d.feedbackEnabled),
    status: d.status === 'cerrada' ? 'cerrada' : 'publicada',
    updatedAt: '',
    submissionsCount: 0,
    consignas: stripSensitiveExamFields(
      Array.isArray(d.consignas) ? (d.consignas as ConsignaBlock[]) : []
    ),
  };
}

export function sanitizeAnswersPayload(
  raw: unknown
): Record<string, StudentAnswerValue> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean: Record<string, StudentAnswerValue> = {};
  for (const [qId, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!qId || qId.length > 128 || !val || typeof val !== 'object') continue;
    const item = val as Record<string, unknown>;
    if (item.type === 'abierta' && typeof item.text === 'string') {
      clean[qId] = { type: 'abierta', text: item.text.slice(0, 12000) };
    } else if (
      item.type === 'opcion_multiple' &&
      Array.isArray(item.selectedIds)
    ) {
      clean[qId] = {
        type: 'opcion_multiple',
        selectedIds: item.selectedIds.slice(0, 50).map(String),
      };
    } else if (
      item.type === 'verdadero_falso' &&
      (typeof item.value === 'boolean' || item.value === null)
    ) {
      clean[qId] = { type: 'verdadero_falso', value: item.value };
    } else if (
      item.type === 'cuadro_comparativo' &&
      item.cells &&
      typeof item.cells === 'object'
    ) {
      const cellsClean: Record<string, Record<string, string>> = {};
      for (const [rId, rowObj] of Object.entries(
        item.cells as Record<string, unknown>
      )) {
        if (!rowObj || typeof rowObj !== 'object') continue;
        cellsClean[rId] = {};
        for (const [cId, cellText] of Object.entries(
          rowObj as Record<string, unknown>
        )) {
          if (typeof cellText === 'string') {
            cellsClean[rId][cId] = cellText.slice(0, 4000);
          }
        }
      }
      clean[qId] = { type: 'cuadro_comparativo', cells: cellsClean };
    } else if (
      item.type === 'relacionar' &&
      item.mapping &&
      typeof item.mapping === 'object'
    ) {
      const mappingClean: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        item.mapping as Record<string, unknown>
      )) {
        if (typeof v === 'string') mappingClean[k] = v.slice(0, 500);
      }
      clean[qId] = { type: 'relacionar', mapping: mappingClean };
    } else if (
      item.type === 'clasificar' &&
      item.assignments &&
      typeof item.assignments === 'object'
    ) {
      const assignClean: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        item.assignments as Record<string, unknown>
      )) {
        if (typeof v === 'string') assignClean[k] = v.slice(0, 500);
      }
      clean[qId] = { type: 'clasificar', assignments: assignClean };
    }
  }
  return clean;
}

export function evaluateClosedQuestions(params: {
  exam: ExamDefinition;
  closedKeys: Record<string, ClosedKeyEntry>;
  answers: Record<string, StudentAnswerValue>;
}): {
  closedFeedback: ClosedFeedbackItem[];
  autoScore: number | null;
  maxAutoScore: number | null;
} {
  const closedFeedback: ClosedFeedbackItem[] = [];
  let autoScore = 0;
  let maxAutoScore = 0;
  let hasScoredClosed = false;

  for (const con of params.exam.consignas) {
    for (const q of con.questions) {
      if (q.type !== 'opcion_multiple' && q.type !== 'verdadero_falso') {
        continue;
      }
      const key = params.closedKeys[q.id];
      const ans = params.answers[q.id];
      const maxPts = typeof q.points === 'number' ? q.points : null;

      if (!key) {
        continue;
      }

      let isCorrect = false;
      let studentAnswerLabel = 'Sin responder';

      if (q.type === 'verdadero_falso') {
        const val = ans?.type === 'verdadero_falso' ? ans.value : null;
        if (val === true) studentAnswerLabel = 'Verdadero';
        else if (val === false) studentAnswerLabel = 'Falso';
        isCorrect = val !== null && val === Boolean(key.correctBoolean);
      } else if (q.type === 'opcion_multiple') {
        const selected = ans?.type === 'opcion_multiple' ? ans.selectedIds : [];
        if (selected.length > 0) {
          studentAnswerLabel = (q.options ?? [])
            .filter((o) => selected.includes(o.id))
            .map((o) => o.label)
            .join(', ');
        }
        const expectedSet = new Set(key.correctOptionIds ?? []);
        const selectedSet = new Set(selected);
        isCorrect =
          expectedSet.size > 0 &&
          expectedSet.size === selectedSet.size &&
          [...expectedSet].every((id) => selectedSet.has(id));
      }

      const pointsAwarded =
        maxPts !== null ? (isCorrect ? maxPts : 0) : null;
      if (maxPts !== null && pointsAwarded !== null) {
        hasScoredClosed = true;
        maxAutoScore += maxPts;
        autoScore += pointsAwarded;
      }

      closedFeedback.push({
        questionId: q.id,
        prompt: q.prompt,
        questionType: q.type,
        studentAnswerLabel: studentAnswerLabel || 'Sin responder',
        isCorrect,
        pointsAwarded,
        maxPoints: maxPts,
      });
    }
  }

  return {
    closedFeedback,
    autoScore: hasScoredClosed ? Number(autoScore.toFixed(2)) : null,
    maxAutoScore: hasScoredClosed ? Number(maxAutoScore.toFixed(2)) : null,
  };
}

function getFirebaseErrorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: unknown }).code ?? '');
  }
  return '';
}

function isNetworkLikeFirebaseError(err: unknown): boolean {
  const code = getFirebaseErrorCode(err);
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    code === 'unavailable' ||
    msg.includes('offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch')
  );
}

// 1. Obtener evaluación pública sin soluciones directamente desde Firestore
export async function fetchPublicExamFromBackend(
  slug: string
): Promise<ExamDefinition> {
  const cleanSlug = slug.trim();
  if (!isValidSlug(cleanSlug)) {
    throw new StudentApiError('Enlace de evaluación inválido.', 400);
  }

  try {
    const snap = await getDoc(doc(db, 'examPublic', cleanSlug));
    if (!snap.exists()) {
      throw new StudentApiError(
        'Evaluación no encontrada o aún no publicada.',
        404
      );
    }
    const data = snap.data();
    if (data.status !== 'publicada') {
      throw new StudentApiError(
        'Esta evaluación ya fue cerrada y no admite nuevas entregas.',
        410
      );
    }
    return mapPublicExam(cleanSlug, data);
  } catch (err) {
    if (err instanceof StudentApiError) throw err;
    const code = getFirebaseErrorCode(err);
    if (code === 'permission-denied') {
      throw new StudentApiError(
        'Esta evaluación ya fue cerrada y no admite nuevas entregas.',
        410
      );
    }
    if (isNetworkLikeFirebaseError(err)) {
      throw new StudentApiError(
        'No se pudo conectar con la base de datos. Verificá tu conexión e intentá nuevamente.',
        0,
        'NETWORK_ERROR'
      );
    }
    throw new StudentApiError(
      'No se pudo cargar la evaluación. Intentá nuevamente.',
      503
    );
  }
}

// 2. Iniciar o retomar el único intento del estudiante (sin consumirlo hasta el envío final)
export async function startStudentAttempt(
  slug: string,
  participantName: string
): Promise<StartAttemptResponse> {
  const cleanSlug = slug.trim();
  const rawName = participantName.trim();

  if (!isValidSlug(cleanSlug)) {
    throw new StudentApiError('Evaluación inválida.', 400);
  }
  if (rawName.length < 1 || rawName.length > 120) {
    throw new StudentApiError(
      'Ingresá tu nombre y apellido o código de participante (hasta 120 caracteres).',
      400
    );
  }

  const participantKey = await deriveParticipantKey(rawName);

  try {
    const pubSnap = await getDoc(doc(db, 'examPublic', cleanSlug));
    if (!pubSnap.exists()) {
      throw new StudentApiError(
        'Esta evaluación no está publicada o ya no existe.',
        404
      );
    }
    const pubData = pubSnap.data();
    if (pubData.status !== 'publicada') {
      throw new StudentApiError(
        'Esta evaluación fue cerrada y ya no admite nuevos intentos.',
        410
      );
    }

    const examId = String(pubData.examId);
    const examOwnerId = String(pubData.ownerId);
    const participantDocId = `${examId}__${participantKey}`;
    const participantRef = doc(db, 'examParticipants', participantDocId);

    const result = await runTransaction(db, async (tx) => {
      const pSnap = await tx.get(participantRef);

      if (pSnap.exists()) {
        const pData = pSnap.data();
        const attemptsUsed = Number(pData.attemptsUsed ?? 0);
        const lastSubmittedAttemptId =
          typeof pData.lastSubmittedAttemptId === 'string'
            ? pData.lastSubmittedAttemptId
            : null;

        if (attemptsUsed >= 1) {
          return {
            blocked: true as const,
            attemptsUsed,
            maxAttempts: 1,
            lastSubmittedAttemptId,
          };
        }

        const existingDraft =
          pData.activeDraft && typeof pData.activeDraft === 'object'
            ? (pData.activeDraft as Record<string, unknown>)
            : null;

        if (
          existingDraft &&
          typeof existingDraft.idempotencyKey === 'string' &&
          isValidId(existingDraft.idempotencyKey)
        ) {
          return {
            blocked: false as const,
            resumed: true,
            attemptsUsed: 0,
            maxAttempts: 1,
            examId,
            participantKey,
            participantName: rawName,
            draft: {
              idempotencyKey: existingDraft.idempotencyKey,
              currentStepIndex:
                typeof existingDraft.currentStepIndex === 'number'
                  ? existingDraft.currentStepIndex
                  : 0,
              answers: sanitizeAnswersPayload(existingDraft.answers),
              startedAt:
                typeof existingDraft.startedAt === 'string'
                  ? existingDraft.startedAt
                  : nowTimeLabel(),
              lastSavedAt:
                typeof existingDraft.lastSavedAt === 'string'
                  ? existingDraft.lastSavedAt
                  : undefined,
            },
          };
        }

        const freshKey = generateIdempotencyKey();
        const nowLabel = nowTimeLabel();
        const newDraft = {
          idempotencyKey: freshKey,
          currentStepIndex: 0,
          answers: {},
          startedAt: nowLabel,
          lastSavedAt: nowLabel,
        };

        tx.update(participantRef, {
          participantName: rawName,
          activeDraft: newDraft,
          updatedAt: serverTimestamp(),
        });

        return {
          blocked: false as const,
          resumed: false,
          attemptsUsed: 0,
          maxAttempts: 1,
          examId,
          participantKey,
          participantName: rawName,
          draft: newDraft,
        };
      }

      const freshKey = generateIdempotencyKey();
      const nowLabel = nowTimeLabel();
      const newDraft = {
        idempotencyKey: freshKey,
        currentStepIndex: 0,
        answers: {},
        startedAt: nowLabel,
        lastSavedAt: nowLabel,
      };

      tx.set(participantRef, {
        examId,
        examSlug: cleanSlug,
        examOwnerId,
        participantKey,
        participantName: rawName,
        attemptsUsed: 0,
        activeDraft: newDraft,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        blocked: false as const,
        resumed: false,
        attemptsUsed: 0,
        maxAttempts: 1,
        examId,
        participantKey,
        participantName: rawName,
        draft: newDraft,
      };
    });

    if (result.blocked) {
      throw new StudentApiError(
        `Ya enviaste esta evaluación con el identificador «${rawName}». Solo se admite un único envío.`,
        409,
        'MAX_ATTEMPTS_REACHED',
        result.lastSubmittedAttemptId
      );
    }

    return result;
  } catch (err) {
    if (err instanceof StudentApiError) throw err;
    const code = getFirebaseErrorCode(err);
    if (code === 'permission-denied') {
      throw new StudentApiError(
        'Esta evaluación fue cerrada y ya no admite nuevos intentos.',
        410
      );
    }
    if (isNetworkLikeFirebaseError(err)) {
      throw new StudentApiError(
        'No hay conexión para verificar tu sesión en este momento. Verificá tu red e intentá nuevamente.',
        0,
        'NETWORK_ERROR'
      );
    }
    throw new StudentApiError(
      'No se pudo iniciar o retomar la evaluación en Firestore. Intentá nuevamente.',
      503
    );
  }
}

// 3. Recuperar borrador persistido al recargar la página
export async function fetchStudentProgress(
  slug: string,
  participantKey: string
): Promise<ProgressLookupResponse> {
  const cleanSlug = slug.trim();
  const cleanParticipantKey = participantKey.trim();

  if (!isValidSlug(cleanSlug) || !isValidId(cleanParticipantKey)) {
    throw new StudentApiError('Parámetros de sesión inválidos.', 400);
  }

  try {
    const pubSnap = await getDoc(doc(db, 'examPublic', cleanSlug));
    if (!pubSnap.exists() || pubSnap.data().status !== 'publicada') {
      throw new StudentApiError('Evaluación no disponible o cerrada.', 410);
    }

    const pubData = pubSnap.data();
    const examId = String(pubData.examId);
    const participantDocId = `${examId}__${cleanParticipantKey}`;

    const pSnap = await getDoc(doc(db, 'examParticipants', participantDocId));
    if (!pSnap.exists()) {
      throw new StudentApiError('Sesión de borrador no encontrada.', 404);
    }

    const pData = pSnap.data();
    const draft =
      pData.activeDraft && typeof pData.activeDraft === 'object'
        ? (pData.activeDraft as Record<string, unknown>)
        : null;

    return {
      examId,
      attemptsUsed: Number(pData.attemptsUsed ?? 0),
      maxAttempts: 1,
      participantName: String(pData.participantName ?? ''),
      lastSubmittedAttemptId:
        typeof pData.lastSubmittedAttemptId === 'string'
          ? pData.lastSubmittedAttemptId
          : null,
      draft: draft
        ? {
            idempotencyKey: String(draft.idempotencyKey ?? ''),
            currentStepIndex:
              typeof draft.currentStepIndex === 'number'
                ? draft.currentStepIndex
                : 0,
            answers: sanitizeAnswersPayload(draft.answers),
            startedAt: String(draft.startedAt ?? ''),
            lastSavedAt:
              typeof draft.lastSavedAt === 'string'
                ? draft.lastSavedAt
                : undefined,
          }
        : null,
    };
  } catch (err) {
    if (err instanceof StudentApiError) throw err;
    const code = getFirebaseErrorCode(err);
    if (code === 'permission-denied') {
      throw new StudentApiError('Evaluación cerrada o sin acceso.', 410);
    }
    if (isNetworkLikeFirebaseError(err)) {
      throw new StudentApiError(
        'Sin conexión con Firestore.',
        0,
        'NETWORK_ERROR'
      );
    }
    throw new StudentApiError(
      'No se pudo consultar el avance guardado en Firestore.',
      503
    );
  }
}

// 4. Guardar progreso automáticamente sin consumir el único intento
export async function saveStudentProgress(params: {
  slug: string;
  participantKey: string;
  participantName: string;
  idempotencyKey: string;
  currentStepIndex: number;
  answers: Record<string, StudentAnswerValue>;
}): Promise<{ ok: boolean; savedAt: string }> {
  const cleanSlug = params.slug.trim();
  const participantKey = params.participantKey.trim();
  const participantName = params.participantName.trim();
  const idempotencyKey = params.idempotencyKey.trim();
  const currentStepIndex = Math.max(0, Math.floor(Number(params.currentStepIndex ?? 0)));
  const answers = sanitizeAnswersPayload(params.answers);

  if (
    !isValidSlug(cleanSlug) ||
    !isValidId(participantKey) ||
    !isValidId(idempotencyKey) ||
    participantName.length < 1 ||
    participantName.length > 120
  ) {
    throw new StudentApiError('Datos de progreso inválidos.', 400);
  }

  try {
    const pubSnap = await getDoc(doc(db, 'examPublic', cleanSlug));
    if (!pubSnap.exists() || pubSnap.data().status !== 'publicada') {
      throw new StudentApiError(
        'La evaluación fue cerrada y ya no admite cambios.',
        410
      );
    }

    const pubData = pubSnap.data();
    const examId = String(pubData.examId);
    const examOwnerId = String(pubData.ownerId);
    const participantDocId = `${examId}__${participantKey}`;
    const participantRef = doc(db, 'examParticipants', participantDocId);
    const savedTime = nowTimeLabel();

    const outcome = await runTransaction(db, async (tx) => {
      const pSnap = await tx.get(participantRef);
      if (pSnap.exists()) {
        const pData = pSnap.data();
        const attemptsUsed = Number(pData.attemptsUsed ?? 0);
        if (attemptsUsed >= 1) {
          return {
            blocked: true as const,
            lastSubmittedAttemptId:
              typeof pData.lastSubmittedAttemptId === 'string'
                ? pData.lastSubmittedAttemptId
                : null,
          };
        }
        const prevStartedAt =
          pData.activeDraft &&
          typeof (pData.activeDraft as Record<string, unknown>).startedAt ===
            'string'
            ? String((pData.activeDraft as Record<string, unknown>).startedAt)
            : savedTime;

        tx.update(participantRef, {
          participantName,
          activeDraft: {
            idempotencyKey,
            currentStepIndex,
            answers,
            startedAt: prevStartedAt,
            lastSavedAt: savedTime,
          },
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(participantRef, {
          examId,
          examSlug: cleanSlug,
          examOwnerId,
          participantKey,
          participantName,
          attemptsUsed: 0,
          activeDraft: {
            idempotencyKey,
            currentStepIndex,
            answers,
            startedAt: savedTime,
            lastSavedAt: savedTime,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      return { blocked: false as const };
    });

    if (outcome.blocked) {
      throw new StudentApiError(
        'Esta evaluación ya fue enviada previamente con este identificador.',
        409,
        'MAX_ATTEMPTS_REACHED',
        outcome.lastSubmittedAttemptId
      );
    }

    return { ok: true, savedAt: savedTime };
  } catch (err) {
    if (err instanceof StudentApiError) throw err;
    const code = getFirebaseErrorCode(err);
    if (code === 'permission-denied') {
      throw new StudentApiError(
        'La evaluación fue cerrada y ya no admite cambios.',
        410
      );
    }
    if (isNetworkLikeFirebaseError(err)) {
      throw new StudentApiError(
        'Sin conexión. Tu avance sigue guardado en este dispositivo.',
        0,
        'NETWORK_ERROR'
      );
    }
    throw new StudentApiError(
      'Error temporal al sincronizar el progreso con Firestore.',
      503
    );
  }
}

// 5. Envío definitivo idempotente con control atómico de intento único en Firestore
export async function submitStudentAttempt(params: {
  slug: string;
  participantName: string;
  participantKey: string;
  idempotencyKey: string;
  answers: Record<string, StudentAnswerValue>;
}): Promise<{ idempotentReplay: boolean; receipt: SubmittedAttemptReceipt }> {
  const cleanSlug = params.slug.trim();
  const participantName = params.participantName.trim();
  const participantKey = params.participantKey.trim();
  const idempotencyKey = params.idempotencyKey.trim();
  const answers = sanitizeAnswersPayload(params.answers);

  if (
    !isValidSlug(cleanSlug) ||
    !isValidId(participantKey) ||
    !isValidId(idempotencyKey) ||
    idempotencyKey.length < 8 ||
    participantName.length < 1 ||
    participantName.length > 120
  ) {
    throw new StudentApiError('Datos de envío inválidos.', 400);
  }

  try {
    const pubRef = doc(db, 'examPublic', cleanSlug);
    const pubPreSnap = await getDoc(pubRef);
    if (!pubPreSnap.exists() || pubPreSnap.data().status !== 'publicada') {
      throw new StudentApiError(
        'Esta evaluación fue cerrada o ya no se encuentra publicada.',
        410
      );
    }

    const exam = mapPublicExam(cleanSlug, pubPreSnap.data());
    const examId = exam.id;
    const examOwnerId = exam.ownerId ?? '';
    const attemptId = `${examId}__${idempotencyKey}`;
    const attemptRef = doc(db, 'attempts', attemptId);
    const participantDocId = `${examId}__${participantKey}`;
    const participantRef = doc(db, 'examParticipants', participantDocId);
    const keysRef = doc(db, 'examClosedKeys', cleanSlug);

    const txResult = await runTransaction(db, async (tx) => {
      // Todas las lecturas primero (requisito estricto de transacciones Firestore)
      const existingAttempt = await tx.get(attemptRef);
      if (existingAttempt.exists()) {
        const d = existingAttempt.data();
        const ts = formatFirestoreDateInfo(d.submittedAt);
        return {
          status: 'idempotent_replay' as const,
          receipt: {
            attemptId,
            attemptCode: attemptId.slice(-8).toUpperCase(),
            examId: String(d.examId),
            examSlug: String(d.examSlug),
            examTitle: exam.title,
            course: exam.course,
            teachersText: exam.teachersText,
            participantName: String(d.participantName),
            participantKey: String(d.participantKey),
            attemptNumber: 1,
            maxAttempts: 1,
            feedbackEnabled: exam.feedbackEnabled,
            closedFeedback: exam.feedbackEnabled
              ? ((d.closedFeedback as ClosedFeedbackItem[]) ?? [])
              : [],
            autoScore:
              exam.feedbackEnabled && typeof d.autoScore === 'number'
                ? d.autoScore
                : null,
            maxAutoScore:
              exam.feedbackEnabled && typeof d.maxAutoScore === 'number'
                ? d.maxAutoScore
                : null,
            hasPendingManualGrading: Boolean(d.hasPendingManualGrading),
            submittedAtIso: ts.iso,
            submittedAtFormatted: ts.formatted,
          } satisfies SubmittedAttemptReceipt,
        };
      }

      const pubSnap = await tx.get(pubRef);
      if (!pubSnap.exists() || pubSnap.data().status !== 'publicada') {
        return { status: 'closed' as const };
      }

      const pSnap = await tx.get(participantRef);
      const attemptsUsed = pSnap.exists()
        ? Number(pSnap.data().attemptsUsed ?? 0)
        : 0;
      const lastSubmittedAttemptId =
        pSnap.exists() && typeof pSnap.data().lastSubmittedAttemptId === 'string'
          ? String(pSnap.data().lastSubmittedAttemptId)
          : null;

      if (attemptsUsed >= 1) {
        return {
          status: 'max_attempts' as const,
          lastSubmittedAttemptId,
        };
      }

      let closedKeys: Record<string, ClosedKeyEntry> = {};
      if (exam.feedbackEnabled) {
        try {
          const keysSnap = await tx.get(keysRef);
          if (keysSnap.exists()) {
            closedKeys = (keysSnap.data().questions ?? {}) as Record<
              string,
              ClosedKeyEntry
            >;
          }
        } catch {
          closedKeys = {};
        }
      }

      const evalResult = exam.feedbackEnabled
        ? evaluateClosedQuestions({ exam, closedKeys, answers })
        : { closedFeedback: [], autoScore: null, maxAutoScore: null };

      const hasPendingManualGrading = exam.consignas.some((c) =>
        c.questions.some(
          (q) =>
            q.type === 'abierta' ||
            q.type === 'cuadro_comparativo' ||
            q.type === 'relacionar' ||
            q.type === 'clasificar'
        )
      );

      const attemptDoc: Record<string, unknown> = {
        examId,
        examSlug: cleanSlug,
        examOwnerId,
        participantKey,
        participantName,
        attemptNumber: 1,
        idempotencyKey,
        answers,
        closedFeedback: exam.feedbackEnabled ? evalResult.closedFeedback : [],
        hasPendingManualGrading,
        correctionStatus: 'pendiente',
        resultStatus: 'pendiente',
        submittedAt: serverTimestamp(),
      };
      if (exam.feedbackEnabled && evalResult.autoScore !== null) {
        attemptDoc.autoScore = evalResult.autoScore;
      }
      if (exam.feedbackEnabled && evalResult.maxAutoScore !== null) {
        attemptDoc.maxAutoScore = evalResult.maxAutoScore;
      }

      tx.set(attemptRef, attemptDoc);

      if (pSnap.exists()) {
        tx.update(participantRef, {
          participantName,
          attemptsUsed: 1,
          activeDraft: null,
          lastSubmittedAttemptId: attemptId,
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.set(participantRef, {
          examId,
          examSlug: cleanSlug,
          examOwnerId,
          participantKey,
          participantName,
          attemptsUsed: 1,
          activeDraft: null,
          lastSubmittedAttemptId: attemptId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      return {
        status: 'created' as const,
        evalResult,
        hasPendingManualGrading,
      };
    });

    if (txResult.status === 'idempotent_replay') {
      return {
        idempotentReplay: true,
        receipt: txResult.receipt,
      };
    }
    if (txResult.status === 'closed') {
      throw new StudentApiError(
        'Esta evaluación se cerró antes de completar el envío.',
        410
      );
    }
    if (txResult.status === 'max_attempts') {
      throw new StudentApiError(
        `Ya enviaste esta evaluación con el identificador «${participantName}». Solo se admite un único envío.`,
        409,
        'MAX_ATTEMPTS_REACHED',
        txResult.lastSubmittedAttemptId
      );
    }

    // Leer documento confirmado para devolver la marca de tiempo real del servidor
    const persistedSnap = await getDoc(attemptRef);
    const persistedData = persistedSnap.exists() ? persistedSnap.data() : {};
    const ts = formatFirestoreDateInfo(persistedData.submittedAt);

    const receipt: SubmittedAttemptReceipt = {
      attemptId,
      attemptCode: attemptId.slice(-8).toUpperCase(),
      examId,
      examSlug: cleanSlug,
      examTitle: exam.title,
      course: exam.course,
      teachersText: exam.teachersText,
      participantName,
      participantKey,
      attemptNumber: 1,
      maxAttempts: 1,
      feedbackEnabled: exam.feedbackEnabled,
      closedFeedback: exam.feedbackEnabled
        ? txResult.evalResult.closedFeedback
        : [],
      autoScore: exam.feedbackEnabled ? txResult.evalResult.autoScore : null,
      maxAutoScore: exam.feedbackEnabled
        ? txResult.evalResult.maxAutoScore
        : null,
      hasPendingManualGrading: txResult.hasPendingManualGrading,
      submittedAtIso: ts.iso,
      submittedAtFormatted: ts.formatted,
    };

    return { idempotentReplay: false, receipt };
  } catch (err) {
    if (err instanceof StudentApiError) throw err;
    const code = getFirebaseErrorCode(err);
    if (code === 'permission-denied') {
      throw new StudentApiError(
        'No se pudo registrar la entrega porque la evaluación fue cerrada o ya existe un envío previo para este identificador.',
        409
      );
    }
    if (isNetworkLikeFirebaseError(err)) {
      throw new StudentApiError(
        'No pudimos confirmar el envío por un problema de conexión. Tus respuestas siguen guardadas: podés reintentar sin duplicar el intento.',
        0,
        'NETWORK_ERROR'
      );
    }
    throw new StudentApiError(
      'No pudimos confirmar el envío en Firestore. Tus respuestas siguen guardadas: podés reintentar.',
      503
    );
  }
}

// 6. Consultar recibo confirmado por attemptId directamente en Firestore
export async function fetchStudentReceipt(
  attemptId: string
): Promise<SubmittedAttemptReceipt> {
  const cleanId = attemptId.trim();
  if (!isValidId(cleanId)) {
    throw new StudentApiError('Identificador de entrega inválido.', 400);
  }

  try {
    const snap = await getDoc(doc(db, 'attempts', cleanId));
    if (!snap.exists()) {
      throw new StudentApiError('Comprobante no encontrado.', 404);
    }
    const d = snap.data();
    const slug = String(d.examSlug || '');
    let examTitle = 'Evaluación';
    let course = '';
    let teachersText = '';
    let feedbackEnabled = false;

    if (isValidSlug(slug)) {
      try {
        const pubSnap = await getDoc(doc(db, 'examPublic', slug));
        if (pubSnap.exists()) {
          const pub = pubSnap.data();
          examTitle = String(pub.title ?? examTitle);
          course = String(pub.course ?? '');
          teachersText = String(pub.teachersText ?? '');
          feedbackEnabled = Boolean(pub.feedbackEnabled);
        }
      } catch {
        // Si el docente cerró la evaluación luego de la entrega, examPublic puede quedar restringida: conservar comprobante
      }
    }

    const ts = formatFirestoreDateInfo(d.submittedAt);
    return {
      attemptId: cleanId,
      attemptCode: cleanId.slice(-8).toUpperCase(),
      examId: String(d.examId),
      examSlug: slug,
      examTitle,
      course,
      teachersText,
      participantName: String(d.participantName ?? ''),
      participantKey: String(d.participantKey ?? ''),
      attemptNumber: 1,
      maxAttempts: 1,
      feedbackEnabled,
      closedFeedback: feedbackEnabled
        ? ((d.closedFeedback as ClosedFeedbackItem[]) ?? [])
        : [],
      autoScore:
        feedbackEnabled && typeof d.autoScore === 'number' ? d.autoScore : null,
      maxAutoScore:
        feedbackEnabled && typeof d.maxAutoScore === 'number'
          ? d.maxAutoScore
          : null,
      hasPendingManualGrading: Boolean(d.hasPendingManualGrading),
      submittedAtIso: ts.iso,
      submittedAtFormatted: ts.formatted,
    };
  } catch (err) {
    if (err instanceof StudentApiError) throw err;
    if (isNetworkLikeFirebaseError(err)) {
      throw new StudentApiError(
        'Sin conexión para consultar el comprobante.',
        0,
        'NETWORK_ERROR'
      );
    }
    throw new StudentApiError(
      'Error al consultar el comprobante en Firestore.',
      503
    );
  }
}

export function readLocalStudentDraft(
  slug: string
): StoredLocalStudentDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocalStudentDraft;
    if (!parsed || parsed.examSlug !== slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalStudentDraft(
  slug: string,
  draft: StoredLocalStudentDraft
): void {
  try {
    window.localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${slug}`,
      JSON.stringify(draft)
    );
  } catch {
    // Ignorar errores de cuota o modo privado estricto
  }
}

export function clearLocalStudentDraft(slug: string): void {
  try {
    window.localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${slug}`);
  } catch {
    // Ignorar errores de storage
  }
}

export function readLocalStudentReceipt(
  slug: string
): SubmittedAttemptReceipt | null {
  try {
    const raw = window.localStorage.getItem(`${RECEIPT_STORAGE_PREFIX}${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubmittedAttemptReceipt;
    if (!parsed || parsed.examSlug !== slug) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalStudentReceipt(
  slug: string,
  receipt: SubmittedAttemptReceipt
): void {
  try {
    window.localStorage.setItem(
      `${RECEIPT_STORAGE_PREFIX}${slug}`,
      JSON.stringify(receipt)
    );
  } catch {
    // Ignorar errores de storage
  }
}

export function isQuestionAnswered(
  q: QuestionItem,
  ans: StudentAnswerValue | undefined
): boolean {
  if (!ans) return false;
  if (ans.type === 'abierta') return ans.text.trim().length > 0;
  if (ans.type === 'opcion_multiple') return ans.selectedIds.length > 0;
  if (ans.type === 'verdadero_falso') return ans.value !== null;
  if (ans.type === 'relacionar') {
    return Object.values(ans.mapping).some((v) => v.trim().length > 0);
  }
  if (ans.type === 'clasificar') {
    return Object.values(ans.assignments).some((v) => v.trim().length > 0);
  }
  if (ans.type === 'cuadro_comparativo') {
    return Object.values(ans.cells).some((row) =>
      Object.values(row).some((cell) => cell.trim().length > 0)
    );
  }
  return false;
}
