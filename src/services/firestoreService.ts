import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { DEFAULT_SCHOOL_IDENTITY } from '../data/sampleData';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { validateHttpsImageUrl } from '../utils/imageUrl';
import {
  AuthorizedTeacher,
  ClosedFeedbackItem,
  ConsignaBlock,
  CURRENT_EXAM_SCHEMA_VERSION,
  ExamAttemptRecord,
  ExamDefinition,
  ExamGradingConfig,
  QuestionImage,
  SchoolIdentity,
  StaffRole,
  StudentAnswerValue,
} from '../types/assessment';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugifyExamTitle(title: string, suffix?: string): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  const cleanBase = base.length >= 3 ? base : 'evaluacion';
  return suffix ? `${cleanBase}-${suffix}`.slice(0, 120) : cleanBase;
}

export function formatFirestoreDate(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return 'Reciente';
}

function cleanImageForFirestore(
  image: QuestionImage | undefined
): QuestionImage | undefined {
  if (!image) return undefined;
  const check = validateHttpsImageUrl(image.url);
  if (!check.valid || !check.normalizedUrl) {
    throw new Error(
      check.error ||
        'Solo se admiten URLs HTTPS válidas para las imágenes adjuntas.'
    );
  }
  const cleanAlt = (image.alt ?? '').trim().slice(0, 240);
  return {
    url: check.normalizedUrl,
    alt: cleanAlt,
    ...(image.fileName ? { fileName: image.fileName.slice(0, 160) } : {}),
  };
}

// Elimina campos undefined para compatibilidad estricta con Firestore
export function sanitizeConsignasForFirestore(
  consignas: ConsignaBlock[]
): ConsignaBlock[] {
  return consignas.slice(0, 50).map((con, idx) => {
    const cleanedImg = cleanImageForFirestore(con.image);
    return {
      id: con.id,
      order: idx + 1,
      title: con.title.slice(0, 180),
      instructions: con.instructions.slice(0, 2000),
      ...(con.contextBoxTitle
        ? { contextBoxTitle: con.contextBoxTitle.slice(0, 180) }
        : {}),
      ...(con.contextBoxText
        ? { contextBoxText: con.contextBoxText.slice(0, 4000) }
        : {}),
      ...(cleanedImg ? { image: cleanedImg } : {}),
      questions: con.questions.map((q) => {
        const qImg = cleanImageForFirestore(q.image);
        return {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          points: typeof q.points === 'number' ? q.points : null,
          ...(q.label ? { label: q.label } : {}),
          ...(qImg ? { image: qImg } : {}),
          ...(q.options ? { options: q.options } : {}),
          ...(typeof q.allowMultiple === 'boolean'
            ? { allowMultiple: q.allowMultiple }
            : {}),
          ...(typeof q.correctBoolean === 'boolean'
            ? { correctBoolean: q.correctBoolean }
            : {}),
          ...(q.matchPairs ? { matchPairs: q.matchPairs } : {}),
          ...(q.categories ? { categories: q.categories } : {}),
          ...(q.classifyItems ? { classifyItems: q.classifyItems } : {}),
          ...(q.comparativeTable
            ? { comparativeTable: q.comparativeTable }
            : {}),
          ...(typeof q.modelAnswer === 'string'
            ? { modelAnswer: q.modelAnswer }
            : {}),
        };
      }),
    };
  });
}

// Proyección pública sin respuestas modelo ni claves de corrección
export function sanitizeConsignasForPublic(
  consignas: ConsignaBlock[]
): ConsignaBlock[] {
  return sanitizeConsignasForFirestore(consignas).map((con) => ({
    ...con,
    questions: con.questions.map((q) => {
      const sanitized = { ...q };
      delete sanitized.modelAnswer;
      delete sanitized.correctBoolean;
      if (sanitized.options) {
        sanitized.options = sanitized.options.map(({ id, label }) => ({
          id,
          label,
        }));
      }
      if (sanitized.classifyItems) {
        sanitized.classifyItems = sanitized.classifyItems.map(({ id, text }) => ({
          id,
          text,
          category: '',
        }));
      }
      if (sanitized.comparativeTable) {
        sanitized.comparativeTable = {
          ...sanitized.comparativeTable,
          rows: sanitized.comparativeTable.rows.map(
            ({ id, criterion, points }) => ({
              id,
              criterion,
              ...(typeof points === 'number' ? { points } : {}),
            })
          ),
        };
      }
      return sanitized;
    }),
  }));
}

export function validateExamForPublish(exam: ExamDefinition): string[] {
  const errors: string[] = [];

  if (!exam.title.trim()) {
    errors.push('Falta completar el título de la evaluación.');
  }
  if (!exam.course.trim()) {
    errors.push('Falta indicar el curso en Datos generales.');
  }
  if (exam.consignas.length === 0) {
    errors.push('La evaluación debe incluir al menos una consigna.');
  }

  exam.consignas.forEach((con, cIdx) => {
    const cNum = cIdx + 1;
    if (con.image) {
      const check = validateHttpsImageUrl(con.image.url);
      if (!check.valid) {
        errors.push(`Consigna ${cNum}: ${check.error || 'la URL de la imagen debe comenzar con https://.'}`);
      }
    }

    if (con.questions.length === 0) {
      errors.push(`Consigna ${cNum}: agregá al menos una pregunta.`);
    }

    con.questions.forEach((q, qIdx) => {
      const qLabel = `Consigna ${cNum}, Pregunta ${qIdx + 1}`;
      if (!q.prompt.trim()) {
        errors.push(`${qLabel}: falta el enunciado.`);
      }
      if (q.image) {
        const check = validateHttpsImageUrl(q.image.url);
        if (!check.valid) {
          errors.push(`${qLabel}: ${check.error || 'la URL de la imagen debe comenzar con https://.'}`);
        }
      }
      if (q.points !== null && q.points < 0) {
        errors.push(`${qLabel}: el puntaje no puede ser negativo.`);
      }

      if (q.type === 'opcion_multiple') {
        const opts = q.options ?? [];
        if (opts.length < 2) {
          errors.push(`${qLabel}: agregá al menos 2 opciones.`);
        }
        if (opts.some((o) => !o.label.trim())) {
          errors.push(`${qLabel}: todas las opciones deben tener texto.`);
        }
        const correctCount = opts.filter((o) => o.isCorrect).length;
        if (correctCount === 0) {
          errors.push(`${qLabel}: marcá al menos una opción correcta.`);
        }
        if (!q.allowMultiple && correctCount > 1) {
          errors.push(`${qLabel}: en selección única solo podés marcar una opción correcta.`);
        }
      }

      if (q.type === 'verdadero_falso' && typeof q.correctBoolean !== 'boolean') {
        errors.push(`${qLabel}: seleccioná si la afirmación es Verdadera o Falsa.`);
      }

      if (q.type === 'cuadro_comparativo') {
        const tbl = q.comparativeTable;
        if (!tbl || tbl.columns.length === 0 || tbl.rows.length === 0) {
          errors.push(`${qLabel}: el cuadro comparativo debe tener al menos 1 columna y 1 fila.`);
        } else {
          if (tbl.columns.some((col) => !col.title.trim())) {
            errors.push(`${qLabel}: todas las columnas del cuadro deben tener título.`);
          }
          if (tbl.rows.some((row) => !row.criterion.trim())) {
            errors.push(`${qLabel}: todas las filas del cuadro deben tener criterio.`);
          }
        }
      }
    });
  });

  return errors;
}

export async function fetchMyAuthorization(
  email: string
): Promise<AuthorizedTeacher | null> {
  const emailId = normalizeEmail(email);
  const path = `authorizedUsers/${emailId}`;
  try {
    const snap = await getDoc(doc(db, 'authorizedUsers', emailId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      email: String(data.email ?? emailId),
      name: String(data.name ?? ''),
      role: data.role === 'admin' ? 'admin' : 'teacher',
      active: Boolean(data.active),
      addedAt: formatFirestoreDate(data.createdAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function bootstrapFirstAdmin(user: User): Promise<void> {
  if (!user.email) {
    throw new Error('La cuenta de Google no tiene un correo electrónico disponible.');
  }
  const emailId = normalizeEmail(user.email);
  const userPath = `authorizedUsers/${emailId}`;
  try {
    await setDoc(doc(db, 'authorizedUsers', emailId), {
      email: emailId,
      name: (user.displayName || emailId.split('@')[0]).slice(0, 120),
      role: 'admin',
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, userPath);
  }

  const configPath = 'schoolConfig/default';
  try {
    const existingCfg = await getDoc(doc(db, 'schoolConfig', 'default'));
    if (!existingCfg.exists()) {
      await setDoc(doc(db, 'schoolConfig', 'default'), {
        name: DEFAULT_SCHOOL_IDENTITY.name,
        subtitle: DEFAULT_SCHOOL_IDENTITY.subtitle,
        primaryColor: DEFAULT_SCHOOL_IDENTITY.primaryColor,
        logoPreset: DEFAULT_SCHOOL_IDENTITY.logoPreset,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, configPath);
  }
}

export function subscribeSchoolConfig(
  onData: (identity: SchoolIdentity) => void
): Unsubscribe {
  const path = 'schoolConfig/default';
  return onSnapshot(
    doc(db, 'schoolConfig', 'default'),
    (snap) => {
      if (!snap.exists()) {
        onData(DEFAULT_SCHOOL_IDENTITY);
        return;
      }
      const d = snap.data();
      onData({
        name: String(d.name ?? DEFAULT_SCHOOL_IDENTITY.name),
        subtitle: String(d.subtitle ?? DEFAULT_SCHOOL_IDENTITY.subtitle),
        primaryColor: String(d.primaryColor ?? DEFAULT_SCHOOL_IDENTITY.primaryColor),
        logoPreset: d.logoPreset ?? DEFAULT_SCHOOL_IDENTITY.logoPreset,
        customLogoDataUrl:
          typeof d.customLogoDataUrl === 'string' && d.customLogoDataUrl
            ? d.customLogoDataUrl
            : undefined,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export async function saveSchoolConfig(
  identity: SchoolIdentity,
  adminUid: string
): Promise<void> {
  const path = 'schoolConfig/default';
  const payload: Record<string, unknown> = {
    name: identity.name.trim().slice(0, 120) || DEFAULT_SCHOOL_IDENTITY.name,
    subtitle: identity.subtitle.trim().slice(0, 120),
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(identity.primaryColor)
      ? identity.primaryColor
      : DEFAULT_SCHOOL_IDENTITY.primaryColor,
    logoPreset: identity.logoPreset,
    updatedAt: serverTimestamp(),
    updatedBy: adminUid,
  };
  if (
    identity.logoPreset === 'custom_url' &&
    identity.customLogoDataUrl &&
    identity.customLogoDataUrl.length <= 300000
  ) {
    payload.customLogoDataUrl = identity.customLogoDataUrl;
  }

  try {
    const existing = await getDoc(doc(db, 'schoolConfig', 'default'));
    if (existing.exists()) {
      await updateDoc(doc(db, 'schoolConfig', 'default'), payload);
    } else {
      await setDoc(doc(db, 'schoolConfig', 'default'), payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeAuthorizedUsers(
  onData: (users: AuthorizedTeacher[]) => void
): Unsubscribe {
  const path = 'authorizedUsers';
  return onSnapshot(
    collection(db, 'authorizedUsers'),
    (snap) => {
      const list: AuthorizedTeacher[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          email: String(d.email ?? docSnap.id),
          name: String(d.name ?? ''),
          role: d.role === 'admin' ? 'admin' : 'teacher',
          active: Boolean(d.active),
          addedAt: formatFirestoreDate(d.createdAt),
        };
      });
      list.sort((a, b) => a.email.localeCompare(b.email));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function upsertAuthorizedUser(
  params: {
    email: string;
    name: string;
    role: StaffRole;
    active: boolean;
  },
  adminUid: string
): Promise<void> {
  const emailId = normalizeEmail(params.email);
  const path = `authorizedUsers/${emailId}`;
  const docRef = doc(db, 'authorizedUsers', emailId);

  try {
    const existing = await getDoc(docRef);
    if (existing.exists()) {
      await updateDoc(docRef, {
        name: params.name.trim().slice(0, 120) || emailId.split('@')[0],
        role: params.role,
        active: params.active,
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });
    } else {
      await setDoc(docRef, {
        email: emailId,
        name: params.name.trim().slice(0, 120) || emailId.split('@')[0],
        role: params.role,
        active: params.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: adminUid,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

function mapExamDoc(id: string, d: Record<string, unknown>): ExamDefinition {
  const rawGrading =
    d.gradingConfig && typeof d.gradingConfig === 'object'
      ? (d.gradingConfig as Record<string, unknown>)
      : null;

  return {
    id,
    schemaVersion:
      typeof d.schemaVersion === 'number'
        ? d.schemaVersion
        : CURRENT_EXAM_SCHEMA_VERSION,
    slug: String(d.slug ?? id),
    title: String(d.title ?? 'Sin título'),
    subtitle: String(d.subtitle ?? ''),
    yearLabel: String(d.yearLabel ?? ''),
    course: String(d.course ?? ''),
    teachersText: String(d.teachersText ?? ''),
    ownerId: typeof d.ownerId === 'string' ? d.ownerId : undefined,
    ownerEmail: String(d.ownerEmail ?? ''),
    initialInstructions: String(d.initialInstructions ?? ''),
    maxAttempts: typeof d.maxAttempts === 'number' ? d.maxAttempts : 1,
    feedbackEnabled: Boolean(d.feedbackEnabled),
    status:
      d.status === 'publicada' || d.status === 'cerrada'
        ? d.status
        : 'borrador',
    updatedAt: formatFirestoreDate(d.updatedAt),
    publishedAt: d.publishedAt ? formatFirestoreDate(d.publishedAt) : undefined,
    submissionsCount:
      typeof d.submissionsCount === 'number' ? d.submissionsCount : 0,
    consignas: Array.isArray(d.consignas)
      ? (d.consignas as ConsignaBlock[])
      : [],
    gradingConfig: rawGrading
      ? {
          mode:
            rawGrading.mode === 'escala_personalizada'
              ? 'escala_personalizada'
              : 'libre',
          scaleLabel:
            typeof rawGrading.scaleLabel === 'string'
              ? rawGrading.scaleLabel
              : undefined,
          passingScore:
            typeof rawGrading.passingScore === 'number'
              ? rawGrading.passingScore
              : null,
          passingUnit:
            rawGrading.passingUnit === 'porcentaje' ? 'porcentaje' : 'puntos',
        }
      : undefined,
  };
}

export function subscribeTeacherExams(
  ownerId: string,
  onData: (exams: ExamDefinition[]) => void
): Unsubscribe {
  const path = 'exams';
  const q = query(collection(db, 'exams'), where('ownerId', '==', ownerId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((docSnap) =>
        mapExamDoc(docSnap.id, docSnap.data())
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeAllExams(
  onData: (exams: ExamDefinition[]) => void
): Unsubscribe {
  const path = 'exams';
  return onSnapshot(
    collection(db, 'exams'),
    (snap) => {
      const list = snap.docs.map((docSnap) =>
        mapExamDoc(docSnap.id, docSnap.data())
      );
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchExamById(
  examId: string
): Promise<ExamDefinition | null> {
  const path = `exams/${examId}`;
  try {
    const snap = await getDoc(doc(db, 'exams', examId));
    if (!snap.exists()) return null;
    return mapExamDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function buildClosedKeysMap(consignas: ConsignaBlock[]) {
  const questions: Record<
    string,
    {
      type: 'opcion_multiple' | 'verdadero_falso';
      prompt: string;
      points: number | null;
      allowMultiple?: boolean;
      correctOptionIds?: string[];
      correctBoolean?: boolean;
    }
  > = {};

  consignas.forEach((con) => {
    con.questions.forEach((q) => {
      if (q.type === 'opcion_multiple') {
        questions[q.id] = {
          type: 'opcion_multiple',
          prompt: q.prompt,
          points: typeof q.points === 'number' ? q.points : null,
          allowMultiple: Boolean(q.allowMultiple),
          correctOptionIds: (q.options ?? [])
            .filter((o) => o.isCorrect)
            .map((o) => o.id),
        };
      } else if (q.type === 'verdadero_falso') {
        questions[q.id] = {
          type: 'verdadero_falso',
          prompt: q.prompt,
          points: typeof q.points === 'number' ? q.points : null,
          correctBoolean: Boolean(q.correctBoolean),
        };
      }
    });
  });

  return questions;
}

async function syncExamClosedKeys(params: {
  examId: string;
  slug: string;
  ownerId: string;
  feedbackEnabled: boolean;
  consignas: ConsignaBlock[];
}): Promise<void> {
  const keysRef = doc(db, 'examClosedKeys', params.slug);
  const questions = params.feedbackEnabled
    ? buildClosedKeysMap(params.consignas)
    : {};
  const snap = await getDoc(keysRef);
  if (snap.exists()) {
    await updateDoc(keysRef, {
      feedbackEnabled: Boolean(params.feedbackEnabled),
      questions,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(keysRef, {
      examId: params.examId,
      slug: params.slug,
      ownerId: params.ownerId,
      feedbackEnabled: Boolean(params.feedbackEnabled),
      questions,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function saveExamDraft(
  draft: ExamDefinition,
  user: User
): Promise<{ examId: string; slug: string }> {
  const isNewLocalDraft = !draft.id || draft.id.startsWith('exam-nuevo-');
  const cleanId = !isNewLocalDraft
    ? draft.id
    : `exam_${user.uid.slice(0, 8)}_${Date.now()}`;
  const cleanSlug =
    draft.slug &&
    /^[a-z0-9-]+$/.test(draft.slug) &&
    draft.slug.length >= 3 &&
    draft.slug.length <= 128
      ? draft.slug
      : slugifyExamTitle(
          draft.title || 'evaluacion',
          `${user.uid.slice(0, 4).toLowerCase()}-${Date.now().toString().slice(-4)}`
        );

  const emailId = normalizeEmail(user.email || draft.ownerEmail || '');
  if (!emailId) {
    throw new Error('La cuenta de Google no tiene un correo electrónico verificado.');
  }
  const sanitizedConsignas = sanitizeConsignasForFirestore(draft.consignas);
  const path = `exams/${cleanId}`;
  const docRef = doc(db, 'exams', cleanId);
  let currentOp: OperationType = OperationType.WRITE;

  try {
    currentOp = OperationType.GET;
    const existingSnap = isNewLocalDraft ? null : await getDoc(docRef);
    const titleVal = (draft.title.trim() || 'Evaluación sin título').slice(0, 180);
    const courseVal = (draft.course.trim() || 'Sin curso').slice(0, 60);

    if (existingSnap?.exists()) {
      const existingData = existingSnap.data();
      if (
        existingData.status === 'publicada' &&
        (existingData.submissionsCount ?? 0) > 0
      ) {
        throw new Error(
          'Esta evaluación ya está publicada y tiene entregas registradas. Duplicála para crear una nueva versión sin alterar la original.'
        );
      }
      if (existingData.status === 'cerrada') {
        throw new Error(
          'Las evaluaciones cerradas no pueden editarse. Duplicála para generar un nuevo borrador.'
        );
      }

      const updatePayload: Record<string, unknown> = {
        schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
        slug: cleanSlug,
        title: titleVal,
        subtitle: draft.subtitle.slice(0, 180),
        yearLabel: draft.yearLabel.slice(0, 60),
        course: courseVal,
        teachersText: draft.teachersText.slice(0, 160),
        initialInstructions: draft.initialInstructions.slice(0, 2000),
        maxAttempts: 1,
        feedbackEnabled: Boolean(draft.feedbackEnabled),
        status: existingData.status === 'publicada' ? 'publicada' : 'borrador',
        consignas: sanitizedConsignas,
        updatedAt: serverTimestamp(),
      };
      currentOp = OperationType.UPDATE;
      await updateDoc(docRef, updatePayload);

      // Si seguía publicada sin entregas, mantenemos examPublic y examClosedKeys sincronizados
      if (existingData.status === 'publicada') {
        const pubRef = doc(db, 'examPublic', String(existingData.slug));
        currentOp = OperationType.GET;
        const pubSnap = await getDoc(pubRef);
        if (pubSnap.exists()) {
          currentOp = OperationType.UPDATE;
          await updateDoc(pubRef, {
            schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
            title: titleVal,
            subtitle: draft.subtitle.slice(0, 180),
            yearLabel: draft.yearLabel.slice(0, 60),
            course: courseVal,
            teachersText: draft.teachersText.slice(0, 160),
            initialInstructions: draft.initialInstructions.slice(0, 2000),
            maxAttempts: 1,
            feedbackEnabled: Boolean(draft.feedbackEnabled),
            status: 'publicada',
            consignas: sanitizeConsignasForPublic(sanitizedConsignas),
            updatedAt: serverTimestamp(),
          });
        }
        currentOp = OperationType.WRITE;
        await syncExamClosedKeys({
          examId: cleanId,
          slug: String(existingData.slug),
          ownerId: String(existingData.ownerId ?? user.uid),
          feedbackEnabled: Boolean(draft.feedbackEnabled),
          consignas: sanitizedConsignas,
        });
      }
    } else {
      currentOp = OperationType.CREATE;
      await setDoc(docRef, {
        schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
        slug: cleanSlug,
        title: titleVal,
        subtitle: draft.subtitle.slice(0, 180),
        yearLabel: draft.yearLabel.slice(0, 60),
        course: courseVal,
        teachersText: draft.teachersText.slice(0, 160),
        ownerId: user.uid,
        ownerEmail: emailId,
        initialInstructions: draft.initialInstructions.slice(0, 2000),
        maxAttempts: 1,
        feedbackEnabled: Boolean(draft.feedbackEnabled),
        status: 'borrador',
        submissionsCount: 0,
        consignas: sanitizedConsignas,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return { examId: cleanId, slug: cleanSlug };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Duplicála')) {
      throw error;
    }
    handleFirestoreError(error, currentOp, path);
  }
}

export async function publishExam(
  draft: ExamDefinition,
  user: User
): Promise<{ examId: string; slug: string }> {
  const validationErrors = validateExamForPublish(draft);
  if (validationErrors.length > 0) {
    throw new Error(validationErrors[0]);
  }

  // Primero guarda o crea el documento privado para asegurar examId y ownership
  const { examId, slug } = await saveExamDraft(draft, user);
  const sanitizedConsignas = sanitizeConsignasForFirestore(draft.consignas);
  const examRef = doc(db, 'exams', examId);
  const pubRef = doc(db, 'examPublic', slug);

  try {
    const examSnap = await getDoc(examRef);
    const existingData = examSnap.data();
    const ownerId =
      typeof existingData?.ownerId === 'string'
        ? existingData.ownerId
        : user.uid;

    await updateDoc(examRef, {
      schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
      status: 'publicada',
      publishedAt: existingData?.publishedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const publicPayload = {
      schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
      examId,
      slug,
      ownerId,
      title: draft.title.trim().slice(0, 180),
      subtitle: draft.subtitle.slice(0, 180),
      yearLabel: draft.yearLabel.slice(0, 60),
      course: draft.course.trim().slice(0, 60),
      teachersText: draft.teachersText.slice(0, 160),
      initialInstructions: draft.initialInstructions.slice(0, 2000),
      maxAttempts: 1,
      feedbackEnabled: Boolean(draft.feedbackEnabled),
      status: 'publicada',
      consignas: sanitizeConsignasForPublic(sanitizedConsignas),
      updatedAt: serverTimestamp(),
    };

    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        schemaVersion: publicPayload.schemaVersion,
        title: publicPayload.title,
        subtitle: publicPayload.subtitle,
        yearLabel: publicPayload.yearLabel,
        course: publicPayload.course,
        teachersText: publicPayload.teachersText,
        initialInstructions: publicPayload.initialInstructions,
        maxAttempts: publicPayload.maxAttempts,
        feedbackEnabled: publicPayload.feedbackEnabled,
        status: 'publicada',
        consignas: publicPayload.consignas,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(pubRef, {
        ...publicPayload,
        publishedAt: serverTimestamp(),
      });
    }

    await syncExamClosedKeys({
      examId,
      slug,
      ownerId,
      feedbackEnabled: Boolean(draft.feedbackEnabled),
      consignas: sanitizedConsignas,
    });

    return { examId, slug };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `examPublic/${slug}`);
  }
}

export async function duplicateExamInFirestore(
  source: ExamDefinition,
  targetCourse: string,
  user: User
): Promise<string> {
  const newId = `exam_${user.uid.slice(0, 8)}_${Date.now()}`;
  const newSlug = slugifyExamTitle(
    `${source.title}-copia`,
    `${user.uid.slice(0, 4).toLowerCase()}-${Date.now().toString().slice(-4)}`
  );
  const emailId = normalizeEmail(user.email || '');
  const path = `exams/${newId}`;

  try {
    await setDoc(doc(db, 'exams', newId), {
      schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
      slug: newSlug,
      title: `${source.title} (Copia)`.slice(0, 180),
      subtitle: source.subtitle.slice(0, 180),
      yearLabel: source.yearLabel.slice(0, 60),
      course: (targetCourse.trim() || source.course).slice(0, 60),
      teachersText: (user.displayName || source.teachersText).slice(0, 160),
      ownerId: user.uid,
      ownerEmail: emailId,
      initialInstructions: source.initialInstructions.slice(0, 2000),
      maxAttempts: 1,
      feedbackEnabled: Boolean(source.feedbackEnabled),
      status: 'borrador',
      submissionsCount: 0,
      consignas: sanitizeConsignasForFirestore(source.consignas),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function closeExamInFirestore(exam: ExamDefinition): Promise<void> {
  const examPath = `exams/${exam.id}`;
  try {
    await updateDoc(doc(db, 'exams', exam.id), {
      status: 'cerrada',
      updatedAt: serverTimestamp(),
    });
    const pubRef = doc(db, 'examPublic', exam.slug);
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        status: 'cerrada',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, examPath);
  }
}

export async function saveSampleExamToFirestore(
  template: ExamDefinition,
  user: User
): Promise<string> {
  const newId = `exam_${user.uid.slice(0, 8)}_${Date.now()}`;
  const slug = `${template.slug}-${user.uid.slice(0, 4).toLowerCase()}-${Date.now().toString().slice(-4)}`;
  const draft: ExamDefinition = {
    ...template,
    id: newId,
    slug,
    schemaVersion: CURRENT_EXAM_SCHEMA_VERSION,
    teachersText: user.displayName || template.teachersText,
    ownerId: user.uid,
    ownerEmail: normalizeEmail(user.email || ''),
    submissionsCount: 0,
  };
  await publishExam(draft, user);
  return slug;
}

export async function fetchPublicExamBySlug(
  slug: string
): Promise<ExamDefinition | null> {
  try {
    const snap = await getDoc(doc(db, 'examPublic', slug));
    if (!snap.exists()) return null;
    const d = snap.data();
    if (d.status !== 'publicada') return null;
    return mapExamDoc(String(d.examId ?? snap.id), d);
  } catch {
    return null;
  }
}

export async function saveExamGradingConfig(
  examId: string,
  config: ExamGradingConfig
): Promise<void> {
  const path = `exams/${examId}`;
  const cleanConfig: Record<string, unknown> = {
    mode: config.mode,
    scaleLabel: (config.scaleLabel ?? '').trim().slice(0, 60),
    passingUnit: config.passingUnit === 'porcentaje' ? 'porcentaje' : 'puntos',
    passingScore:
      typeof config.passingScore === 'number' && !Number.isNaN(config.passingScore)
        ? Math.max(0, Number(config.passingScore.toFixed(2)))
        : null,
  };
  try {
    await updateDoc(doc(db, 'exams', examId), {
      gradingConfig: cleanConfig,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeExamAttempts(
  examId: string,
  ownerId: string | undefined,
  isAdminUser: boolean,
  onData: (attempts: ExamAttemptRecord[]) => void,
  onError?: (message: string) => void
): Unsubscribe {
  const path = 'attempts';
  const q = isAdminUser
    ? query(collection(db, 'attempts'), where('examId', '==', examId))
    : query(
        collection(db, 'attempts'),
        where('examId', '==', examId),
        where('examOwnerId', '==', ownerId ?? '')
      );

  return onSnapshot(
    q,
    (snap) => {
      const list: ExamAttemptRecord[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        const submittedTs = d.submittedAt;
        const submittedAtMs =
          submittedTs instanceof Timestamp ? submittedTs.toMillis() : 0;

        return {
          id: docSnap.id,
          examId: String(d.examId ?? examId),
          examSlug: String(d.examSlug ?? ''),
          attemptCode: docSnap.id.slice(-8).toUpperCase(),
          participantKey: String(d.participantKey ?? ''),
          participantName: String(d.participantName ?? ''),
          attemptNumber:
            typeof d.attemptNumber === 'number' ? d.attemptNumber : 1,
          submittedAt: formatFirestoreDate(d.submittedAt),
          submittedAtMs,
          rawAnswers:
            d.answers && typeof d.answers === 'object'
              ? (d.answers as Record<string, StudentAnswerValue>)
              : {},
          closedFeedback: Array.isArray(d.closedFeedback)
            ? (d.closedFeedback as ClosedFeedbackItem[])
            : [],
          autoScore: typeof d.autoScore === 'number' ? d.autoScore : null,
          maxAutoScore:
            typeof d.maxAutoScore === 'number' ? d.maxAutoScore : null,
          manualScore:
            typeof d.manualScore === 'number' ? d.manualScore : null,
          totalScore: typeof d.totalScore === 'number' ? d.totalScore : null,
          maxTotalScore:
            typeof d.maxTotalScore === 'number' ? d.maxTotalScore : null,
          manualScores:
            d.manualScores && typeof d.manualScores === 'object'
              ? (d.manualScores as Record<string, number | null>)
              : {},
          tableRowScores:
            d.tableRowScores && typeof d.tableRowScores === 'object'
              ? (d.tableRowScores as Record<string, Record<string, number | null>>)
              : {},
          questionNotes:
            d.questionNotes && typeof d.questionNotes === 'object'
              ? (d.questionNotes as Record<string, string>)
              : {},
          hasPendingManualGrading: Boolean(d.hasPendingManualGrading),
          correctionStatus:
            d.correctionStatus === 'corregida' ? 'corregida' : 'pendiente',
          resultStatus:
            d.resultStatus === 'aprobado' || d.resultStatus === 'desaprobado'
              ? d.resultStatus
              : 'pendiente',
          finalGrade: typeof d.finalGrade === 'string' ? d.finalGrade : null,
          gradedByUid:
            typeof d.gradedByUid === 'string' ? d.gradedByUid : undefined,
          gradedByName:
            typeof d.gradedByName === 'string' ? d.gradedByName : undefined,
          gradedByEmail:
            typeof d.gradedByEmail === 'string' ? d.gradedByEmail : undefined,
          gradedAt: d.gradedAt ? formatFirestoreDate(d.gradedAt) : undefined,
        };
      });

      // Ordenar del más reciente al más antiguo
      list.sort((a, b) => b.submittedAtMs - a.submittedAtMs);
      onData(list);
    },
    (error) => {
      if (onError) {
        onError(
          error instanceof Error
            ? error.message
            : 'No se pudieron cargar las entregas desde Cloud Firestore.'
        );
        return;
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveAttemptGrading(params: {
  attemptId: string;
  manualScores: Record<string, number | null>;
  tableRowScores: Record<string, Record<string, number | null>>;
  questionNotes: Record<string, string>;
  autoScore: number | null;
  maxAutoScore: number | null;
  manualScore: number | null;
  totalScore: number | null;
  maxTotalScore: number | null;
  correctionStatus: 'pendiente' | 'corregida';
  resultStatus: 'pendiente' | 'aprobado' | 'desaprobado';
  finalGrade: string | null;
  graderUser: User;
  graderDisplayName: string;
}): Promise<void> {
  const path = `attempts/${params.attemptId}`;
  const graderEmail = normalizeEmail(params.graderUser.email || '');
  if (!graderEmail) {
    throw new Error('La cuenta del docente no tiene correo verificado.');
  }

  const cleanNotes: Record<string, string> = {};
  for (const [k, v] of Object.entries(params.questionNotes)) {
    const trimmed = v.trim().slice(0, 2000);
    if (trimmed) cleanNotes[k] = trimmed;
  }

  try {
    await updateDoc(doc(db, 'attempts', params.attemptId), {
      manualScores: params.manualScores,
      tableRowScores: params.tableRowScores,
      questionNotes: cleanNotes,
      autoScore: params.autoScore,
      maxAutoScore: params.maxAutoScore,
      manualScore: params.manualScore,
      totalScore: params.totalScore,
      maxTotalScore: params.maxTotalScore,
      correctionStatus: params.correctionStatus,
      resultStatus: params.resultStatus,
      finalGrade: params.finalGrade ? params.finalGrade.trim().slice(0, 40) : null,
      gradedByUid: params.graderUser.uid,
      gradedByName: params.graderDisplayName.trim().slice(0, 120) || graderEmail,
      gradedByEmail: graderEmail,
      gradedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
