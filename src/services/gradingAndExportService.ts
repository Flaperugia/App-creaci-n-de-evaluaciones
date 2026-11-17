import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ComparativeTableConfig,
  ExamAttemptRecord,
  ExamDefinition,
  QuestionItem,
  SchoolIdentity,
  StudentAnswerValue,
} from '../types/assessment';

export interface QuestionEvaluationSummary {
  question: QuestionItem;
  consignaIndex: number;
  consignaTitle: string;
  isAutoGradable: boolean;
  isCorrect: boolean | null;
  studentLabel: string;
  teacherKeyLabel: string;
  autoAwardedPoints: number | null;
  manualAwardedPoints: number | null;
  maxPoints: number | null;
}

export interface AttemptScoringSummary {
  autoScore: number | null;
  maxAutoScore: number | null;
  manualScore: number | null;
  maxManualScore: number | null;
  totalScore: number | null;
  maxTotalScore: number | null;
  pendingManualItemsCount: number;
  questionSummaries: QuestionEvaluationSummary[];
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function formatScore(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace('.', ',');
}

export function sanitizeDownloadFileName(raw: string): string {
  // Conserva acentos, eñes, espacios y guiones; remueve únicamente caracteres inválidos en sistemas de archivos
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'evaluacion';
}

function normalizePdfText(raw: string): string {
  // Conserva tildes y eñes (WinAnsi) y normaliza comillas tipográficas / símbolos raros para evitar glifos rotos en Helvetica
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
}

export function getComparativeTableMaxPoints(
  tbl: ComparativeTableConfig | undefined
): number | null {
  if (!tbl) return null;
  const rowPoints = tbl.rows
    .map((r) => r.points)
    .filter((p): p is number => typeof p === 'number');
  if (rowPoints.length > 0) {
    return round2(rowPoints.reduce((acc, p) => acc + p, 0));
  }
  return null;
}

export function getQuestionMaxPoints(q: QuestionItem): number | null {
  if (q.type === 'cuadro_comparativo') {
    const rowSum = getComparativeTableMaxPoints(q.comparativeTable);
    if (rowSum !== null) return rowSum;
  }
  return typeof q.points === 'number' ? q.points : null;
}

export function formatStudentAnswerPlain(
  q: QuestionItem,
  ans: StudentAnswerValue | undefined
): string {
  if (!ans) return 'Sin responder';
  if (ans.type === 'abierta') {
    return ans.text.trim() ? ans.text.trim() : 'Sin responder';
  }
  if (ans.type === 'verdadero_falso') {
    if (ans.value === true) return 'Verdadero';
    if (ans.value === false) return 'Falso';
    return 'Sin responder';
  }
  if (ans.type === 'opcion_multiple') {
    if (!ans.selectedIds.length) return 'Sin responder';
    const labels = (q.options ?? [])
      .filter((o) => ans.selectedIds.includes(o.id))
      .map((o) => o.label);
    return labels.length > 0 ? labels.join(', ') : 'Sin responder';
  }
  if (ans.type === 'cuadro_comparativo' && q.comparativeTable) {
    const lines: string[] = [];
    for (const row of q.comparativeTable.rows) {
      const cols = q.comparativeTable.columns
        .map((c) => `${c.title}: ${(ans.cells[row.id]?.[c.id] ?? '').trim() || '—'}`)
        .join(' | ');
      lines.push(`${row.criterion} -> ${cols}`);
    }
    return lines.join('\n') || 'Sin responder';
  }
  if (ans.type === 'relacionar' && q.matchPairs) {
    return (
      q.matchPairs
        .map((p) => `${p.left} -> ${ans.mapping[p.id] || '—'}`)
        .join('\n') || 'Sin responder'
    );
  }
  if (ans.type === 'clasificar' && q.classifyItems) {
    return (
      q.classifyItems
        .map((it) => `${it.text}: ${ans.assignments[it.id] || '—'}`)
        .join('\n') || 'Sin responder'
    );
  }
  return 'Sin responder';
}

export function formatTeacherKeyPlain(q: QuestionItem): string {
  if (q.type === 'verdadero_falso') {
    if (typeof q.correctBoolean === 'boolean') {
      return q.correctBoolean ? 'Verdadero' : 'Falso';
    }
    return 'Sin clave definida';
  }
  if (q.type === 'opcion_multiple') {
    const correct = (q.options ?? []).filter((o) => o.isCorrect).map((o) => o.label);
    return correct.length > 0 ? correct.join(', ') : 'Sin clave definida';
  }
  if (q.type === 'abierta') {
    return q.modelAnswer?.trim() ? q.modelAnswer.trim() : 'Sin respuesta modelo cargada';
  }
  if (q.type === 'cuadro_comparativo' && q.comparativeTable) {
    const lines: string[] = [];
    for (const row of q.comparativeTable.rows) {
      const cols = q.comparativeTable.columns
        .map((c) => `${c.title}: ${row.modelAnswers?.[c.id]?.trim() || '—'}`)
        .join(' | ');
      lines.push(`${row.criterion} -> ${cols}`);
    }
    return lines.join('\n');
  }
  if (q.type === 'relacionar' && q.matchPairs) {
    return q.matchPairs.map((p) => `${p.left} -> ${p.right}`).join('\n');
  }
  if (q.type === 'clasificar' && q.classifyItems) {
    return q.classifyItems.map((it) => `${it.text}: ${it.category}`).join('\n');
  }
  return '—';
}

export function computeAttemptScoring(params: {
  exam: ExamDefinition;
  attempt: ExamAttemptRecord;
  manualScoresOverride?: Record<string, number | null>;
  tableRowScoresOverride?: Record<string, Record<string, number | null>>;
}): AttemptScoringSummary {
  const { exam, attempt } = params;
  const manualScores = params.manualScoresOverride ?? attempt.manualScores ?? {};
  const tableRowScores =
    params.tableRowScoresOverride ?? attempt.tableRowScores ?? {};

  let autoScore = 0;
  let maxAutoScore = 0;
  let hasAutoPoints = false;

  let manualScore = 0;
  let maxManualScore = 0;
  let hasManualPoints = false;
  let hasEnteredManualScore = false;
  let pendingManualItemsCount = 0;

  const questionSummaries: QuestionEvaluationSummary[] = [];

  exam.consignas.forEach((con, cIdx) => {
    con.questions.forEach((q) => {
      const ans = attempt.rawAnswers[q.id];
      const maxPts = getQuestionMaxPoints(q);
      const studentLabel = formatStudentAnswerPlain(q, ans);
      const teacherKeyLabel = formatTeacherKeyPlain(q);

      if (q.type === 'opcion_multiple' || q.type === 'verdadero_falso') {
        let isCorrect = false;
        if (q.type === 'verdadero_falso') {
          const val = ans?.type === 'verdadero_falso' ? ans.value : null;
          isCorrect =
            val !== null &&
            typeof q.correctBoolean === 'boolean' &&
            val === q.correctBoolean;
        } else {
          const selected =
            ans?.type === 'opcion_multiple' ? ans.selectedIds : [];
          const expectedIds = (q.options ?? [])
            .filter((o) => o.isCorrect)
            .map((o) => o.id);
          const expectedSet = new Set(expectedIds);
          const selectedSet = new Set(selected);
          isCorrect =
            expectedSet.size > 0 &&
            expectedSet.size === selectedSet.size &&
            [...expectedSet].every((id) => selectedSet.has(id));
        }

        const autoAwarded =
          maxPts !== null ? (isCorrect ? maxPts : 0) : null;
        if (maxPts !== null && autoAwarded !== null) {
          hasAutoPoints = true;
          maxAutoScore += maxPts;
          autoScore += autoAwarded;
        }

        questionSummaries.push({
          question: q,
          consignaIndex: cIdx + 1,
          consignaTitle: con.title,
          isAutoGradable: true,
          isCorrect,
          studentLabel,
          teacherKeyLabel,
          autoAwardedPoints: autoAwarded,
          manualAwardedPoints: null,
          maxPoints: maxPts,
        });
        return;
      }

      // Preguntas abiertas, cuadros comparativos, relacionar, clasificar
      if (maxPts !== null) {
        hasManualPoints = true;
        maxManualScore += maxPts;
      }

      let resolvedManual: number | null = null;
      if (q.type === 'cuadro_comparativo' && q.comparativeTable) {
        const rowMap = tableRowScores[q.id] ?? {};
        const enteredRowVals = q.comparativeTable.rows
          .map((r) => rowMap[r.id])
          .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));

        if (enteredRowVals.length > 0) {
          resolvedManual = round2(
            enteredRowVals.reduce((acc, v) => acc + v, 0)
          );
          if (enteredRowVals.length < q.comparativeTable.rows.length) {
            pendingManualItemsCount += 1;
          }
        } else if (
          typeof manualScores[q.id] === 'number' &&
          !Number.isNaN(manualScores[q.id] as number)
        ) {
          resolvedManual = round2(manualScores[q.id] as number);
        } else {
          pendingManualItemsCount += 1;
        }
      } else {
        if (
          typeof manualScores[q.id] === 'number' &&
          !Number.isNaN(manualScores[q.id] as number)
        ) {
          resolvedManual = round2(manualScores[q.id] as number);
        } else {
          pendingManualItemsCount += 1;
        }
      }

      if (resolvedManual !== null) {
        hasEnteredManualScore = true;
        manualScore += resolvedManual;
      }

      questionSummaries.push({
        question: q,
        consignaIndex: cIdx + 1,
        consignaTitle: con.title,
        isAutoGradable: false,
        isCorrect: null,
        studentLabel,
        teacherKeyLabel,
        autoAwardedPoints: null,
        manualAwardedPoints: resolvedManual,
        maxPoints: maxPts,
      });
    });
  });

  const resolvedAuto = hasAutoPoints ? round2(autoScore) : null;
  const resolvedMaxAuto = hasAutoPoints ? round2(maxAutoScore) : null;
  const resolvedManualTotal = hasEnteredManualScore
    ? round2(manualScore)
    : attempt.manualScore;
  const resolvedMaxManual = hasManualPoints ? round2(maxManualScore) : null;

  const hasAnyTotal = resolvedAuto !== null || resolvedManualTotal !== null;
  const resolvedTotal = hasAnyTotal
    ? round2((resolvedAuto ?? 0) + (resolvedManualTotal ?? 0))
    : null;

  const hasAnyMax = resolvedMaxAuto !== null || resolvedMaxManual !== null;
  const resolvedMaxTotal = hasAnyMax
    ? round2((resolvedMaxAuto ?? 0) + (resolvedMaxManual ?? 0))
    : null;

  return {
    autoScore: resolvedAuto,
    maxAutoScore: resolvedMaxAuto,
    manualScore: resolvedManualTotal,
    maxManualScore: resolvedMaxManual,
    totalScore: resolvedTotal,
    maxTotalScore: resolvedMaxTotal,
    pendingManualItemsCount,
    questionSummaries,
  };
}

export function buildParticipantAttemptCounts(
  attempts: ExamAttemptRecord[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const a of attempts) {
    const key = a.participantKey || a.participantName.trim().toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportExamResultsToXlsx(params: {
  exam: ExamDefinition;
  school: SchoolIdentity;
  attempts: ExamAttemptRecord[];
}): Promise<void> {
  const { exam, school, attempts } = params;
  const attemptCountsByParticipant = buildParticipantAttemptCounts(attempts);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = school.name;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Resultados');

  sheet.addRow([school.name]);
  sheet.addRow([
    `Evaluación: ${exam.title}`,
    `Curso: ${exam.course}`,
    `Docente(s): ${exam.teachersText || '—'}`,
  ]);
  sheet.addRow([
    `Exportado: ${new Date().toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
  ]);
  sheet.addRow([]);

  sheet.getRow(1).font = { bold: true, size: 13 };
  sheet.getRow(2).font = { bold: true, size: 10 };

  const headers = [
    'Estudiante / Identificador',
    'Código de entrega',
    'Intento N.º',
    'Cantidad de intentos',
    'Fecha de entrega',
    'Puntaje automático',
    'Puntaje manual',
    'Puntaje total',
    'Puntaje máximo',
    'Estado de corrección',
    'Nota',
    'Resultado',
    'Docente corrector',
    'Fecha de corrección',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0F1E36' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEEF4FB' },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  for (const att of attempts) {
    const scoring = computeAttemptScoring({ exam, attempt: att });
    const key = att.participantKey || att.participantName.trim().toLowerCase();
    const totalAttemptsForParticipant = attemptCountsByParticipant[key] ?? 1;

    sheet.addRow([
      att.participantName,
      att.attemptCode,
      att.attemptNumber,
      totalAttemptsForParticipant,
      att.submittedAt,
      scoring.autoScore !== null ? scoring.autoScore : '—',
      scoring.manualScore !== null ? scoring.manualScore : '—',
      scoring.totalScore !== null ? scoring.totalScore : '—',
      scoring.maxTotalScore !== null ? scoring.maxTotalScore : '—',
      att.correctionStatus === 'corregida' ? 'Corregida' : 'Pendiente',
      att.finalGrade ?? '—',
      att.resultStatus === 'aprobado'
        ? 'Aprobado'
        : att.resultStatus === 'desaprobado'
          ? 'Desaprobado'
          : 'Pendiente',
      att.gradedByName || att.gradedByEmail || '—',
      att.gradedAt || '—',
    ]);
  }

  sheet.columns.forEach((col, index) => {
    const widths = [28, 16, 12, 20, 22, 18, 16, 15, 16, 20, 12, 16, 26, 22];
    col.width = widths[index] ?? 18;
  });

  const detailSheet = workbook.addWorksheet('Detalle de respuestas');
  const detailHeader = detailSheet.addRow([
    'Estudiante / Identificador',
    'Intento N.º',
    'Consigna',
    'Pregunta',
    'Tipo',
    'Respuesta del estudiante',
    'Puntaje obtenido',
    'Puntaje máximo',
    'Observación docente',
  ]);
  detailHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0F1E36' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEEF4FB' },
    };
  });

  for (const att of attempts) {
    const scoring = computeAttemptScoring({ exam, attempt: att });
    for (const qs of scoring.questionSummaries) {
      const awarded = qs.isAutoGradable
        ? qs.autoAwardedPoints
        : qs.manualAwardedPoints;
      detailSheet.addRow([
        att.participantName,
        att.attemptNumber,
        `Consigna ${qs.consignaIndex}: ${qs.consignaTitle}`,
        qs.question.prompt,
        qs.question.type,
        qs.studentLabel,
        awarded !== null ? awarded : '—',
        qs.maxPoints !== null ? qs.maxPoints : '—',
        att.questionNotes[qs.question.id] ?? '',
      ]);
    }
  }

  detailSheet.columns.forEach((col, index) => {
    const widths = [26, 12, 28, 36, 18, 44, 16, 16, 32];
    col.width = widths[index] ?? 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `${sanitizeDownloadFileName(`${exam.title} - Resultados`)}.xlsx`;
  triggerBlobDownload(blob, fileName);
}

export function exportResultsSheetToPdf(params: {
  exam: ExamDefinition;
  school: SchoolIdentity;
  attempts: ExamAttemptRecord[];
}): void {
  const { exam, school, attempts } = params;
  const counts = buildParticipantAttemptCounts(attempts);
  const docPdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(14);
  docPdf.text(normalizePdfText(school.name), 14, 15);

  docPdf.setFontSize(12);
  docPdf.text(normalizePdfText(`Planilla de resultados: ${exam.title}`), 14, 22);

  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(9);
  docPdf.text(
    normalizePdfText(
      `Curso: ${exam.course}${exam.yearLabel ? ` (${exam.yearLabel})` : ''}  |  Docente(s): ${exam.teachersText || '—'}  |  Entregas: ${attempts.length}`
    ),
    14,
    28
  );

  const rows = attempts.map((att) => {
    const scoring = computeAttemptScoring({ exam, attempt: att });
    const key = att.participantKey || att.participantName.trim().toLowerCase();
    const totalAttempts = counts[key] ?? 1;
    const scoreDisplay =
      scoring.totalScore !== null
        ? `${formatScore(scoring.totalScore)}${scoring.maxTotalScore !== null ? ` / ${formatScore(scoring.maxTotalScore)}` : ''}`
        : '—';

    return [
      normalizePdfText(`${att.participantName} (${att.attemptCode})`),
      `${att.attemptNumber} / ${totalAttempts}`,
      normalizePdfText(att.submittedAt),
      normalizePdfText(scoreDisplay),
      att.correctionStatus === 'corregida' ? 'Corregida' : 'Pendiente',
      normalizePdfText(att.finalGrade ?? '—'),
      att.resultStatus === 'aprobado'
        ? 'Aprobado'
        : att.resultStatus === 'desaprobado'
          ? 'Desaprobado'
          : 'Pendiente',
      normalizePdfText(att.gradedByName || att.gradedByEmail || '—'),
    ];
  });

  autoTable(docPdf, {
    startY: 34,
    head: [
      [
        'Estudiante / Identificador',
        'Intentos',
        'Fecha de entrega',
        'Puntaje',
        'Corrección',
        'Nota',
        'Resultado',
        'Corregido por',
      ].map((h) => normalizePdfText(h)),
    ],
    body: rows,
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.5,
      textColor: [15, 30, 54],
    },
    headStyles: {
      fillColor: [238, 244, 251],
      textColor: [15, 30, 54],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [250, 251, 253],
    },
    didDrawPage: (data) => {
      const pageCount = docPdf.getNumberOfPages();
      docPdf.setFontSize(8);
      docPdf.setTextColor(100);
      docPdf.text(
        normalizePdfText(`Página ${data.pageNumber} de ${pageCount}`),
        data.settings.margin.left,
        docPdf.internal.pageSize.getHeight() - 8
      );
    },
  });

  const fileName = `${sanitizeDownloadFileName(`${exam.title} - Planilla`)}.pdf`;
  docPdf.save(fileName);
}

export function exportSingleAttemptToPdf(params: {
  exam: ExamDefinition;
  school: SchoolIdentity;
  attempt: ExamAttemptRecord;
  manualScoresOverride?: Record<string, number | null>;
  tableRowScoresOverride?: Record<string, Record<string, number | null>>;
  questionNotesOverride?: Record<string, string>;
  finalGradeOverride?: string;
  resultStatusOverride?: 'pendiente' | 'aprobado' | 'desaprobado';
  correctionStatusOverride?: 'pendiente' | 'corregida';
}): void {
  const { exam, school, attempt } = params;
  const scoring = computeAttemptScoring({
    exam,
    attempt,
    manualScoresOverride: params.manualScoresOverride,
    tableRowScoresOverride: params.tableRowScoresOverride,
  });
  const notes = params.questionNotesOverride ?? attempt.questionNotes;
  const finalGrade = params.finalGradeOverride ?? attempt.finalGrade ?? '—';
  const resultStatus = params.resultStatusOverride ?? attempt.resultStatus;
  const correctionStatus =
    params.correctionStatusOverride ?? attempt.correctionStatus;

  const docPdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  docPdf.setFont('helvetica', 'bold');
  docPdf.setFontSize(13);
  docPdf.text(normalizePdfText(school.name), 14, 15);

  docPdf.setFontSize(11.5);
  docPdf.text(
    normalizePdfText(`Entrega individual: ${exam.title}`),
    14,
    22
  );

  docPdf.setFont('helvetica', 'normal');
  docPdf.setFontSize(9);
  docPdf.text(
    normalizePdfText(
      `Estudiante: ${attempt.participantName}  |  Código: ${attempt.attemptCode}  |  Intento N.º ${attempt.attemptNumber}`
    ),
    14,
    29
  );
  docPdf.text(
    normalizePdfText(
      `Fecha de entrega: ${attempt.submittedAt}  |  Curso: ${exam.course}`
    ),
    14,
    34
  );

  const scoreText =
    scoring.totalScore !== null
      ? `${formatScore(scoring.totalScore)}${scoring.maxTotalScore !== null ? ` / ${formatScore(scoring.maxTotalScore)} pts` : ' pts'}`
      : '—';

  docPdf.text(
    normalizePdfText(
      `Puntaje total: ${scoreText}  |  Nota: ${finalGrade || '—'}  |  Estado: ${
        resultStatus === 'aprobado'
          ? 'Aprobado'
          : resultStatus === 'desaprobado'
            ? 'Desaprobado'
            : 'Pendiente'
      } (${correctionStatus === 'corregida' ? 'Corregida' : 'Pendiente'})`
    ),
    14,
    39
  );

  if (attempt.gradedByName || attempt.gradedByEmail) {
    docPdf.text(
      normalizePdfText(
        `Última corrección: ${attempt.gradedByName || attempt.gradedByEmail} (${attempt.gradedAt || 'Reciente'})`
      ),
      14,
      44
    );
  }

  const body = scoring.questionSummaries.map((qs) => {
    const awarded = qs.isAutoGradable
      ? qs.autoAwardedPoints
      : qs.manualAwardedPoints;
    const ptsText = `${formatScore(awarded)} / ${formatScore(qs.maxPoints)}`;
    const obs = notes[qs.question.id]?.trim();
    const answerBlock = obs
      ? `${qs.studentLabel}\n\n[Observación docente]: ${obs}`
      : qs.studentLabel;

    return [
      normalizePdfText(
        `Consigna ${qs.consignaIndex}\n${qs.question.prompt}`
      ),
      normalizePdfText(answerBlock),
      normalizePdfText(qs.teacherKeyLabel),
      normalizePdfText(ptsText),
    ];
  });

  autoTable(docPdf, {
    startY: attempt.gradedByName || attempt.gradedByEmail ? 49 : 45,
    head: [
      [
        'Consigna / Pregunta',
        'Respuesta del estudiante',
        'Clave / Respuesta modelo',
        'Puntaje',
      ].map((h) => normalizePdfText(h)),
    ],
    body,
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 56 },
      2: { cellWidth: 54 },
      3: { cellWidth: 26 },
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [15, 30, 54],
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [238, 244, 251],
      textColor: [15, 30, 54],
      fontStyle: 'bold',
    },
    didDrawPage: (data) => {
      const pageCount = docPdf.getNumberOfPages();
      docPdf.setFontSize(8);
      docPdf.setTextColor(100);
      docPdf.text(
        normalizePdfText(`Página ${data.pageNumber} de ${pageCount}`),
        data.settings.margin.left,
        docPdf.internal.pageSize.getHeight() - 8
      );
    },
  });

  const fileName = `${sanitizeDownloadFileName(`${exam.title} - ${attempt.participantName} - Intento ${attempt.attemptNumber}`)}.pdf`;
  docPdf.save(fileName);
}
