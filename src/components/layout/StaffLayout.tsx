import { useState } from 'react';
import {
  ChevronDown,
  Layers,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAppState } from '../../context/AppStateContext';
import { SchoolLogo } from '../common/SchoolLogo';
import { TopBar } from '../common/TopBar';

export function StaffLayout() {
  const {
    authStatus,
    authError,
    firebaseUser,
    schoolIdentity,
    signInWithGoogle,
    signOutUser,
    refreshAuthorization,
    tryBootstrapAdmin,
  } = useAppState();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [showBootstrapHelp, setShowBootstrapHelp] = useState(false);
  const location = useLocation();

  const isCreateActive =
    location.pathname.startsWith('/docente/crear') ||
    location.pathname.startsWith('/docente/editor');

  const isEvaluationsActive = location.pathname.startsWith(
    '/docente/evaluaciones'
  );

  const isAdminActive = location.pathname.startsWith('/admin');

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap min-h-[42px] ${
      active
        ? 'text-[var(--brand-on-primary)] shadow-xs'
        : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F1E36]'
    }`;

  const renderNavItems = () => (
    <nav aria-label="Navegación principal" className="space-y-1.5">
      <NavLink
        to="/docente/crear"
        onClick={() => setMobileMenuOpen(false)}
        className={() => navLinkClass(isCreateActive)}
        style={
          isCreateActive
            ? { backgroundColor: 'var(--brand-primary)' }
            : undefined
        }
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Crear evaluación</span>
      </NavLink>

      <NavLink
        to="/docente/evaluaciones"
        onClick={() => setMobileMenuOpen(false)}
        className={() => navLinkClass(isEvaluationsActive)}
        style={
          isEvaluationsActive
            ? { backgroundColor: 'var(--brand-primary)' }
            : undefined
        }
      >
        <Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Mis evaluaciones</span>
      </NavLink>

      {authStatus === 'admin' && (
        <NavLink
          to="/admin"
          onClick={() => setMobileMenuOpen(false)}
          className={() => navLinkClass(isAdminActive)}
          style={
            isAdminActive
              ? { backgroundColor: 'var(--brand-primary)' }
              : undefined
          }
        >
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Administración</span>
        </NavLink>
      )}
    </nav>
  );

  const handleBootstrap = async () => {
    setBootstrapError(null);
    setBootstrapLoading(true);
    try {
      await tryBootstrapAdmin();
    } catch {
      setBootstrapError(
        'Las reglas de seguridad de Firestore rechazaron el alta automática porque tu correo no coincide con el propietario designado de bootstrap o ya existe un registro previo.'
      );
    } finally {
      setBootstrapLoading(false);
    }
  };

  // Estado de carga inicial de Auth
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
        <TopBar />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-3">
            <p className="font-display text-base font-semibold text-[#0F1E36]">
              Verificando sesión institucional...
            </p>
            <p className="text-sm text-slate-500">
              Conectando con Firebase Authentication y Cloud Firestore.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Pantalla de ingreso Google para docentes y administradores
  if (authStatus === 'unauthenticated') {
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
        <TopBar />
        <main className="flex flex-1 items-center justify-center p-6">
          <section
            aria-labelledby="login-heading"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xs space-y-6"
          >
            <div className="flex items-center gap-3.5">
              <SchoolLogo identity={schoolIdentity} size="lg" />
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  {schoolIdentity.name}
                </p>
                <h1
                  id="login-heading"
                  className="font-display text-xl font-bold text-[#0F1E36]"
                >
                  Ingreso docente
                </h1>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-600">
              Iniciá sesión con tu cuenta de Google institucional o autorizada
              para crear, administrar y corregir evaluaciones.
            </p>

            {authError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-900"
              >
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl px-5 text-sm font-semibold text-[var(--brand-on-primary)] transition-colors"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>Ingresar con Google</span>
            </button>

            <p className="text-xs text-slate-500 leading-relaxed">
              Los estudiantes no necesitan cuenta: ingresan directamente mediante
              el enlace único de cada evaluación publicada.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // Usuario autenticado con Google pero sin autorización o desactivado
  if (authStatus === 'unauthorized' || authStatus === 'inactive') {
    const isInactive = authStatus === 'inactive';
    return (
      <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
        <TopBar />
        <main className="flex flex-1 items-center justify-center p-6">
          <section
            aria-labelledby="unauth-heading"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xs space-y-5"
          >
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <ShieldAlert className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h1
                  id="unauth-heading"
                  className="font-display text-xl font-bold text-[#0F1E36]"
                >
                  {isInactive
                    ? 'Cuenta desactivada por Administración'
                    : 'Correo no autorizado'}
                </h1>
                <p className="text-sm text-slate-600">
                  Sesión iniciada como{' '}
                  <span className="font-mono-tabular font-semibold text-[#0F1E36]">
                    {firebaseUser?.email}
                  </span>
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">
              {isInactive
                ? 'Tu correo figura en el registro de la escuela pero actualmente está desactivado. Solicitá su habilitación a la persona administradora.'
                : 'Autenticaste correctamente con Google, pero tu correo todavía no figura en la lista de docentes autorizados. Por seguridad, las reglas de Firestore bloquean cualquier acceso a evaluaciones y entregas.'}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void refreshAuthorization()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-[#0F1E36] hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>Reverificar permiso</span>
              </button>

              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)]"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Cambiar cuenta de Google</span>
              </button>
            </div>

            {!isInactive && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowBootstrapHelp((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0F1E36]"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      showBootstrapHelp ? 'rotate-180' : ''
                    }`}
                  />
                  <span>
                    ¿Sos el primer administrador de esta instalación? (Bootstrap)
                  </span>
                </button>

                {showBootstrapHelp && (
                  <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-4 space-y-3 text-xs text-slate-700 leading-relaxed">
                    <p>
                      El alta inicial del primer administrador se valida
                      exclusivamente en las reglas de seguridad del servidor (sin
                      claves ni secretos en el cliente):
                    </p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>
                        <strong>Opción A (Consola Firebase):</strong> creá un
                        documento en{' '}
                        <code className="font-mono-tabular">
                          authorizedUsers/tu-correo@dominio
                        </code>{' '}
                        con{' '}
                        <code className="font-mono-tabular">
                          role: "admin", active: true
                        </code>
                        .
                      </li>
                      <li>
                        <strong>Opción B (Bootstrap propietario):</strong> si tu
                        cuenta coincide con el correo de bootstrap configurado
                        en <code className="font-mono-tabular">firestore.rules</code>,
                        podés inicializar tu perfil desde acá.
                      </li>
                    </ol>

                    {bootstrapError && (
                      <p role="alert" className="font-medium text-rose-700">
                        {bootstrapError}
                      </p>
                    )}

                    <button
                      type="button"
                      disabled={bootstrapLoading}
                      onClick={() => void handleBootstrap()}
                      className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0F1E36] hover:bg-slate-50 disabled:opacity-50"
                    >
                      {bootstrapLoading
                        ? 'Verificando en servidor...'
                        : 'Inicializar primer administrador'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F9FC]">
      <TopBar
        showMobileMenuButton
        onToggleMobileMenu={() => setMobileMenuOpen(true)}
      />

      {/* Mobile slide-over drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Menú docente"
        >
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 flex w-72 max-w-[85vw] flex-col bg-white border-r border-slate-200 p-4">
            <div className="flex items-center justify-between pb-4 mb-3 border-b border-slate-100">
              <span className="font-display text-sm font-semibold text-[#0F1E36]">
                Menú principal
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Cerrar menú"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderNavItems()}
          </aside>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-[1440px] flex-1">
        {/* Desktop left sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-5 lg:block no-print">
          {renderNavItems()}
        </aside>

        {/* Main workspace */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
