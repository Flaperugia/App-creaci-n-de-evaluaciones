export interface ImageUrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
}

export function validateHttpsImageUrl(rawUrl: string): ImageUrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Ingresá una URL que comience con https://.',
    };
  }
  if (trimmed.length > 2000) {
    return {
      valid: false,
      error: 'La URL de la imagen no puede superar los 2000 caracteres.',
    };
  }

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:') || lower.startsWith('blob:')) {
    return {
      valid: false,
      error:
        'No se admiten imágenes en base64 ni enlaces locales. Pegá una URL pública con https://.',
    };
  }
  if (lower.startsWith('javascript:')) {
    return {
      valid: false,
      error: 'El enlace ingresado no es válido.',
    };
  }
  if (lower.startsWith('http://')) {
    return {
      valid: false,
      error: 'Por seguridad, la URL de la imagen debe usar https:// (no http://).',
    };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || !parsed.hostname) {
      return {
        valid: false,
        error: 'Ingresá una dirección web válida que comience con https://.',
      };
    }
    return { valid: true, normalizedUrl: parsed.toString() };
  } catch {
    return {
      valid: false,
      error:
        'Formato de URL inválido. Ejemplo: https://ejemplo.com/imagen.png',
    };
  }
}
