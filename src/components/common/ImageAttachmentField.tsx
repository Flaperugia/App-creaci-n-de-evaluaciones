import React, { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  Check,
  ImageOff,
  Link2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { QuestionImage } from '../../types/assessment';
import { validateHttpsImageUrl } from '../../utils/imageUrl';

interface ImageAttachmentFieldProps {
  image?: QuestionImage;
  label: string;
  disabled?: boolean;
  onChange: (next: QuestionImage | undefined) => void;
}

export function ImageAttachmentField({
  image,
  label,
  disabled = false,
  onChange,
}: ImageAttachmentFieldProps) {
  const urlInputId = useId();
  const altId = useId();

  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [draftUrl, setDraftUrl] = useState(image?.url ?? '');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    setDraftUrl(image?.url ?? '');
    setPreviewError(false);
    setUrlError(null);
    if (!image) {
      setIsEditingUrl(false);
    }
  }, [image?.url]);

  const applyUrl = () => {
    if (disabled) return;
    const validation = validateHttpsImageUrl(draftUrl);
    if (!validation.valid || !validation.normalizedUrl) {
      setUrlError(validation.error ?? 'Ingresá una URL HTTPS válida.');
      return;
    }

    setUrlError(null);
    setPreviewError(false);
    onChange({
      url: validation.normalizedUrl,
      alt: image?.alt ?? '',
    });
    setIsEditingUrl(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyUrl();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditingUrl(false);
      setUrlError(null);
      setDraftUrl(image?.url ?? '');
    }
  };

  const handleRemove = () => {
    if (disabled) return;
    setUrlError(null);
    setPreviewError(false);
    setDraftUrl('');
    setIsEditingUrl(false);
    onChange(undefined);
  };

  if (!image && !isEditingUrl) {
    return (
      <div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setUrlError(null);
            setDraftUrl('');
            setIsEditingUrl(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-[#FAFBFD] px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Link2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          <span>{label} (URL HTTPS)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-3.5 space-y-3">
      {(!image || isEditingUrl) && (
        <div className="space-y-2">
          <label
            htmlFor={urlInputId}
            className="block text-xs font-semibold text-slate-700"
          >
            Pegar enlace HTTPS de la imagen
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id={urlInputId}
              type="url"
              disabled={disabled}
              value={draftUrl}
              onChange={(e) => {
                setDraftUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="https://ejemplo.com/imagen.png"
              className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] focus:border-[var(--brand-primary)] focus:outline-none disabled:bg-slate-100"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={applyUrl}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{image ? 'Actualizar URL' : 'Agregar imagen'}</span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setIsEditingUrl(false);
                  setUrlError(null);
                  setDraftUrl(image?.url ?? '');
                }}
                className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Solo se guardará la URL en Firestore. Asegurate de usar un enlace
            directo <span className="font-mono-tabular">https://</span> visible
            para los estudiantes.
          </p>
        </div>
      )}

      {image && !isEditingUrl && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          {previewError ? (
            <div className="flex h-32 w-full sm:w-44 shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-center text-[11px] text-amber-900">
              <ImageOff className="h-5 w-5 text-amber-700" aria-hidden="true" />
              <span>No se pudo cargar la vista previa desde esta URL.</span>
            </div>
          ) : (
            <img
              src={image.url}
              alt={image.alt || 'Vista previa de imagen adjunta'}
              referrerPolicy="no-referrer"
              onLoad={() => setPreviewError(false)}
              onError={() => setPreviewError(true)}
              className="h-32 w-full sm:w-44 shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
            />
          )}

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                title={image.url}
                className="text-xs font-mono-tabular text-slate-600 truncate max-w-full sm:max-w-[260px]"
              >
                {image.url}
              </span>

              {!disabled && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftUrl(image.url);
                      setUrlError(null);
                      setIsEditingUrl(true);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0F1E36] hover:bg-slate-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reemplazar</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Quitar</span>
                  </button>
                </div>
              )}
            </div>

            {previewError && (
              <p className="text-xs text-amber-800">
                Verificá que la dirección comience con https:// y permita verse
                sin iniciar sesión. Podés reemplazar la URL o quitarla.
              </p>
            )}

            <div className="space-y-1">
              <label
                htmlFor={altId}
                className="block text-xs font-medium text-slate-600"
              >
                Descripción accesible (opcional)
              </label>
              <input
                id={altId}
                type="text"
                maxLength={240}
                disabled={disabled}
                value={image.alt}
                onChange={(e) =>
                  onChange({
                    ...image,
                    alt: e.target.value,
                  })
                }
                placeholder="Breve descripción de la imagen..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] disabled:bg-slate-100"
              />
            </div>
          </div>
        </div>
      )}

      {urlError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-700" />
          <span>{urlError}</span>
        </div>
      )}
    </div>
  );
}
