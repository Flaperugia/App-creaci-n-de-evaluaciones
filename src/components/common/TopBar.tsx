import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { useAppState } from '../../context/AppStateContext';
import { SchoolLogo } from './SchoolLogo';

interface TopBarProps {
  onToggleMobileMenu?: () => void;
  showMobileMenuButton?: boolean;
  isStudentView?: boolean;
}

export function TopBar({
  onToggleMobileMenu,
  showMobileMenuButton,
  isStudentView = false,
}: TopBarProps) {
  const { authStatus, authRecord, firebaseUser, schoolIdentity, signOutUser } =
    useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const roleDisplay =
    authStatus === 'admin'
      ? 'Administrador'
      : authStatus === 'teacher'
        ? 'Docente'
        : authStatus === 'unauthorized' || authStatus === 'inactive'
          ? 'Sin autorización'
          : null;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white no-print">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          {showMobileMenuButton && onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              aria-label="Abrir menú de navegación"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <div className="flex items-center gap-3 min-w-0">
            <SchoolLogo identity={schoolIdentity} size="md" />
            <div
              className="hidden h-7 w-px bg-slate-200 sm:block"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-display text-base sm:text-lg font-bold leading-tight text-[#0F1E36] truncate">
                {schoolIdentity.name}
              </p>
              <p className="text-xs sm:text-sm text-slate-500 leading-tight truncate">
                {schoolIdentity.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Vista Estudiante: sin menú ni acciones de cuenta docente */}
        {isStudentView ? (
          <div className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-[#F4F7FB] px-3.5 text-xs sm:text-sm font-medium text-[#0F1E36] whitespace-nowrap shrink-0">
            <User className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>Estudiante</span>
          </div>
        ) : (
          firebaseUser &&
          roleDisplay && (
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-[#F4F7FB] px-3.5 text-sm font-medium text-[#0F1E36] transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
              >
                <User className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span>{roleDisplay}</span>
                <ChevronDown
                  className="h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Cuenta autenticada"
                  className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg space-y-1.5"
                >
                  <div className="px-2.5 py-2 border-b border-slate-100">
                    <p className="text-sm font-semibold text-[#0F1E36] truncate">
                      {authRecord?.name ||
                        firebaseUser.displayName ||
                        'Usuario Google'}
                    </p>
                    <p className="text-xs font-mono-tabular text-slate-500 truncate">
                      {firebaseUser.email}
                    </p>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOutUser();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4 text-slate-500" />
                    <span>Cerrar sesión</span>
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </header>
  );
}
