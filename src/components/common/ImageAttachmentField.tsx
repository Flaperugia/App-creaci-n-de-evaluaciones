import React, { useId, useRef, useState } from 'react';
import { AlertCircle, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import {
  deleteExamImage,
  uploadExamImage,
  validateImageFile,
} from '../../services/storageService';
import { QuestionImage } from '../../types/assessment';

interface ImageAttachmentFieldProps {
  image?: QuestionImage;
  ownerId: string;
  examId: string;
  label: string;
  disabled?: boolean;
  onChange: (next: QuestionImage | undefined) => void;
}

export function ImageAttachmentField({
  image,
  ownerId,
  examId,
  label,
  disabled = false,
  onChange,
}: ImageAttachmentFieldProps) {
  const inputId = useId();
  const altId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    const validationErr = validateImageFile(file);
    if (validationErr) {
      setError(validationErr);
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadExamImage({
        file,
        ownerId,
        examId,
        alt: image?.alt ?? '',
        previousStoragePath: image?.storagePath,
      });
      onChange(uploaded);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo subir la imagen a Firebase Storage.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (disabled) return;
    setError(null);
    const prevPath = image?.storagePath;
    onChange(undefined);
    if (prevPath) {
      await deleteExamImage(prevPath);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png"
        disabled={disabled || uploading}
        onChange={(e) => void handleFileChange(e)}
        className="sr-only"
      />

      {!image ? (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={inputId}
            className={`inline-flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-[#FAFBFD] px-3.5 py-2 text-xs font-medium text-slate-700 ${
              disabled || uploading
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:bg-slate-50'
            }`}
          >
            <ImagePlus className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span>
              {uploading
                ? 'Subiendo imagen a Storage...'
                : `${label} (JPG o PNG, máx. 5 MB)`}
            </span>
          </label>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-3.5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <img
              src={image.url}
              alt={image.alt || 'Vista previa de imagen adjunta'}
              referrerPolicy="no-referrer"
              className="h-32 w-full sm:w-44 rounded-lg border border-slate-200 bg-white object-contain"
            />
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 truncate">
                  {image.fileName}
                </span>

                {!disabled && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{uploading ? 'Subiendo...' : 'Reemplazar'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => void handleRemove()}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Quitar</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={altId}
                  className="block text-xs font-semibold text-slate-700"
                >
                  Texto alternativo accesible (obligatorio) *
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
                  placeholder="Describí brevemente qué muestra esta imagen..."
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0F1E36] disabled:bg-slate-100"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-700" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
