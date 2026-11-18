import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { QuestionImage } from '../../types/assessment';
import { validateHttpsImageUrl } from '../../utils/imageUrl';

interface SafeExamImageProps {
  image: QuestionImage;
  fallbackAlt: string;
  className?: string;
}

export function SafeExamImage({
  image,
  fallbackAlt,
  className = 'max-h-72 w-full object-contain',
}: SafeExamImageProps) {
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    setHasLoadError(false);
  }, [image.url]);

  const check = validateHttpsImageUrl(image.url);

  if (!check.valid || hasLoadError) {
    return (
      <figure className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs sm:text-sm text-amber-900">
        <ImageOff className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
        <span>
          No se pudo mostrar la imagen adjunta ({image.alt?.trim() || fallbackAlt}).
          Verificá que la URL HTTPS externa siga disponible.
        </span>
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-xl border border-slate-200 bg-[#FAFBFD]">
      <img
        src={check.normalizedUrl}
        alt={image.alt?.trim() || fallbackAlt}
        referrerPolicy="no-referrer"
        onError={() => setHasLoadError(true)}
        className={className}
      />
    </figure>
  );
}
