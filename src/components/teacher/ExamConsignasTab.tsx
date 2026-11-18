import { CheckCircle2, FileText } from 'lucide-react';
import { ComparativeTableView } from '../common/ComparativeTableView';
import { SafeExamImage } from '../common/SafeExamImage';
import { formatScore, getQuestionMaxPoints } from '../../services/gradingAndExportService';
import { ExamDefinition, QuestionItem } from '../../types/assessment';

interface ExamConsignasTabProps {
  exam: ExamDefinition;
}

export function ExamConsignasTab({ exam }: ExamConsignasTabProps) {
  if (exam.consignas.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        Esta evaluación no tiene consignas configuradas.
      </section>
    );
  }

  const renderQuestionKey = (q: QuestionItem) => {
    if (q.type === 'opcion_multiple' && q.options) {
      return (
        <ul className="space-y-1.5">
          {q.options.map((opt) => (
            <li
              key={opt.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                opt.isCorrect
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900 font-medium'
                  : 'border-slate-200 bg-[#FAFBFD] text-slate-700'
              }`}
            >
              {opt.isCorrect && (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
              )}
              <span>{opt.label}</span>
              {opt.isCorrect && (
                <span className="ml-auto text-xs font-semibold">Correcta</span>
              )}
            </li>
          ))}
        </ul>
      );
    }

    if (q.type === 'verdadero_falso') {
      return (
        <p className="rounded-lg border border-slate-200 bg-[#F4F7FB] px-3.5 py-2.5 text-sm text-[#0F1E36]">
          <span className="font-semibold">Clave docente: </span>
          {typeof q.correctBoolean === 'boolean'
            ? q.correctBoolean
              ? 'Verdadero'
              : 'Falso'
            : 'Sin definir'}
        </p>
      );
    }

    if (q.type === 'cuadro_comparativo' && q.comparativeTable) {
      return (
        <ComparativeTableView
          config={q.comparativeTable}
          mode="teacher_preview"
          showModelAnswers
        />
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-[#F4F7FB] p-3.5 text-sm text-slate-700">
        <p className="text-xs font-semibold text-[#0F1E36] mb-1">
          Respuesta modelo privada docente
        </p>
        <p className="whitespace-pre-line">
          {q.modelAnswer?.trim() || 'Sin respuesta modelo cargada.'}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {exam.consignas.map((con, cIdx) => (
        <section
          key={con.id}
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5"
        >
          <div className="border-b border-slate-100 pb-4 space-y-1.5">
            <p className="text-xs font-semibold text-slate-500">
              Consigna {cIdx + 1}
            </p>
            <h2 className="font-display text-lg font-bold text-[#0F1E36]">
              {con.title}
            </h2>
            {con.instructions && (
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                {con.instructions}
              </p>
            )}
          </div>

          {con.image && (
            <SafeExamImage
              image={con.image}
              fallbackAlt={con.title}
              className="max-h-64 w-full object-contain"
            />
          )}

          {con.contextBoxText && (
            <div className="rounded-xl border border-slate-200 bg-[#F4F7FB] p-4 space-y-1">
              {con.contextBoxTitle && (
                <h3 className="font-display text-sm font-bold text-[#0F1E36]">
                  {con.contextBoxTitle}
                </h3>
              )}
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {con.contextBoxText}
              </p>
            </div>
          )}

          <div className="space-y-4">
            {con.questions.map((q, qIdx) => {
              const maxPts = getQuestionMaxPoints(q);
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-[#FAFBFD] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <FileText
                        className="h-4 w-4 shrink-0 mt-0.5 text-slate-500"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="text-xs font-medium text-slate-500">
                          Pregunta {qIdx + 1}
                        </p>
                        <h3 className="font-display text-sm sm:text-base font-bold text-[#0F1E36]">
                          {q.prompt}
                        </h3>
                      </div>
                    </div>

                    {maxPts !== null && (
                      <span className="text-xs font-mono-tabular font-semibold text-slate-600">
                        {formatScore(maxPts)} pts
                      </span>
                    )}
                  </div>

                  {q.image && (
                    <SafeExamImage
                      image={q.image}
                      fallbackAlt={q.prompt}
                      className="max-h-52 w-full object-contain"
                    />
                  )}

                  {renderQuestionKey(q)}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
