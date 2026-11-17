export type StaffRole = 'teacher' | 'admin';
export type UserRole = StaffRole | 'estudiante';

export type AuthStatus =
  | 'loading'
  | 'unauthenticated'
  | 'unauthorized'
  | 'inactive'
  | 'teacher'
  | 'admin';

export type ExamStatus = 'borrador' | 'publicada' | 'cerrada';

export type QuestionType =
  | 'abierta'
  | 'opcion_multiple'
  | 'verdadero_falso'
  | 'relacionar'
  | 'clasificar'
  | 'cuadro_comparativo';

export type LogoPreset = 'laurel_book' | 'technical_shield' | 'academic_pillar' | 'custom_url';

export interface SchoolIdentity {
  name: string;
  subtitle: string;
  primaryColor: string;
  logoPreset: LogoPreset;
  customLogoDataUrl?: string;
}

export interface AuthorizedTeacher {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  addedAt: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  isCorrect?: boolean;
}

export interface MatchPair {
  id: string;
  left: string;
  right: string;
}

export interface ClassifyItem {
  id: string;
  text: string;
  category: string;
}

export interface ComparativeRow {
  id: string;
  criterion: string;
  points?: number;
  modelAnswers?: Record<string, string>;
}

export interface ComparativeColumn {
  id: string;
  title: string;
}

export interface ComparativeTableConfig {
  criteriaHeader: string;
  columns: ComparativeColumn[];
  rows: ComparativeRow[];
  scoringMode: 'por_fila' | 'por_celda';
}

export const CURRENT_EXAM_SCHEMA_VERSION = 1;

export interface QuestionImage {
  url: string;
  storagePath?: string;
  alt: string;
  fileName: string;
}

export interface QuestionItem {
  id: string;
  type: QuestionType;
  label?: string;
  prompt: string;
  points: number | null;
  image?: QuestionImage;
  options?: QuestionOption[];
  allowMultiple?: boolean;
  correctBoolean?: boolean;
  matchPairs?: MatchPair[];
  categories?: string[];
  classifyItems?: ClassifyItem[];
  comparativeTable?: ComparativeTableConfig;
  modelAnswer?: string;
}

export interface ConsignaBlock {
  id: string;
  order: number;
  title: string;
  instructions: string;
  contextBoxTitle?: string;
  contextBoxText?: string;
  image?: QuestionImage;
  questions: QuestionItem[];
}

export interface ExamGradingConfig {
  mode: 'libre' | 'escala_personalizada';
  scaleLabel?: string;
  passingScore?: number | null;
  passingUnit?: 'puntos' | 'porcentaje';
}

export interface ExamDefinition {
  id: string;
  schemaVersion?: number;
  slug: string;
  title: string;
  subtitle: string;
  yearLabel: string;
  course: string;
  teachersText: string;
  ownerId?: string;
  ownerEmail: string;
  initialInstructions: string;
  maxAttempts: number;
  feedbackEnabled: boolean;
  status: ExamStatus;
  updatedAt: string;
  publishedAt?: string;
  submissionsCount: number;
  consignas: ConsignaBlock[];
  gradingConfig?: ExamGradingConfig;
}

export interface SampleQuestionGrade {
  questionId: string;
  studentResponseText?: string;
  studentTableValues?: Record<string, Record<string, string>>;
  selectedOptionIds?: string[];
  selectedBoolean?: boolean | null;
  awardedPoints: number | null;
  maxPoints: number | null;
  isAutoGraded: boolean;
}

export interface SampleSubmission {
  id: string;
  examId: string;
  attemptCode: string;
  participantName: string;
  attemptNumber: number;
  totalAttempts: number;
  submittedAt: string;
  autoScore: number | null;
  manualScore: number | null;
  finalGrade: string | null;
  correctionStatus: 'pendiente' | 'corregida';
  resultStatus: 'pendiente' | 'aprobado' | 'desaprobado';
  answers: SampleQuestionGrade[];
}

export interface ExamAttemptRecord {
  id: string;
  examId: string;
  examSlug: string;
  attemptCode: string;
  participantKey: string;
  participantName: string;
  attemptNumber: number;
  submittedAt: string;
  submittedAtMs: number;
  rawAnswers: Record<string, StudentAnswerValue>;
  closedFeedback: ClosedFeedbackItem[];
  autoScore: number | null;
  maxAutoScore: number | null;
  manualScore: number | null;
  totalScore: number | null;
  maxTotalScore: number | null;
  manualScores: Record<string, number | null>;
  tableRowScores: Record<string, Record<string, number | null>>;
  questionNotes: Record<string, string>;
  hasPendingManualGrading: boolean;
  correctionStatus: 'pendiente' | 'corregida';
  resultStatus: 'pendiente' | 'aprobado' | 'desaprobado';
  finalGrade: string | null;
  gradedByUid?: string;
  gradedByName?: string;
  gradedByEmail?: string;
  gradedAt?: string;
}

export type StudentAnswerValue =
  | { type: 'abierta'; text: string }
  | { type: 'opcion_multiple'; selectedIds: string[] }
  | { type: 'verdadero_falso'; value: boolean | null }
  | { type: 'relacionar'; mapping: Record<string, string> }
  | { type: 'clasificar'; assignments: Record<string, string> }
  | { type: 'cuadro_comparativo'; cells: Record<string, Record<string, string>> };

export interface StudentSessionDraft {
  examSlug: string;
  examId?: string;
  participantKey?: string;
  studentName: string;
  idempotencyKey?: string;
  attemptNumber?: number;
  maxAttempts?: number;
  startedAt: string;
  currentStepIndex: number;
  answers: Record<string, StudentAnswerValue>;
  lastSavedLocallyAt?: string;
  lastSyncedCloudAt?: string;
}

export interface ClosedFeedbackItem {
  questionId: string;
  prompt: string;
  questionType: 'opcion_multiple' | 'verdadero_falso';
  studentAnswerLabel: string;
  isCorrect: boolean;
  pointsAwarded: number | null;
  maxPoints: number | null;
}

export interface SubmittedAttemptReceipt {
  attemptId: string;
  attemptCode: string;
  examId: string;
  examSlug: string;
  examTitle: string;
  course: string;
  teachersText: string;
  participantName: string;
  participantKey: string;
  attemptNumber: number;
  maxAttempts: number;
  feedbackEnabled: boolean;
  closedFeedback: ClosedFeedbackItem[];
  autoScore: number | null;
  maxAutoScore: number | null;
  hasPendingManualGrading: boolean;
  submittedAtIso: string;
  submittedAtFormatted: string;
}

