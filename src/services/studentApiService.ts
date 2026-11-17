import {
  ExamDefinition,
  QuestionItem,
  StudentAnswerValue,
  StudentSessionDraft,
  SubmittedAttemptReceipt,
} from '../types/assessment';

export class StudentApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'StudentApiError';
    this.status = status;
    this.code = code;
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

const DRAFT_STORAGE_PREFIX = 'eval_student_draft_v1_';
const RECEIPT_STORAGE_PREFIX = 'eval_student_receipt_v1_';

async function requestJson<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new StudentApiError(
      'No hay conexión con el servidor. Verificá tu red e intentá nuevamente.',
      0,
      'NETWORK_ERROR'
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      typeof payload.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : 'Ocurrió un error al comunicarse con el servidor.';
    const code =
      typeof payload.code === 'string' ? payload.code : undefined;
    throw new StudentApiError(message, response.status, code);
  }

  return payload as T;
}

export async function fetchPublicExamFromBackend(
  slug: string
): Promise<ExamDefinition> {
  const data = await requestJson<{ exam: ExamDefinition }>(
    `/api/public/exams/${encodeURIComponent(slug)}`,
    { method: 'GET' }
  );
  return data.exam;
}

export async function startStudentAttempt(
  slug: string,
  participantName: string
): Promise<StartAttemptResponse> {
  return requestJson<StartAttemptResponse>('/api/student/attempts/start', {
    method: 'POST',
    body: JSON.stringify({ slug, participantName }),
  });
}

export async function fetchStudentProgress(
  slug: string,
  participantKey: string
): Promise<ProgressLookupResponse> {
  const qs = new URLSearchParams({ slug, participantKey }).toString();
  return requestJson<ProgressLookupResponse>(
    `/api/student/attempts/progress?${qs}`,
    { method: 'GET' }
  );
}

export async function saveStudentProgress(params: {
  slug: string;
  participantKey: string;
  participantName: string;
  idempotencyKey: string;
  currentStepIndex: number;
  answers: Record<string, StudentAnswerValue>;
}): Promise<{ ok: boolean; savedAt: string }> {
  return requestJson<{ ok: boolean; savedAt: string }>(
    '/api/student/attempts/progress',
    {
      method: 'PUT',
      body: JSON.stringify(params),
    }
  );
}

export async function submitStudentAttempt(params: {
  slug: string;
  participantName: string;
  participantKey: string;
  idempotencyKey: string;
  answers: Record<string, StudentAnswerValue>;
}): Promise<{ idempotentReplay: boolean; receipt: SubmittedAttemptReceipt }> {
  return requestJson<{
    idempotentReplay: boolean;
    receipt: SubmittedAttemptReceipt;
  }>('/api/student/attempts/submit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchStudentReceipt(
  attemptId: string
): Promise<SubmittedAttemptReceipt> {
  const data = await requestJson<{ receipt: SubmittedAttemptReceipt }>(
    `/api/student/attempts/${encodeURIComponent(attemptId)}`,
    { method: 'GET' }
  );
  return data.receipt;
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
