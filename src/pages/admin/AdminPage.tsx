import React, { useState } from 'react';
import {
  CheckCircle2,
  Palette,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SchoolLogo } from '../../components/common/SchoolLogo';
import { StatusBadge } from '../../components/common/StatusBadge';
import { getContrastRatio, useAppState } from '../../context/AppStateContext';
import { DEFAULT_SCHOOL_IDENTITY } from '../../data/sampleData';
import { AuthorizedTeacher, LogoPreset, StaffRole } from '../../types/assessment';

const COLOR_PRESETS = [
  { hex: '#0B3B70', name: 'Azul institucional' },
  { hex: '#1E3A5F', name: 'Azul pizarra' },
  { hex: '#14532D', name: 'Verde académico' },
  { hex: '#6B1D2F', name: 'Borgoña clásico' },
  { hex: '#334155', name: 'Gris grafito' },
];

export function AdminPage() {
  const {
    authStatus,
    schoolIdentity,
    updateSchoolIdentity,
    persistSchoolIdentity,
    teachers,
    saveAuthorizedUser,
    allSchoolExams,
  } = useAppState();

  const [activeTab, setActiveTab] = useState<
    'identidad' | 'docentes' | 'evaluaciones'
  >('identidad');

  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('teacher');
  const [savingUser, setSavingUser] = useState(false);
  const [userMessage, setUserMessage] = useState<string | null>(null);

  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  if (authStatus !== 'admin') {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-xl font-bold text-[#0F1E36]">
            Acceso exclusivo de Administración
          </h1>
          <p className="mx-auto max-w-md text-sm text-slate-600">
            Tu cuenta no posee rol de Administrador. Esta ruta y las colecciones
            administrativas están bloqueadas tanto en la aplicación como en las
            reglas de seguridad de Firestore.
          </p>
        </div>
        <Link
          to="/docente/evaluaciones"
          className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0F1E36] hover:bg-slate-50"
        >
          Volver a Mis evaluaciones
        </Link>
      </section>
    );
  }

  const contrastRatio = getContrastRatio(schoolIdentity.primaryColor, '#FFFFFF');
  const passesAA = contrastRatio >= 4.5;

  const handleSaveIdentity = async () => {
    setIdentityMessage(null);
    setSavingIdentity(true);
    try {
      await persistSchoolIdentity(schoolIdentity);
      setIdentityMessage('Identidad escolar guardada en Cloud Firestore.');
    } catch {
      setIdentityMessage('No se pudo guardar la identidad escolar.');
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setUserMessage(null);
    setSavingUser(true);
    try {
      await saveAuthorizedUser({
        email: newEmail.trim().toLowerCase(),
        name: newName.trim() || newEmail.trim().split('@')[0],
        role: newRole,
        active: true,
      });
      setNewName('');
      setNewEmail('');
      setNewRole('teacher');
      setUserMessage('Usuario autorizado guardado en Firestore.');
    } catch {
      setUserMessage('Error al guardar el usuario autorizado.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleTeacher = async (teacher: AuthorizedTeacher) => {
    await saveAuthorizedUser({
      email: teacher.email,
      name: teacher.name,
      role: teacher.role,
      active: !teacher.active,
    });
  };

  const handleChangeTeacherRole = async (
    teacher: AuthorizedTeacher,
    nextRole: StaffRole
  ) => {
    await saveAuthorizedUser({
      email: teacher.email,
      name: teacher.name,
      role: nextRole,
      active: teacher.active,
    });
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLogoError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(file.type)) {
      setLogoError('Formato no compatible. Usá PNG, JPG o SVG.');
      return;
    }
    if (file.size > 150 * 1024) {
      setLogoError(
        'Para guardar el logo directo en Firestore sin Storage, usá una imagen menor a 150 KB.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateSchoolIdentity({
          logoPreset: 'custom_url',
          customLogoDataUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0F1E36]">
          Administración
        </h1>
        <p className="mt-1 text-sm sm:text-base text-slate-600">
          Configurá la identidad institucional de la escuela, los correos
          docentes autorizados y consultá todas las evaluaciones.
        </p>
      </div>

      {/* Segmented Tabs */}
      <div
        role="tablist"
        aria-label="Secciones de administración"
        className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1"
      >
        {(
          [
            { id: 'identidad', label: 'Identidad escolar' },
            { id: 'docentes', label: 'Docentes autorizados' },
            { id: 'evaluaciones', label: 'Todas las evaluaciones' },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'text-[var(--brand-on-primary)]'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              style={
                active ? { backgroundColor: 'var(--brand-primary)' } : undefined
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: IDENTIDAD ESCOLAR */}
      {activeTab === 'identidad' && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#0F1E36]">
                Identidad de la escuela
              </h2>
              <p className="text-sm text-slate-600">
                Nombre, logo y color principal guardados en Cloud Firestore para
                el panel y la vista estudiantil.
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateSchoolIdentity(DEFAULT_SCHOOL_IDENTITY)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 self-start"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restablecer valores</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="school-name"
                  className="block text-sm font-medium text-[#0F1E36]"
                >
                  Nombre de la escuela
                </label>
                <input
                  id="school-name"
                  type="text"
                  maxLength={120}
                  value={schoolIdentity.name}
                  onChange={(e) =>
                    updateSchoolIdentity({ name: e.target.value })
                  }
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="school-subtitle"
                  className="block text-sm font-medium text-[#0F1E36]"
                >
                  Subtítulo institucional
                </label>
                <input
                  id="school-subtitle"
                  type="text"
                  maxLength={120}
                  value={schoolIdentity.subtitle}
                  onChange={(e) =>
                    updateSchoolIdentity({ subtitle: e.target.value })
                  }
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-[#0F1E36]"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-[#0F1E36]">
                  Color principal
                </label>
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono-tabular text-slate-700">
                    <Palette className="h-4 w-4 text-slate-500" />
                    <input
                      type="color"
                      value={schoolIdentity.primaryColor}
                      onChange={(e) =>
                        updateSchoolIdentity({ primaryColor: e.target.value })
                      }
                      aria-label="Selector de color principal"
                      className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span>{schoolIdentity.primaryColor.toUpperCase()}</span>
                  </label>

                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() =>
                        updateSchoolIdentity({ primaryColor: preset.hex })
                      }
                      title={preset.name}
                      aria-label={`Color ${preset.name}`}
                      className={`h-8 w-8 rounded-full border-2 transition-transform ${
                        schoolIdentity.primaryColor.toLowerCase() ===
                        preset.hex.toLowerCase()
                          ? 'scale-110 border-[#0F1E36]'
                          : 'border-white shadow-xs'
                      }`}
                      style={{ backgroundColor: preset.hex }}
                    />
                  ))}
                </div>
                <p
                  className={`text-xs ${
                    passesAA ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  Contraste con texto claro: {contrastRatio.toFixed(2)}:1 (
                  {passesAA
                    ? 'Cumple AA'
                    : 'Recomendado usar un tono más oscuro para contraste AA'}
                  )
                </p>
              </div>
            </div>

            {/* Logo configuration + live preview */}
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="block text-sm font-medium text-[#0F1E36]">
                  Logo institucional
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(
                    [
                      { id: 'laurel_book', label: 'Libro y laureles' },
                      { id: 'technical_shield', label: 'Escudo técnico' },
                      { id: 'academic_pillar', label: 'Columnas' },
                    ] as { id: LogoPreset; label: string }[]
                  ).map((preset) => {
                    const active = schoolIdentity.logoPreset === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          updateSchoolIdentity({ logoPreset: preset.id })
                        }
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium ${
                          active
                            ? 'border-[var(--brand-primary)] bg-[#F4F8FD] text-[#0F1E36]'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <SchoolLogo
                          identity={{ ...schoolIdentity, logoPreset: preset.id }}
                          size="sm"
                        />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>

                <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-[#FAFBFD] px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <Upload className="h-4 w-4 text-slate-500" />
                  <span>Subir logo propio (PNG/JPG/SVG, máx. 150 KB)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="sr-only"
                  />
                </label>
                {logoError && (
                  <p className="text-xs text-rose-700">{logoError}</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-4 space-y-2">
                <p className="text-xs font-medium text-slate-500">
                  Vista previa en cabecera institucional
                </p>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3.5">
                  <SchoolLogo identity={schoolIdentity} size="md" />
                  <div className="h-7 w-px bg-slate-200" />
                  <div>
                    <p className="font-display text-sm font-bold text-[#0F1E36]">
                      {schoolIdentity.name || 'Nombre de la escuela'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {schoolIdentity.subtitle || 'Plataforma de evaluaciones'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="text-xs text-slate-600">
              {identityMessage && <span>{identityMessage}</span>}
            </div>
            <button
              type="button"
              disabled={savingIdentity}
              onClick={() => void handleSaveIdentity()}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-[var(--brand-on-primary)] disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              <span>
                {savingIdentity ? 'Guardando...' : 'Guardar identidad escolar'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* TAB 2: DOCENTES AUTORIZADOS */}
      {activeTab === 'docentes' && (
        <section className="space-y-6">
          <form
            onSubmit={handleAddTeacher}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
          >
            <h2 className="font-display text-base font-bold text-[#0F1E36]">
              Autorizar correo docente o administrador
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="text"
                maxLength={120}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre y apellido"
                aria-label="Nombre del docente"
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <input
                type="email"
                required
                maxLength={160}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="correo@escuela.edu.ar"
                aria-label="Correo autorizado"
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <div className="flex items-center gap-2">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as StaffRole)}
                  aria-label="Rol asignado"
                  className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="teacher">Docente (teacher)</option>
                  <option value="admin">Administrador (admin)</option>
                </select>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold text-[var(--brand-on-primary)] whitespace-nowrap disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <Plus className="h-4 w-4" />
                  <span>{savingUser ? 'Guardando...' : 'Autorizar'}</span>
                </button>
              </div>
            </div>
            {userMessage && (
              <p className="text-xs font-medium text-emerald-700">
                {userMessage}
              </p>
            )}
          </form>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-600">
                  <th scope="col" className="px-4 py-3">
                    Docente
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Correo Google autorizado
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Rol
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {teachers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Todavía no hay usuarios cargados en authorizedUsers.
                    </td>
                  </tr>
                ) : (
                  teachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-[#FAFBFD]">
                      <td className="px-4 py-3 font-medium text-[#0F1E36]">
                        {teacher.name}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-slate-600">
                        {teacher.email}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={teacher.role}
                          onChange={(e) =>
                            void handleChangeTeacherRole(
                              teacher,
                              e.target.value as StaffRole
                            )
                          }
                          aria-label={`Rol de ${teacher.email}`}
                          className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-[#0F1E36]"
                        >
                          <option value="teacher">Docente</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {teacher.active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Habilitado
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-500">
                            Desactivado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleToggleTeacher(teacher)}
                          className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {teacher.active ? 'Desactivar' : 'Habilitar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: TODAS LAS EVALUACIONES */}
      {activeTab === 'evaluaciones' && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-600">
                <th scope="col" className="px-4 py-3">
                  Evaluación
                </th>
                <th scope="col" className="px-4 py-3">
                  Docente
                </th>
                <th scope="col" className="px-4 py-3">
                  Curso
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acceso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {allSchoolExams.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-slate-500"
                  >
                    No hay evaluaciones registradas en Cloud Firestore todavía.
                  </td>
                </tr>
              ) : (
                allSchoolExams.map((exam) => (
                  <tr key={exam.id} className="hover:bg-[#FAFBFD]">
                    <td className="px-4 py-3.5 font-medium text-[#0F1E36]">
                      <div>{exam.title}</div>
                      <div className="text-xs text-slate-500">
                        {exam.subtitle}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">
                      <div>{exam.teachersText}</div>
                      <div className="text-xs font-mono-tabular text-slate-500">
                        {exam.ownerEmail}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{exam.course}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={exam.status} />
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        {exam.status !== 'borrador' && (
                          <Link
                            to={`/docente/evaluaciones/${exam.id}/resultados`}
                            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36] hover:bg-slate-50"
                          >
                            Ver resultados
                          </Link>
                        )}
                        <Link
                          to={`/docente/editor/${exam.id}`}
                          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F1E36] hover:bg-slate-50"
                        >
                          Editar
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
