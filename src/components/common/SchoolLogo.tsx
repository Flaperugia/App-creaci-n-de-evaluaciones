import { SchoolIdentity } from '../../types/assessment';

interface SchoolLogoProps {
  identity: SchoolIdentity;
  size?: 'sm' | 'md' | 'lg';
}

export function SchoolLogo({ identity, size = 'md' }: SchoolLogoProps) {
  const dimensions =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';

  if (identity.logoPreset === 'custom_url' && identity.customLogoDataUrl) {
    return (
      <div
        className={`${dimensions} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white flex items-center justify-center`}
      >
        <img
          src={identity.customLogoDataUrl}
          alt={`Logo de ${identity.name}`}
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-0.5"
        />
      </div>
    );
  }

  if (identity.logoPreset === 'technical_shield') {
    return (
      <svg
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className={`${dimensions} shrink-0`}
        style={{ color: 'var(--brand-primary)' }}
      >
        <path
          d="M24 5L9 11.5V23.5C9 33.2 15.4 40.9 24 43.5C32.6 40.9 39 33.2 39 23.5V11.5L24 5Z"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M16.5 19.5H31.5M18.5 25.5H29.5M24 14V34"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (identity.logoPreset === 'academic_pillar') {
    return (
      <svg
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className={`${dimensions} shrink-0`}
        style={{ color: 'var(--brand-primary)' }}
      >
        <path
          d="M10 15L24 8L38 15H10Z"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinejoin="round"
        />
        <path
          d="M14 19V34M21 19V34M27 19V34M34 19V34M10 38H38"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Default: open book with laurel wreath (matching mockup)
  return (
    <svg
      viewBox="0 0 56 44"
      fill="none"
      aria-hidden="true"
      className={`${size === 'lg' ? 'h-14 w-16' : size === 'sm' ? 'h-7 w-9' : 'h-9 w-12'} shrink-0`}
      style={{ color: 'var(--brand-primary)' }}
    >
      {/* Left laurel branch */}
      <path
        d="M13 36C8.5 32.5 6 26.5 6.5 19.5C7 14 9.5 10.5 11.5 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.8 25C4.5 23.5 4 21 5.5 19.5M7.5 30C5.2 29.2 4.8 27 6.2 25.5M9.5 34C7.5 34 6.8 32.2 8 30.8M7.5 19.5C5.6 18 5.6 15.5 7.4 14.3M9.5 14.5C8 12.8 8.3 10.7 10.2 9.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Right laurel branch */}
      <path
        d="M43 36C47.5 32.5 50 26.5 49.5 19.5C49 14 46.5 10.5 44.5 8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M49.2 25C51.5 23.5 52 21 50.5 19.5M48.5 30C50.8 29.2 51.2 27 49.8 25.5M46.5 34C48.5 34 49.2 32.2 48 30.8M48.5 19.5C50.4 18 50.4 15.5 48.6 14.3M46.5 14.5C48 12.8 47.7 10.7 45.8 9.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Open book */}
      <path
        d="M28 15C24.5 12.5 19.5 11.8 14.5 12.5V31.5C19.5 30.8 24.5 31.5 28 34C31.5 31.5 36.5 30.8 41.5 31.5V12.5C36.5 11.8 31.5 12.5 28 15Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M28 15V34"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
