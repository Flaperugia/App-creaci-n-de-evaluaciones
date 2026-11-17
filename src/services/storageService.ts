import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { hasStorageConfig, storage } from '../lib/firebase';
import { QuestionImage } from '../types/assessment';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

export function validateImageFile(file: File): string | null {
  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number]
    )
  ) {
    return 'Solo se admiten imágenes en formato JPG o PNG.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'La imagen supera el tamaño máximo permitido de 5 MB.';
  }
  return null;
}

export async function uploadExamImage(params: {
  file: File;
  ownerId: string;
  examId: string;
  alt: string;
  previousStoragePath?: string;
}): Promise<QuestionImage> {
  const validationError = validateImageFile(params.file);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!hasStorageConfig || !storage) {
    throw new Error(
      'Firebase Storage no está configurado en este proyecto (falta storageBucket). Configurá Storage en la consola de Firebase antes de subir imágenes.'
    );
  }

  const safeName = params.file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const storagePath = `exams/${params.ownerId}/${params.examId}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, storagePath);

  try {
    const snapshot = await uploadBytes(storageRef, params.file, {
      contentType: params.file.type,
    });
    const url = await getDownloadURL(snapshot.ref);

    if (params.previousStoragePath) {
      await deleteExamImage(params.previousStoragePath);
    }

    return {
      url,
      storagePath,
      alt: params.alt,
      fileName: params.file.name,
    };
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';

    if (
      code === 'storage/bucket-not-found' ||
      code === 'storage/project-not-found' ||
      code === 'storage/invalid-argument'
    ) {
      throw new Error(
        'Firebase Storage no está habilitado o su bucket no existe en Firebase Console. Activalo en Storage antes de subir imágenes.'
      );
    }

    if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
      throw new Error(
        'Firebase Storage rechazó la subida por reglas de seguridad (storage/unauthorized). Verificá las reglas de Firebase Storage en la consola para permitir escritura a docentes autenticados.'
      );
    }

    throw new Error(
      'No se pudo subir la imagen a Firebase Storage. Verificá que Storage esté configurado, habilitado en Firebase Console y con reglas vigentes.'
    );
  }
}

export async function deleteExamImage(storagePath?: string): Promise<void> {
  if (!storagePath || !hasStorageConfig || !storage) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // Si el objeto ya no existe o las reglas no permiten borrarlo, no bloqueamos el flujo del editor.
  }
}
