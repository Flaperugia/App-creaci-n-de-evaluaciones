import {
  AuthorizedTeacher,
  ExamDefinition,
  SampleSubmission,
  SchoolIdentity,
} from '../types/assessment';

export const DEFAULT_SCHOOL_IDENTITY: SchoolIdentity = {
  name: 'Escuela Técnica N.º 25',
  subtitle: 'Plataforma de evaluaciones',
  primaryColor: '#0B3B70',
  logoPreset: 'laurel_book',
};

export const SAMPLE_TEACHERS: AuthorizedTeacher[] = [
  {
    id: 'lgomez@escuela25.edu.ar',
    name: 'Prof. Laura Gómez',
    email: 'lgomez@escuela25.edu.ar',
    role: 'teacher',
    active: true,
    addedAt: '10 nov 2026',
  },
  {
    id: 'flavia.perugia@bue.edu.ar',
    name: 'Prof. Flavia Perugia',
    email: 'flavia.perugia@bue.edu.ar',
    role: 'admin',
    active: true,
    addedAt: '02 nov 2026',
  },
  {
    id: 'metcheverry@escuela25.edu.ar',
    name: 'Prof. Martín Etcheverry',
    email: 'metcheverry@escuela25.edu.ar',
    role: 'teacher',
    active: true,
    addedAt: '12 nov 2026',
  },
  {
    id: 'lbenitez@escuela25.edu.ar',
    name: 'Prof. Lucía Benítez',
    email: 'lbenitez@escuela25.edu.ar',
    role: 'teacher',
    active: false,
    addedAt: '18 oct 2026',
  },
];

export const SAMPLE_EXAMS: ExamDefinition[] = [
  {
    id: 'exam-historia-2do',
    slug: 'historia-ciudadania-y-estado',
    title: 'Evaluación de Historia · 2.º año',
    subtitle: 'Evaluación integradora · Caso de prueba PRD',
    yearLabel: '2.º año',
    course: '2.º A',
    teachersText: 'Prof. Gómez',
    ownerEmail: 'lgomez@escuela25.edu.ar',
    initialInstructions:
      'Leé atentamente cada consigna antes de responder. Podés avanzar y retroceder entre actividades sin perder tu progreso en sesión. Si dejás alguna pregunta sin completar, el sistema te avisará antes de confirmar la entrega.',
    maxAttempts: 1,
    feedbackEnabled: true,
    status: 'publicada',
    updatedAt: '17 nov 2026, 10:15',
    publishedAt: '17 nov 2026, 10:15',
    submissionsCount: 3,
    consignas: [
      {
        id: 'con-1',
        order: 1,
        title: 'Del voto cantado a la ciudadanía activa',
        instructions:
          'Leé los siguientes casos históricos y respondé cada pregunta con tus propias palabras, usando la información del texto y los contenidos trabajados en clase.',
        contextBoxTitle: 'Caso 1 · Año 1908',
        contextBoxText:
          'En 1908, las elecciones en Argentina aún se realizaban con voto cantado, un sistema en el que cada persona debía decir en voz alta el nombre del candidato frente a las autoridades. Esto generaba presiones, fraudes y la exclusión de muchos sectores de la sociedad, que no podían participar en igualdad de condiciones.',
        questions: [
          {
            id: 'q-1-1',
            type: 'abierta',
            label: 'Caso 1 · Año 1908',
            prompt:
              '¿Por qué el voto cantado limitaba la participación ciudadana? Explicá tu respuesta.',
            points: 0.6,
            modelAnswer:
              'Porque al votar en voz alta frente a caudillos o autoridades locales, el votante quedaba expuesto a presiones laborales, económicas o físicas, facilitando el fraude electoral y desalentando el sufragio libre.',
          },
          {
            id: 'q-1-2',
            type: 'abierta',
            label: 'Caso 2 · Ley Sáenz Peña (1912)',
            prompt:
              '¿Qué tres características centrales incorporó la Ley Sáenz Peña para modificar el régimen electoral anterior?',
            points: 0.6,
            modelAnswer:
              'Estableció el voto secreto, obligatorio y universal (masculino para ciudadanos nativos y naturalizados mayores de 18 años) con padrón militar.',
          },
          {
            id: 'q-1-3',
            type: 'abierta',
            label: 'Caso 3 · Ampliación del padrón (1947)',
            prompt:
              'Explicá qué sector de la población obtuvo el reconocimiento del derecho al sufragio en 1947 y qué impacto tuvo en la idea de ciudadanía.',
            points: 0.65,
            modelAnswer:
              'Las mujeres obtuvieron el derecho a votar y ser elegidas (Ley 13.010), ampliando efectivamente el carácter universal de la ciudadanía política en Argentina.',
          },
          {
            id: 'q-1-4',
            type: 'abierta',
            label: 'Caso 4 · Ciudadanía en la actualidad',
            prompt:
              'Mencioná una forma de participación ciudadana actual más allá del acto electoral y justificá su importancia democrática.',
            points: 0.65,
            modelAnswer:
              'Por ejemplo: participación en centros de estudiantes, audiencias públicas, reclamos vecinales u organizaciones civiles; fortalecen el control ciudadano y la agenda pública.',
          },
        ],
      },
      {
        id: 'con-2',
        order: 2,
        title: 'Del Modelo Agroexportador a la Industrialización (ISI) — Territorio y Tecnología',
        instructions:
          'Completá el cuadro comparativo analizando las diferencias entre ambos modelos económicos y luego respondé las preguntas de análisis técnico-crítico.',
        questions: [
          {
            id: 'q-2-1',
            type: 'cuadro_comparativo',
            label: 'Cuadro comparativo · 4 criterios',
            prompt:
              'Compará el Modelo Agroexportador y la Industrialización por Sustitución de Importaciones (ISI) según cada criterio indicado.',
            points: null,
            comparativeTable: {
              criteriaHeader: 'Criterio de análisis',
              scoringMode: 'por_celda',
              columns: [
                { id: 'col-agro', title: 'Modelo Agroexportador' },
                { id: 'col-isi', title: 'Industrialización (ISI)' },
              ],
              rows: [
                {
                  id: 'row-1',
                  criterion: 'Producto principal y destino de la producción',
                  modelAnswers: {
                    'col-agro': 'Carnes y cereales orientados a la exportación hacia Europa (especialmente Gran Bretaña).',
                    'col-isi': 'Bienes manufacturados de consumo liviano (textiles, alimentos, metalmecánica) orientados al mercado interno.',
                  },
                },
                {
                  id: 'row-2',
                  criterion: 'Organización del territorio e infraestructura',
                  modelAnswers: {
                    'col-agro': 'Red ferroviaria radial centrada en la región pampeana y puertos exportadores como Buenos Aires y Rosario.',
                    'col-isi': 'Concentración industrial en el cordón metropolitano (AMBA, Rosario, Córdoba) y migraciones internas hacia las ciudades.',
                  },
                },
                {
                  id: 'row-3',
                  criterion: 'Rol de la tecnología y fuente de energía',
                  modelAnswers: {
                    'col-agro': 'Ferrocarril a vapor, frigoríficos, alambrado y maquinaria agrícola importada.',
                    'col-isi': 'Electrificación fabril, motores eléctricos, talleres metalúrgicos y desarrollo de infraestructura energética estatal.',
                  },
                },
                {
                  id: 'row-4',
                  criterion: 'Dependencia externa y vulnerabilidad económica',
                  modelAnswers: {
                    'col-agro': 'Alta vulnerabilidad frente a crisis internacionales y caída de precios de materias primas (ej. Crisis de 1930).',
                    'col-isi': 'Dependencia de divisas para importar maquinaria pesada, insumos industriales y bienes de capital.',
                  },
                },
              ],
            },
          },
          {
            id: 'q-2-2',
            type: 'abierta',
            label: 'Análisis técnico-crítico · Pregunta A',
            prompt:
              '¿De qué manera la Crisis de 1929-1930 evidenció los límites del Modelo Agroexportador e impulsó el pasaje hacia la ISI?',
            points: 0.75,
            modelAnswer:
              'La caída de la demanda europea y de los precios agrícolas redujo las divisas disponibles para importar manufacturas, obligando a producir localmente bienes básicos.',
          },
          {
            id: 'q-2-3',
            type: 'abierta',
            label: 'Análisis técnico-crítico · Pregunta B',
            prompt:
              'Evaluá una ventaja y una limitación territorial que generó la concentración industrial durante la etapa ISI.',
            points: 0.75,
            modelAnswer:
              'Ventaja: crecimiento del empleo urbano y mercado interno; limitación: desigualdad regional entre el área metropolitana y las economías del interior.',
          },
        ],
      },
      {
        id: 'con-3',
        order: 3,
        title: 'El Estado en Acción — Modelo Liberal vs. Estado Interventor y Derechos',
        instructions:
          'Analizá las cuatro situaciones históricas y completá en cada fila cómo respondía el Estado Liberal frente al Estado Interventor / Social.',
        questions: [
          {
            id: 'q-3-1',
            type: 'cuadro_comparativo',
            label: 'Casos comparados · 1,00 pt por fila completa (0,50 por celda)',
            prompt:
              'Completá ambas columnas para cada situación planteada.',
            points: 4,
            comparativeTable: {
              criteriaHeader: 'Situación / Caso',
              scoringMode: 'por_fila',
              columns: [
                { id: 'col-liberal', title: 'Estado Liberal' },
                { id: 'col-interventor', title: 'Estado Interventor y Derechos' },
              ],
              rows: [
                {
                  id: 'caso-est-1',
                  criterion: 'Caso 1 · Regulación de precios y comercio exterior',
                  points: 1,
                  modelAnswers: {
                    'col-liberal': 'Libre comercio sin intervención estatal directa en precios ni aranceles protectores.',
                    'col-interventor': 'Creación de juntas reguladoras, control de cambios y organismos estatales como el IAPI.',
                  },
                },
                {
                  id: 'caso-est-2',
                  criterion: 'Caso 2 · Condiciones laborales y jornada de trabajo',
                  points: 1,
                  modelAnswers: {
                    'col-liberal': 'Acuerdo privado entre empleador y trabajador con escasa legislación protectora.',
                    'col-interventor': 'Sanción de derechos laborales: aguinaldo, vacaciones pagas, convenios colectivos e indemnización.',
                  },
                },
                {
                  id: 'caso-est-3',
                  criterion: 'Caso 3 · Servicios públicos e infraestructura',
                  points: 1,
                  modelAnswers: {
                    'col-liberal': 'Concesión mayoritaria a capitales privados extranjeros (ferrocarriles, puertos).',
                    'col-interventor': 'Nacionalización y gestión estatal de servicios estratégicos, energía y transporte.',
                  },
                },
                {
                  id: 'caso-est-4',
                  criterion: 'Caso 4 · Acceso a salud, vivienda y educación técnica',
                  points: 1,
                  modelAnswers: {
                    'col-liberal': 'Asistencia focalizada o mutualismo privado sin garantía universal extendida.',
                    'col-interventor': 'Expansión de hospitales públicos, planes de vivienda y creación de escuelas técnicas y universidad obrera.',
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'exam-rev-francesa',
    slug: 'historia-revolucion-francesa',
    title: 'Historia: La Revolución Francesa',
    subtitle: 'Evaluación de la unidad 2',
    yearLabel: '3.º año',
    course: '3.º A',
    teachersText: 'Prof. Gómez',
    ownerEmail: 'lgomez@escuela25.edu.ar',
    initialInstructions:
      'Respondé las consignas de selección múltiple y desarrollo breve sobre las causas y etapas de la Revolución Francesa.',
    maxAttempts: 1,
    feedbackEnabled: true,
    status: 'publicada',
    updatedAt: '24 ene 2025, 14:32',
    publishedAt: '24 ene 2025, 14:32',
    submissionsCount: 2,
    consignas: [
      {
        id: 'rf-con-1',
        order: 1,
        title: 'Crisis del Antiguo Régimen',
        instructions: 'Seleccioná las opciones correctas y justificá brevemente.',
        questions: [
          {
            id: 'rf-q-1',
            type: 'opcion_multiple',
            allowMultiple: false,
            prompt: '¿Qué estamento concentraba la mayor carga impositiva antes de 1789?',
            points: 2,
            options: [
              { id: 'o1', label: 'Primer Estado (Clero)', isCorrect: false },
              { id: 'o2', label: 'Segundo Estado (Nobleza)', isCorrect: false },
              { id: 'o3', label: 'Tercer Estado (burguesía, artesanos y campesinos)', isCorrect: true },
            ],
          },
          {
            id: 'rf-q-2',
            type: 'verdadero_falso',
            prompt: 'La Declaración de los Derechos del Hombre y del Ciudadano de 1789 estableció la igualdad ante la ley.',
            points: 1,
            correctBoolean: true,
          },
        ],
      },
    ],
  },
  {
    id: 'exam-independencia',
    slug: 'historia-independencia-latinoamerica',
    title: 'Historia: Independencia de América Latina',
    subtitle: 'Evaluación de la unidad 3',
    yearLabel: '3.º año',
    course: '3.º B',
    teachersText: 'Prof. Gómez',
    ownerEmail: 'lgomez@escuela25.edu.ar',
    initialInstructions: 'Borrador en preparación para la unidad 3.',
    maxAttempts: 1,
    feedbackEnabled: false,
    status: 'borrador',
    updatedAt: '23 ene 2025, 11:05',
    submissionsCount: 0,
    consignas: [
      {
        id: 'ind-con-1',
        order: 1,
        title: 'Revoluciones hispanoamericanas',
        instructions: 'Clasificá los procesos según su período.',
        questions: [
          {
            id: 'ind-q-1',
            type: 'abierta',
            prompt: 'Explicá el rol de las juntas de gobierno de 1810 frente a la crisis de la monarquía española.',
            points: 2.5,
            modelAnswer: 'Asumieron la soberanía provisional invocando la retroversión de la soberanía ante la captura de Fernando VII.',
          },
        ],
      },
    ],
  },
  {
    id: 'exam-argentina-xix',
    slug: 'historia-argentina-siglo-xix',
    title: 'Historia: La Argentina en el siglo XIX',
    subtitle: 'Evaluación parcial',
    yearLabel: '4.º año',
    course: '4.º A',
    teachersText: 'Prof. Etcheverry',
    ownerEmail: 'metcheverry@escuela25.edu.ar',
    initialInstructions: 'Evaluación parcial de organización nacional.',
    maxAttempts: 1,
    feedbackEnabled: true,
    status: 'cerrada',
    updatedAt: '20 ene 2025, 16:47',
    publishedAt: '10 ene 2025, 08:00',
    submissionsCount: 2,
    consignas: [
      {
        id: 'arg-con-1',
        order: 1,
        title: 'Constitución y Estado Nacional',
        instructions: 'Respondé con precisión histórica.',
        questions: [
          {
            id: 'arg-q-1',
            type: 'abierta',
            prompt: '¿Qué conflictos persistieron entre Buenos Aires y la Confederación luego de 1853?',
            points: 5,
            modelAnswer: 'Control de la aduana, libre navegación de los ríos y representación exterior.',
          },
        ],
      },
    ],
  },
  {
    id: 'exam-crisis-colonial',
    slug: 'historia-crisis-orden-colonial',
    title: 'Historia: Crisis del orden colonial',
    subtitle: 'Evaluación de la unidad 1',
    yearLabel: '3.º año',
    course: '3.º A',
    teachersText: 'Prof. Gómez',
    ownerEmail: 'lgomez@escuela25.edu.ar',
    initialInstructions: 'Reformas borbónicas e invasiones inglesas.',
    maxAttempts: 1,
    feedbackEnabled: true,
    status: 'publicada',
    updatedAt: '15 ene 2025, 09:18',
    publishedAt: '15 ene 2025, 09:18',
    submissionsCount: 1,
    consignas: [
      {
        id: 'col-con-1',
        order: 1,
        title: 'Reformas borbónicas',
        instructions: 'Indicá verdadero o falso.',
        questions: [
          {
            id: 'col-q-1',
            type: 'verdadero_falso',
            prompt: 'El Virreinato del Río de la Plata se creó en 1776 con capital en Buenos Aires.',
            points: 2,
            correctBoolean: true,
          },
        ],
      },
    ],
  },
];

// Datos de muestra claramente identificados para ilustrar la pantalla de resultados sin persistencia real.
export const SAMPLE_SUBMISSIONS: SampleSubmission[] = [
  {
    id: 'sub-sample-1',
    examId: 'exam-historia-2do',
    attemptCode: 'MUE-101',
    participantName: 'Participante Muestra A14 (seudónimo)',
    attemptNumber: 1,
    totalAttempts: 1,
    submittedAt: '17 nov 2026, 11:04',
    autoScore: null,
    manualScore: null,
    finalGrade: null,
    correctionStatus: 'pendiente',
    resultStatus: 'pendiente',
    answers: [
      {
        questionId: 'q-1-1',
        studentResponseText:
          'Limitaba la participación porque al decir el voto en voz alta frente a las autoridades, muchas personas tenían miedo de perder su trabajo o recibir presiones.',
        awardedPoints: null,
        maxPoints: 0.6,
        isAutoGraded: false,
      },
      {
        questionId: 'q-1-2',
        studentResponseText:
          'Incorporó el voto secreto, obligatorio y universal masculino con uso de padrón.',
        awardedPoints: null,
        maxPoints: 0.6,
        isAutoGraded: false,
      },
      {
        questionId: 'q-1-3',
        studentResponseText:
          'Se aprobó el voto femenino en 1947, lo que amplió la ciudadanía política a las mujeres.',
        awardedPoints: null,
        maxPoints: 0.65,
        isAutoGraded: false,
      },
      {
        questionId: 'q-1-4',
        studentResponseText:
          'Participar en centros de estudiantes o asambleas barriales permite proponer mejoras y controlar decisiones públicas.',
        awardedPoints: null,
        maxPoints: 0.65,
        isAutoGraded: false,
      },
      {
        questionId: 'q-2-1',
        studentTableValues: {
          'row-1': {
            'col-agro': 'Exportación de carnes y granos a Europa.',
            'col-isi': 'Industria liviana para el mercado interno.',
          },
          'row-2': {
            'col-agro': 'Ferrocarriles hacia el puerto de Buenos Aires.',
            'col-isi': 'Crecimiento del cordón industrial en AMBA y Rosario.',
          },
          'row-3': {
            'col-agro': 'Frigoríficos y máquinas agrícolas importadas.',
            'col-isi': 'Energía eléctrica y talleres metalúrgicos.',
          },
          'row-4': {
            'col-agro': 'Dependía de los precios internacionales.',
            'col-isi': 'Dependía de divisas para comprar maquinaria.',
          },
        },
        awardedPoints: null,
        maxPoints: null,
        isAutoGraded: false,
      },
    ],
  },
  {
    id: 'sub-sample-2',
    examId: 'exam-historia-2do',
    attemptCode: 'MUE-102',
    participantName: 'Participante Muestra B09 (seudónimo)',
    attemptNumber: 1,
    totalAttempts: 1,
    submittedAt: '17 nov 2026, 11:22',
    autoScore: null,
    manualScore: 7.5,
    finalGrade: '8 / 10',
    correctionStatus: 'corregida',
    resultStatus: 'aprobado',
    answers: [
      {
        questionId: 'q-1-1',
        studentResponseText:
          'El voto cantado permitía el fraude y la intimidación porque no era secreto.',
        awardedPoints: 0.6,
        maxPoints: 0.6,
        isAutoGraded: false,
      },
      {
        questionId: 'q-1-2',
        studentResponseText: 'Secreto, obligatorio y universal masculino.',
        awardedPoints: 0.55,
        maxPoints: 0.6,
        isAutoGraded: false,
      },
    ],
  },
  {
    id: 'sub-sample-3',
    examId: 'exam-rev-francesa',
    attemptCode: 'MUE-201',
    participantName: 'Participante Muestra C03 (seudónimo)',
    attemptNumber: 1,
    totalAttempts: 1,
    submittedAt: '24 ene 2025, 15:10',
    autoScore: 3,
    manualScore: 3,
    finalGrade: '10 / 10',
    correctionStatus: 'corregida',
    resultStatus: 'aprobado',
    answers: [
      {
        questionId: 'rf-q-1',
        selectedOptionIds: ['o3'],
        awardedPoints: 2,
        maxPoints: 2,
        isAutoGraded: true,
      },
      {
        questionId: 'rf-q-2',
        selectedBoolean: true,
        awardedPoints: 1,
        maxPoints: 1,
        isAutoGraded: true,
      },
    ],
  },
];
