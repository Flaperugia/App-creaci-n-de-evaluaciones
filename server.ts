import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { initializeApp } from 'firebase/app';
import {
  doc,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type {
  ClosedFeedbackItem,
  ConsignaBlock,
  ExamDefinition,
  StudentAnswerValue,
  SubmittedAttemptReceipt,
} from './src/types/assessment.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const firebaseConfigPath = path.resolve(
  process.cwd(),
  'firebase-applet-config.json'
);
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

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

function normalizeParticipantName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function deriveParticipantKey(rawName: string): string {
  const norm = normalizeParticipantName(rawName);
  const hash = crypto.createHash('sha256').update(norm).digest('hex');
  return `p_${hash.slice(0, 24)}`;
}

function formatServerDate(value: unknown): { iso: string; formatted: string } {
  const date =
    value instanceof Timestamp ? value.toDate() : new Date();
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

// Defensa en profundidad: garantiza que ninguna respuesta pública incluya claves o modelos
function stripSensitiveExamFields(consignas: ConsignaBlock[]): ConsignaBlock[] {
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
    maxAttempts: typeof d.maxAttempts === 'number' ? d.maxAttempts : 1,
    feedbackEnabled: Boolean(d.feedbackEnabled),
    status: d.status === 'cerrada' ? 'cerrada' : 'publicada',
    updatedAt: '',
    submissionsCount: 0,
    consignas: stripSensitiveExamFields(
      Array.isArray(d.consignas) ? (d.consignas as ConsignaBlock[]) : []
    ),
  };
}

function sanitizeAnswersPayload(
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

interface ClosedKeyEntry {
  type: 'opcion_multiple' | 'verdadero_falso';
  prompt?: string;
  points?: number | null;
  allowMultiple?: boolean;
  correctOptionIds?: string[];
  correctBoolean?: boolean;
}

function evaluateClosedQuestions(params: {
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
        const val =
          ans?.type === 'verdadero_falso' ? ans.value : null;
        if (val === true) studentAnswerLabel = 'Verdadero';
        else if (val === false) studentAnswerLabel = 'Falso';
        isCorrect = val !== null && val === Boolean(key.correctBoolean);
      } else if (q.type === 'opcion_multiple') {
        const selected =
          ans?.type === 'opcion_multiple' ? ans.selectedIds : [];
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

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // 1. Obtener evaluación pública sin soluciones
  app.get('/api/public/exams/:slug', async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!isValidSlug(slug)) {
      return res.status(400).json({ error: 'Enlace de evaluación inválido.' });
    }
    try {
      const snap = await getDoc(doc(db, 'examPublic', slug));
      if (!snap.exists()) {
        return res
          .status(404)
          .json({ error: 'Evaluación no encontrada o aún no publicada.' });
      }
      const data = snap.data();
      if (data.status !== 'publicada') {
        return res.status(410).json({
          error: 'Esta evaluación ya fue cerrada y no admite nuevas entregas.',
        });
      }
      return res.json({ exam: mapPublicExam(slug, data) });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'permission-denied') {
        return res.status(410).json({
          error: 'Esta evaluación ya fue cerrada y no admite nuevas entregas.',
        });
      }
      console.error('Error fetching public exam:', err);
      return res.status(503).json({
        error:
          'No se pudo conectar con la base de datos. Verificá tu conexión e intentá nuevamente.',
      });
    }
  });

  // 2. Iniciar o retomar intento del estudiante por identificador de prueba
  app.post('/api/student/attempts/start', async (req, res) => {
    const slug = String(req.body?.slug || '').trim();
    const rawName = String(req.body?.participantName || '').trim();

    if (!isValidSlug(slug)) {
      return res.status(400).json({ error: 'Evaluación inválida.' });
    }
    if (rawName.length < 1 || rawName.length > 120) {
      return res.status(400).json({
        error: 'Ingresá tu nombre y apellido o código de prueba (hasta 120 caracteres).',
      });
    }

    const participantKey = deriveParticipantKey(rawName);

    try {
      const pubSnap = await getDoc(doc(db, 'examPublic', slug));
      if (!pubSnap.exists() || pubSnap.data().status !== 'publicada') {
        return res.status(404).json({
          error: 'Esta evaluación no está publicada o ya fue cerrada.',
        });
      }

      const pubData = pubSnap.data();
      const examId = String(pubData.examId);
      const examOwnerId = String(pubData.ownerId);
      const maxAttempts = Number(pubData.maxAttempts ?? 1);
      const participantDocId = `${examId}__${participantKey}`;
      const participantRef = doc(db, 'examParticipants', participantDocId);

      const result = await runTransaction(db, async (tx) => {
        const pSnap = await tx.get(participantRef);

        if (pSnap.exists()) {
          const pData = pSnap.data();
          const attemptsUsed = Number(pData.attemptsUsed ?? 0);

          if (attemptsUsed >= maxAttempts) {
            return {
              blocked: true as const,
              attemptsUsed,
              maxAttempts,
            };
          }

          const existingDraft =
            pData.activeDraft && typeof pData.activeDraft === 'object'
              ? (pData.activeDraft as Record<string, unknown>)
              : null;

          if (existingDraft && typeof existingDraft.idempotencyKey === 'string') {
            return {
              blocked: false as const,
              resumed: true,
              attemptsUsed,
              maxAttempts,
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
                    : new Date().toLocaleTimeString('es-AR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                lastSavedAt:
                  typeof existingDraft.lastSavedAt === 'string'
                    ? existingDraft.lastSavedAt
                    : undefined,
              },
            };
          }

          const freshKey = `sub_${crypto.randomBytes(12).toString('hex')}`;
          const nowLabel = new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          });
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
            attemptsUsed,
            maxAttempts,
            examId,
            participantKey,
            participantName: rawName,
            draft: newDraft,
          };
        }

        const freshKey = `sub_${crypto.randomBytes(12).toString('hex')}`;
        const nowLabel = new Date().toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        const newDraft = {
          idempotencyKey: freshKey,
          currentStepIndex: 0,
          answers: {},
          startedAt: nowLabel,
          lastSavedAt: nowLabel,
        };

        tx.set(participantRef, {
          examId,
          examSlug: slug,
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
          maxAttempts,
          examId,
          participantKey,
          participantName: rawName,
          draft: newDraft,
        };
      });

      if (result.blocked) {
        return res.status(409).json({
          code: 'MAX_ATTEMPTS_REACHED',
          attemptsUsed: result.attemptsUsed,
          maxAttempts: result.maxAttempts,
          error: `Ya completaste el máximo de ${result.maxAttempts} intento(s) permitido(s) para «${rawName}».`,
        });
      }

      return res.json(result);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'permission-denied') {
        return res.status(410).json({
          error: 'Esta evaluación fue cerrada y ya no admite nuevos intentos.',
        });
      }
      console.error('Error starting student attempt:', err);
      return res.status(503).json({
        error:
          'No se pudo iniciar o verificar el intento en el servidor. Intentá nuevamente.',
      });
    }
  });

  // 3. Recuperar borrador persistido al recargar página
  app.get('/api/student/attempts/progress', async (req, res) => {
    const slug = String(req.query.slug || '').trim();
    const participantKey = String(req.query.participantKey || '').trim();

    if (!isValidSlug(slug) || !isValidId(participantKey)) {
      return res.status(400).json({ error: 'Parámetros inválidos.' });
    }

    try {
      const pubSnap = await getDoc(doc(db, 'examPublic', slug));
      if (!pubSnap.exists() || pubSnap.data().status !== 'publicada') {
        return res
          .status(404)
          .json({ error: 'Evaluación no disponible o cerrada.' });
      }
      const pubData = pubSnap.data();
      const examId = String(pubData.examId);
      const maxAttempts = Number(pubData.maxAttempts ?? 1);
      const participantDocId = `${examId}__${participantKey}`;

      const pSnap = await getDoc(doc(db, 'examParticipants', participantDocId));
      if (!pSnap.exists()) {
        return res.status(404).json({ error: 'Sesión de intento no encontrada.' });
      }

      const pData = pSnap.data();
      const draft =
        pData.activeDraft && typeof pData.activeDraft === 'object'
          ? (pData.activeDraft as Record<string, unknown>)
          : null;

      return res.json({
        examId,
        attemptsUsed: Number(pData.attemptsUsed ?? 0),
        maxAttempts,
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
      });
    } catch (err) {
      console.error('Error loading attempt progress:', err);
      return res.status(503).json({
        error: 'No se pudo consultar el avance guardado en el servidor.',
      });
    }
  });

  // 4. Guardar progreso sin consumir intento
  app.put('/api/student/attempts/progress', async (req, res) => {
    const slug = String(req.body?.slug || '').trim();
    const participantKey = String(req.body?.participantKey || '').trim();
    const participantName = String(req.body?.participantName || '').trim();
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const currentStepIndex = Math.max(
      0,
      Math.floor(Number(req.body?.currentStepIndex ?? 0))
    );
    const answers = sanitizeAnswersPayload(req.body?.answers);

    if (
      !isValidSlug(slug) ||
      !isValidId(participantKey) ||
      !isValidId(idempotencyKey) ||
      participantName.length < 1 ||
      participantName.length > 120
    ) {
      return res.status(400).json({ error: 'Datos de progreso inválidos.' });
    }

    try {
      const pubSnap = await getDoc(doc(db, 'examPublic', slug));
      if (!pubSnap.exists() || pubSnap.data().status !== 'publicada') {
        return res.status(410).json({
          error: 'La evaluación fue cerrada y ya no admite cambios.',
        });
      }
      const pubData = pubSnap.data();
      const examId = String(pubData.examId);
      const examOwnerId = String(pubData.ownerId);
      const maxAttempts = Number(pubData.maxAttempts ?? 1);
      const participantDocId = `${examId}__${participantKey}`;
      const participantRef = doc(db, 'examParticipants', participantDocId);

      const savedTime = new Date().toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const outcome = await runTransaction(db, async (tx) => {
        const pSnap = await tx.get(participantRef);
        if (pSnap.exists()) {
          const pData = pSnap.data();
          const attemptsUsed = Number(pData.attemptsUsed ?? 0);
          if (attemptsUsed >= maxAttempts) {
            return { blocked: true as const };
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
            examSlug: slug,
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
        return res.status(409).json({
          code: 'MAX_ATTEMPTS_REACHED',
          error: 'Ya alcanzaste el máximo de intentos permitidos.',
        });
      }

      return res.json({ ok: true, savedAt: savedTime });
    } catch (err) {
      console.error('Error saving student progress:', err);
      return res.status(503).json({
        error: 'Error temporal al sincronizar el progreso con el servidor.',
      });
    }
  });

  // 5. Envío definitivo idempotente con control atómico de intentos y timestamp de servidor
  app.post('/api/student/attempts/submit', async (req, res) => {
    const slug = String(req.body?.slug || '').trim();
    const participantName = String(req.body?.participantName || '').trim();
    const participantKey = String(req.body?.participantKey || '').trim();
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    const answers = sanitizeAnswersPayload(req.body?.answers);

    if (
      !isValidSlug(slug) ||
      !isValidId(participantKey) ||
      !isValidId(idempotencyKey) ||
      idempotencyKey.length < 8 ||
      participantName.length < 1 ||
      participantName.length > 120
    ) {
      return res.status(400).json({ error: 'Datos de envío inválidos.' });
    }

    try {
      const pubRef = doc(db, 'examPublic', slug);
      const pubPreSnap = await getDoc(pubRef);
      if (!pubPreSnap.exists() || pubPreSnap.data().status !== 'publicada') {
        return res.status(410).json({
          error: 'Esta evaluación fue cerrada o ya no se encuentra publicada.',
        });
      }

      const exam = mapPublicExam(slug, pubPreSnap.data());
      const examId = exam.id;
      const examOwnerId = exam.ownerId ?? '';
      const attemptId = `${examId}__${idempotencyKey}`;
      const attemptRef = doc(db, 'attempts', attemptId);
      const participantDocId = `${examId}__${participantKey}`;
      const participantRef = doc(db, 'examParticipants', participantDocId);
      const keysRef = doc(db, 'examClosedKeys', slug);

      const txResult = await runTransaction(db, async (tx) => {
        const existingAttempt = await tx.get(attemptRef);
        if (existingAttempt.exists()) {
          const d = existingAttempt.data();
          const ts = formatServerDate(d.submittedAt);
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
              attemptNumber: Number(d.attemptNumber),
              maxAttempts: exam.maxAttempts,
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
        if (attemptsUsed >= exam.maxAttempts) {
          return {
            status: 'max_attempts' as const,
            attemptsUsed,
            maxAttempts: exam.maxAttempts,
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

        const nextAttemptNumber = attemptsUsed + 1;
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
          examSlug: slug,
          examOwnerId,
          participantKey,
          participantName,
          attemptNumber: nextAttemptNumber,
          idempotencyKey,
          answers,
          closedFeedback: evalResult.closedFeedback,
          hasPendingManualGrading,
          correctionStatus: 'pendiente',
          resultStatus: 'pendiente',
          submittedAt: serverTimestamp(),
        };
        if (evalResult.autoScore !== null) {
          attemptDoc.autoScore = evalResult.autoScore;
        }
        if (evalResult.maxAutoScore !== null) {
          attemptDoc.maxAutoScore = evalResult.maxAutoScore;
        }

        tx.set(attemptRef, attemptDoc);

        if (pSnap.exists()) {
          tx.update(participantRef, {
            participantName,
            attemptsUsed: nextAttemptNumber,
            activeDraft: null,
            lastSubmittedAttemptId: attemptId,
            updatedAt: serverTimestamp(),
          });
        } else {
          tx.set(participantRef, {
            examId,
            examSlug: slug,
            examOwnerId,
            participantKey,
            participantName,
            attemptsUsed: nextAttemptNumber,
            activeDraft: null,
            lastSubmittedAttemptId: attemptId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        return {
          status: 'created' as const,
          attemptNumber: nextAttemptNumber,
          evalResult,
          hasPendingManualGrading,
        };
      });

      if (txResult.status === 'idempotent_replay') {
        return res.json({
          idempotentReplay: true,
          receipt: txResult.receipt,
        });
      }
      if (txResult.status === 'closed') {
        return res.status(410).json({
          error: 'Esta evaluación se cerró antes de completar el envío.',
        });
      }
      if (txResult.status === 'max_attempts') {
        return res.status(409).json({
          code: 'MAX_ATTEMPTS_REACHED',
          error: `Ya utilizaste el máximo de ${txResult.maxAttempts} intento(s) permitido(s) para esta evaluación.`,
        });
      }

      // Leer documento confirmado para devolver la marca de tiempo real del servidor
      const persistedSnap = await getDoc(attemptRef);
      const persistedData = persistedSnap.exists() ? persistedSnap.data() : {};
      const ts = formatServerDate(persistedData.submittedAt);

      const receipt: SubmittedAttemptReceipt = {
        attemptId,
        attemptCode: attemptId.slice(-8).toUpperCase(),
        examId,
        examSlug: slug,
        examTitle: exam.title,
        course: exam.course,
        teachersText: exam.teachersText,
        participantName,
        participantKey,
        attemptNumber: txResult.attemptNumber,
        maxAttempts: exam.maxAttempts,
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

      return res.json({ idempotentReplay: false, receipt });
    } catch (err) {
      console.error('Error submitting attempt:', err);
      return res.status(503).json({
        error:
          'No pudimos confirmar el envío en el servidor por un problema de conexión. Tus respuestas siguen guardadas: podés reintentar sin duplicar el intento.',
      });
    }
  });

  // 6. Consultar recibo confirmado por attemptId (resiliencia ante recarga en /recibo)
  app.get('/api/student/attempts/:attemptId', async (req, res) => {
    const attemptId = String(req.params.attemptId || '').trim();
    if (!isValidId(attemptId)) {
      return res.status(400).json({ error: 'Identificador de entrega inválido.' });
    }
    try {
      const snap = await getDoc(doc(db, 'attempts', attemptId));
      if (!snap.exists()) {
        return res.status(404).json({ error: 'Comprobante no encontrado.' });
      }
      const d = snap.data();
      const slug = String(d.examSlug || '');
      let examTitle = 'Evaluación';
      let course = '';
      let teachersText = '';
      let maxAttempts = 1;
      let feedbackEnabled = false;

      if (isValidSlug(slug)) {
        const pubSnap = await getDoc(doc(db, 'examPublic', slug));
        if (pubSnap.exists()) {
          const pub = pubSnap.data();
          examTitle = String(pub.title ?? examTitle);
          course = String(pub.course ?? '');
          teachersText = String(pub.teachersText ?? '');
          maxAttempts = Number(pub.maxAttempts ?? 1);
          feedbackEnabled = Boolean(pub.feedbackEnabled);
        }
      }

      const ts = formatServerDate(d.submittedAt);
      const receipt: SubmittedAttemptReceipt = {
        attemptId,
        attemptCode: attemptId.slice(-8).toUpperCase(),
        examId: String(d.examId),
        examSlug: slug,
        examTitle,
        course,
        teachersText,
        participantName: String(d.participantName ?? ''),
        participantKey: String(d.participantKey ?? ''),
        attemptNumber: Number(d.attemptNumber ?? 1),
        maxAttempts,
        feedbackEnabled,
        closedFeedback: feedbackEnabled
          ? ((d.closedFeedback as ClosedFeedbackItem[]) ?? [])
          : [],
        autoScore:
          feedbackEnabled && typeof d.autoScore === 'number'
            ? d.autoScore
            : null,
        maxAutoScore:
          feedbackEnabled && typeof d.maxAutoScore === 'number'
            ? d.maxAutoScore
            : null,
        hasPendingManualGrading: Boolean(d.hasPendingManualGrading),
        submittedAtIso: ts.iso,
        submittedAtFormatted: ts.formatted,
      };

      return res.json({ receipt });
    } catch (err) {
      console.error('Error reading attempt receipt:', err);
      return res
        .status(503)
        .json({ error: 'Error al consultar el comprobante en el servidor.' });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

void createServer();
