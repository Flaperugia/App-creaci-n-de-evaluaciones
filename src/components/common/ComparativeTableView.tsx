import { ComparativeTableConfig } from '../../types/assessment';

interface ComparativeTableViewProps {
  config: ComparativeTableConfig;
  mode: 'student' | 'teacher_preview' | 'grading_review';
  values?: Record<string, Record<string, string>>;
  onChangeCell?: (rowId: string, colId: string, value: string) => void;
  showModelAnswers?: boolean;
}

export function ComparativeTableView({
  config,
  mode,
  values = {},
  onChangeCell,
  showModelAnswers = false,
}: ComparativeTableViewProps) {
  const isEditable = mode === 'student' && !!onChangeCell;

  return (
    <div className="space-y-4">
      {/* Desktop / tablet table view */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-[#F4F7FB]">
              <th
                scope="col"
                className="w-[28%] px-4 py-3 font-display text-xs font-semibold text-slate-700"
              >
                {config.criteriaHeader}
              </th>
              {config.columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className="px-4 py-3 font-display text-xs font-semibold text-slate-700 border-l border-slate-200"
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {config.rows.map((row) => (
              <tr key={row.id} className="align-top">
                <th
                  scope="row"
                  className="bg-[#FAFBFD] px-4 py-3.5 font-medium text-[#0F1E36] text-sm"
                >
                  <div>{row.criterion}</div>
                  {typeof row.points === 'number' && (
                    <div className="mt-1 text-xs font-normal text-slate-500 font-mono-tabular">
                      {row.points.toFixed(2).replace('.', ',')} pts por fila
                    </div>
                  )}
                </th>
                {config.columns.map((col) => {
                  const cellVal = values[row.id]?.[col.id] ?? '';
                  const modelVal = row.modelAnswers?.[col.id];
                  return (
                    <td
                      key={col.id}
                      className="border-l border-slate-200 p-3 align-top"
                    >
                      {isEditable ? (
                        <textarea
                          rows={3}
                          value={cellVal}
                          onChange={(e) =>
                            onChangeCell(row.id, col.id, e.target.value)
                          }
                          aria-label={`${row.criterion} — ${col.title}`}
                          placeholder="Escribí tu respuesta..."
                          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F1E36] placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:outline-none"
                        />
                      ) : (
                        <div className="space-y-2">
                          <div className="min-h-[56px] rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
                            {cellVal || (
                              <span className="text-slate-400">
                                {mode === 'teacher_preview'
                                  ? 'Celda de respuesta del estudiante'
                                  : 'Sin respuesta'}
                              </span>
                            )}
                          </div>
                          {showModelAnswers && modelVal && (
                            <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] px-3 py-2 text-xs text-slate-700">
                              <span className="font-semibold text-[#0F1E36]">
                                Respuesta modelo:{' '}
                              </span>
                              {modelVal}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card-per-row view (no horizontal scroll per PRD 5 & 12.8) */}
      <div className="space-y-3 md:hidden">
        {config.rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
          >
            <div className="border-b border-slate-100 pb-2.5">
              <p className="text-xs font-medium text-slate-500">
                {config.criteriaHeader}
              </p>
              <p className="mt-0.5 font-display text-sm font-semibold text-[#0F1E36]">
                {row.criterion}
              </p>
              {typeof row.points === 'number' && (
                <p className="mt-1 text-xs text-slate-500 font-mono-tabular">
                  {row.points.toFixed(2).replace('.', ',')} pts por fila
                </p>
              )}
            </div>

            <div className="space-y-3">
              {config.columns.map((col) => {
                const cellVal = values[row.id]?.[col.id] ?? '';
                const modelVal = row.modelAnswers?.[col.id];
                return (
                  <div key={col.id} className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      {col.title}
                    </label>
                    {isEditable ? (
                      <textarea
                        rows={3}
                        value={cellVal}
                        onChange={(e) =>
                          onChangeCell(row.id, col.id, e.target.value)
                        }
                        placeholder="Escribí tu respuesta..."
                        className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#0F1E36] placeholder:text-slate-400 focus:border-[var(--brand-primary)] focus:outline-none"
                      />
                    ) : (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700">
                          {cellVal || (
                            <span className="text-slate-400">
                              {mode === 'teacher_preview'
                                ? 'Celda de respuesta del estudiante'
                                : 'Sin respuesta'}
                            </span>
                          )}
                        </div>
                        {showModelAnswers && modelVal && (
                          <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] px-3 py-2 text-xs text-slate-700">
                            <span className="font-semibold text-[#0F1E36]">
                              Respuesta modelo:{' '}
                            </span>
                            {modelVal}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
