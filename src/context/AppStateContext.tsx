import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { DEFAULT_SCHOOL_IDENTITY } from '../data/sampleData';
import { auth, googleProvider } from '../lib/firebase';
import {
  bootstrapFirstAdmin,
  fetchMyAuthorization,
  saveSchoolConfig,
  subscribeAllExams,
  subscribeAuthorizedUsers,
  subscribeSchoolConfig,
  subscribeTeacherExams,
  upsertAuthorizedUser,
} from '../services/firestoreService';
import {
  AuthorizedTeacher,
  AuthStatus,
  ExamDefinition,
  SampleSubmission,
  SchoolIdentity,
  StaffRole,
  StudentAnswerValue,
  StudentSessionDraft,
  SubmittedAttemptReceipt,
} from '../types/assessment';

interface AppStateContextValue {
  authReady: boolean;
  firebaseUser: User | null;
  authRecord: AuthorizedTeacher | null;
  authStatus: AuthStatus;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshAuthorization: () => Promise<void>;
  tryBootstrapAdmin: () => Promise<void>;
  schoolIdentity: SchoolIdentity;
  updateSchoolIdentity: (patch: Partial<SchoolIdentity>) => void;
  persistSchoolIdentity: (identity: SchoolIdentity) => Promise<void>;
  exams: ExamDefinition[];
  setExams: React.Dispatch<React.SetStateAction<ExamDefinition[]>>;
  allSchoolExams: ExamDefinition[];
  teachers: AuthorizedTeacher[];
  saveAuthorizedUser: (params: {
    email: string;
    name: string;
    role: StaffRole;
    active: boolean;
  }) => Promise<void>;
  sampleSubmissions: SampleSubmission[];
  setSampleSubmissions: React.Dispatch<React.SetStateAction<SampleSubmission[]>>;
  studentDraft: StudentSessionDraft | null;
  hydrateStudentDraft: (draft: StudentSessionDraft) => void;
  updateStudentDraftMeta: (patch: Partial<StudentSessionDraft>) => void;
  startStudentDraft: (examSlug: string, studentName: string) => void;
  updateStudentAnswer: (questionId: string, answer: StudentAnswerValue) => void;
  setStudentStep: (stepIndex: number) => void;
  markStudentLocalSave: () => void;
  resetStudentDraft: () => void;
  lastReceipt: SubmittedAttemptReceipt | null;
  setLastReceipt: (receipt: SubmittedAttemptReceipt | null) => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function darkenHex(hex: string, factor = 0.2): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#082d56';
  const r = Math.max(0, Math.round(rgb.r * (1 - factor)));
  const g = Math.max(0, Math.round(rgb.g * (1 - factor)));
  const b = Math.max(0, Math.round(rgb.b * (1 - factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b)
  );
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getRelativeLuminance(hexA);
  const l2 = getRelativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authRecord, setAuthRecord] = useState<AuthorizedTeacher | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [authError, setAuthError] = useState<string | null>(null);

  const [schoolIdentity, setSchoolIdentity] = useState<SchoolIdentity>(
    DEFAULT_SCHOOL_IDENTITY
  );
  const [exams, setExams] = useState<ExamDefinition[]>([]);
  const [allSchoolExams, setAllSchoolExams] = useState<ExamDefinition[]>([]);
  const [teachers, setTeachers] = useState<AuthorizedTeacher[]>([]);
  const [sampleSubmissions, setSampleSubmissions] = useState<
    SampleSubmission[]
  >([]);
  const [studentDraft, setStudentDraft] = useState<StudentSessionDraft | null>(
    null
  );
  const [lastReceipt, setLastReceipt] = useState<SubmittedAttemptReceipt | null>(
    null
  );

  // Sync CSS custom properties from Firestore schoolConfig
  useEffect(() => {
    const root = document.documentElement;
    const primary = schoolIdentity.primaryColor || '#0B3B70';
    const rgb = hexToRgb(primary) ?? { r: 11, g: 59, b: 112 };
    const onPrimary = getRelativeLuminance(primary) > 0.42 ? '#0F1E36' : '#FFFFFF';
    root.style.setProperty('--brand-primary', primary);
    root.style.setProperty('--brand-primary-hover', darkenHex(primary, 0.18));
    root.style.setProperty(
      '--brand-primary-soft',
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`
    );
    root.style.setProperty('--brand-primary-text', primary);
    root.style.setProperty('--brand-on-primary', onPrimary);
    root.style.setProperty('--brand-ring', primary);
    document.title = `Plataforma de Evaluaciones · ${schoolIdentity.name}`;
  }, [schoolIdentity]);

  // Listen to public schoolConfig/default
  useEffect(() => {
    const unsub = subscribeSchoolConfig((cfg) => {
      setSchoolIdentity(cfg);
    });
    return () => unsub();
  }, []);

  const resolveUserAuthorization = async (user: User | null) => {
    if (!user) {
      setAuthRecord(null);
      setAuthStatus('unauthenticated');
      setAuthReady(true);
      return;
    }

    if (!user.email || !user.emailVerified) {
      setAuthRecord(null);
      setAuthStatus('unauthorized');
      setAuthReady(true);
      return;
    }

    try {
      const record = await fetchMyAuthorization(user.email);
      setAuthRecord(record);
      if (!record) {
        setAuthStatus('unauthorized');
      } else if (!record.active) {
        setAuthStatus('inactive');
      } else {
        setAuthStatus(record.role);
      }
    } catch {
      setAuthRecord(null);
      setAuthStatus('unauthorized');
    } finally {
      setAuthReady(true);
    }
  };

  // Listen to Firebase Authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      void resolveUserAuthorization(user);
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore internal collections ONLY when authorized
  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      (authStatus !== 'teacher' && authStatus !== 'admin')
    ) {
      setExams([]);
      setAllSchoolExams([]);
      setTeachers([]);
      return;
    }

    const unsubs: (() => void)[] = [];

    // Every teacher/admin sees their own exams via ownerId query
    unsubs.push(
      subscribeTeacherExams(firebaseUser.uid, (list) => {
        setExams(list);
      })
    );

    // Only admin subscribes to authorizedUsers list and all school exams
    if (authStatus === 'admin') {
      unsubs.push(
        subscribeAuthorizedUsers((list) => {
          setTeachers(list);
        })
      );
      unsubs.push(
        subscribeAllExams((list) => {
          setAllSchoolExams(list);
        })
      );
    } else {
      setTeachers([]);
      setAllSchoolExams([]);
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, authStatus, firebaseUser]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo completar el inicio de sesión con Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(
          'No se pudo iniciar sesión con Google. Verificá que las ventanas emergentes estén habilitadas.'
        );
      }
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    setAuthRecord(null);
    setAuthStatus('unauthenticated');
    setExams([]);
    setAllSchoolExams([]);
    setTeachers([]);
  };

  const refreshAuthorization = async () => {
    await resolveUserAuthorization(firebaseUser);
  };

  const tryBootstrapAdmin = async () => {
    if (!firebaseUser) return;
    await bootstrapFirstAdmin(firebaseUser);
    await resolveUserAuthorization(firebaseUser);
  };

  const updateSchoolIdentity = (patch: Partial<SchoolIdentity>) => {
    setSchoolIdentity((prev) => ({ ...prev, ...patch }));
  };

  const persistSchoolIdentity = async (identity: SchoolIdentity) => {
    if (!firebaseUser || authStatus !== 'admin') {
      throw new Error('Solo un administrador activo puede guardar la identidad escolar.');
    }
    await saveSchoolConfig(identity, firebaseUser.uid);
  };

  const saveAuthorizedUser = async (params: {
    email: string;
    name: string;
    role: StaffRole;
    active: boolean;
  }) => {
    if (!firebaseUser || authStatus !== 'admin') {
      throw new Error('Solo un administrador activo puede gestionar usuarios autorizados.');
    }
    await upsertAuthorizedUser(params, firebaseUser.uid);
  };

  const hydrateStudentDraft = useCallback((draft: StudentSessionDraft) => {
    setStudentDraft(draft);
  }, []);

  const updateStudentDraftMeta = useCallback(
    (patch: Partial<StudentSessionDraft>) => {
      setStudentDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    []
  );

  const startStudentDraft = useCallback(
    (examSlug: string, studentName: string) => {
      setStudentDraft((prev) => {
        if (prev && prev.examSlug === examSlug) {
          return { ...prev, studentName };
        }
        return {
          examSlug,
          studentName,
          startedAt: new Date().toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          currentStepIndex: 0,
          answers: {},
        };
      });
    },
    []
  );

  const updateStudentAnswer = useCallback(
    (questionId: string, answer: StudentAnswerValue) => {
      setStudentDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          answers: {
            ...prev.answers,
            [questionId]: answer,
          },
        };
      });
    },
    []
  );

  const setStudentStep = useCallback((stepIndex: number) => {
    setStudentDraft((prev) =>
      prev ? { ...prev, currentStepIndex: stepIndex } : prev
    );
  }, []);

  const markStudentLocalSave = useCallback(() => {
    const time = new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setStudentDraft((prev) =>
      prev ? { ...prev, lastSavedLocallyAt: time } : prev
    );
  }, []);

  const resetStudentDraft = useCallback(() => setStudentDraft(null), []);

  return (
    <AppStateContext.Provider
      value={{
        authReady,
        firebaseUser,
        authRecord,
        authStatus,
        authError,
        signInWithGoogle,
        signOutUser,
        refreshAuthorization,
        tryBootstrapAdmin,
        schoolIdentity,
        updateSchoolIdentity,
        persistSchoolIdentity,
        exams,
        setExams,
        allSchoolExams,
        teachers,
        saveAuthorizedUser,
        sampleSubmissions,
        setSampleSubmissions,
        studentDraft,
        hydrateStudentDraft,
        updateStudentDraftMeta,
        startStudentDraft,
        updateStudentAnswer,
        setStudentStep,
        markStudentLocalSave,
        resetStudentDraft,
        lastReceipt,
        setLastReceipt,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
