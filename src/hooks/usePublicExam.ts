import { useCallback, useEffect, useState } from 'react';
import {
  fetchPublicExamFromBackend,
  StudentApiError,
} from '../services/studentApiService';
import { ExamDefinition } from '../types/assessment';

export type PublicExamErrorType = 'not_found' | 'closed' | 'network' | null;

export function usePublicExam(slug: string | undefined) {
  const [exam, setExam] = useState<ExamDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorType, setErrorType] = useState<PublicExamErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const reload = useCallback(() => {
    setReloadNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!slug) {
        setExam(null);
        setErrorType('not_found');
        setErrorMessage('El enlace de evaluación no es válido.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorType(null);
      setErrorMessage(null);

      try {
        const result = await fetchPublicExamFromBackend(slug);
        if (!cancelled) {
          setExam(result);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        setExam(null);
        if (err instanceof StudentApiError) {
          if (err.status === 410) {
            setErrorType('closed');
          } else if (err.status === 404 || err.status === 400) {
            setErrorType('not_found');
          } else {
            setErrorType('network');
          }
          setErrorMessage(err.message);
        } else {
          setErrorType('network');
          setErrorMessage(
            'No se pudo cargar la evaluación. Verificá tu conexión e intentá nuevamente.'
          );
        }
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, reloadNonce]);

  return { exam, loading, errorType, errorMessage, reload };
}
