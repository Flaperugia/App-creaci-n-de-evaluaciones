import { useEffect, useMemo } from 'react';
import { Model, surveyLocalization } from 'survey-core';
import { Survey } from 'survey-react-ui';
import { QuestionItem, StudentAnswerValue } from '../../types/assessment';

// Asegura mensajes base en español para controles estándar de SurveyJS
surveyLocalization.defaultLocale = 'es';

interface SurveyStandardQuestionProps {
  question: QuestionItem;
  value?: StudentAnswerValue;
  readOnly?: boolean;
  onChange?: (next: StudentAnswerValue) => void;
}

export function SurveyStandardQuestion({
  question,
  value,
  readOnly = false,
  onChange,
}: SurveyStandardQuestionProps) {
  const surveyJson = useMemo(() => {
    const qName = question.id;

    if (question.type === 'abierta') {
      return {
        locale: 'es',
        showQuestionNumbers: 'off',
        showNavigationButtons: false,
        showTitle: false,
        elements: [
          {
            type: 'comment',
            name: qName,
            title: question.prompt || 'Pregunta sin enunciado',
            rows: 4,
            placeholder: 'Escribí tu respuesta aquí...',
          },
        ],
      };
    }

    if (question.type === 'opcion_multiple') {
      const choices = (question.options ?? []).map((opt) => ({
        value: opt.id,
        text: opt.label || 'Opción sin texto',
      }));
      return {
        locale: 'es',
        showQuestionNumbers: 'off',
        showNavigationButtons: false,
        showTitle: false,
        elements: [
          {
            type: question.allowMultiple ? 'checkbox' : 'radiogroup',
            name: qName,
            title: question.prompt || 'Pregunta sin enunciado',
            choices,
          },
        ],
      };
    }

    // verdadero_falso
    return {
      locale: 'es',
      showQuestionNumbers: 'off',
      showNavigationButtons: false,
      showTitle: false,
      elements: [
        {
          type: 'boolean',
          name: qName,
          title: question.prompt || 'Pregunta sin enunciado',
          renderAs: 'radio',
          labelTrue: 'Verdadero',
          labelFalse: 'Falso',
        },
      ],
    };
  }, [question]);

  const model = useMemo(() => {
    const m = new Model(surveyJson);
    m.mode = readOnly ? 'display' : 'edit';
    m.showCompletedPage = false;
    return m;
  }, [readOnly, surveyJson]);

  // Sincroniza valor actual en el modelo SurveyJS
  useEffect(() => {
    const qName = question.id;
    let rawVal: unknown = undefined;

    if (question.type === 'abierta' && value?.type === 'abierta') {
      rawVal = value.text;
    } else if (
      question.type === 'opcion_multiple' &&
      value?.type === 'opcion_multiple'
    ) {
      rawVal = question.allowMultiple
        ? value.selectedIds
        : (value.selectedIds[0] ?? undefined);
    } else if (
      question.type === 'verdadero_falso' &&
      value?.type === 'verdadero_falso'
    ) {
      rawVal = value.value === null ? undefined : value.value;
    }

    if (model.getValue(qName) !== rawVal) {
      model.setValue(qName, rawVal);
    }
  }, [model, question.allowMultiple, question.id, question.type, value]);

  // Escucha cambios del estudiante en SurveyJS
  useEffect(() => {
    if (!onChange || readOnly) return;

    const handler = (
      _sender: Model,
      options: { name: string; value: unknown }
    ) => {
      if (options.name !== question.id) return;

      if (question.type === 'abierta') {
        onChange({
          type: 'abierta',
          text: typeof options.value === 'string' ? options.value : '',
        });
      } else if (question.type === 'opcion_multiple') {
        const selectedIds = Array.isArray(options.value)
          ? options.value.map(String)
          : typeof options.value === 'string' && options.value
            ? [options.value]
            : [];
        onChange({
          type: 'opcion_multiple',
          selectedIds,
        });
      } else if (question.type === 'verdadero_falso') {
        onChange({
          type: 'verdadero_falso',
          value: typeof options.value === 'boolean' ? options.value : null,
        });
      }
    };

    model.onValueChanged.add(handler);
    return () => {
      model.onValueChanged.remove(handler);
    };
  }, [model, onChange, question.id, question.type, readOnly]);

  return (
    <div className="institutional-survey">
      <Survey model={model} />
    </div>
  );
}
