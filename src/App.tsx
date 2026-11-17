/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { StaffLayout } from './components/layout/StaffLayout';
import { StudentLayout } from './components/layout/StudentLayout';
import { AppStateProvider } from './context/AppStateContext';
import { AdminPage } from './pages/admin/AdminPage';
import { StudentActivityPage } from './pages/student/StudentActivityPage';
import { StudentConfirmPage } from './pages/student/StudentConfirmPage';
import { StudentCoverPage } from './pages/student/StudentCoverPage';
import { StudentReceiptPage } from './pages/student/StudentReceiptPage';
import { CreateEvaluationHubPage } from './pages/teacher/CreateEvaluationHubPage';
import { EvaluationEditorPage } from './pages/teacher/EvaluationEditorPage';
import { EvaluationResultsPage } from './pages/teacher/EvaluationResultsPage';
import { MyEvaluationsPage } from './pages/teacher/MyEvaluationsPage';

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F9FC] p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F1E36]">
          Página no encontrada
        </h1>
        <p className="text-sm text-slate-600">
          La ruta solicitada no existe o no está disponible en esta plataforma.
        </p>
        <div className="pt-2">
          <Link
            to="/docente/evaluaciones"
            className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            Ir a Mis evaluaciones
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppStateProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/docente/evaluaciones" replace />}
            />

            {/* Panel Docente y Administración */}
            <Route element={<StaffLayout />}>
              <Route
                path="/docente/evaluaciones"
                element={<MyEvaluationsPage />}
              />
              <Route
                path="/docente/crear"
                element={<CreateEvaluationHubPage />}
              />
              <Route
                path="/docente/editor/:examId"
                element={<EvaluationEditorPage />}
              />
              <Route
                path="/docente/evaluaciones/:examId"
                element={<EvaluationResultsPage />}
              />
              <Route
                path="/docente/evaluaciones/:examId/resultados"
                element={<EvaluationResultsPage />}
              />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            {/* Flujo separado para Estudiante (sin menú docente) */}
            <Route element={<StudentLayout />}>
              <Route path="/e/:slug" element={<StudentCoverPage />} />
              <Route
                path="/e/:slug/actividad"
                element={<StudentActivityPage />}
              />
              <Route
                path="/e/:slug/confirmar"
                element={<StudentConfirmPage />}
              />
              <Route path="/e/:slug/recibo" element={<StudentReceiptPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </AppStateProvider>
    </ErrorBoundary>
  );
}
