# PRD — Plataforma de evaluaciones escolares (MVP)
**Versión:** 1.0 · **Fecha:** 17 de noviembre de 2026 · **Objetivo:** prueba de usabilidad durante la semana del 23 de noviembre de 2026

## 1. Objetivo
Permitir que docentes creen, publiquen, dupliquen, corrijan y exporten evaluaciones escolares de forma simple; que estudiantes las resuelvan desde un enlace sin tener cuenta; y que una persona administradora gestione acceso e identidad de la escuela.

## 2. Principios
- Carga cognitiva mínima: acciones claras, un objetivo principal por pantalla, mostrar opciones avanzadas solo cuando hagan falta.
- El curso es un dato de la evaluación; no existe una sección de gestión de cursos en el MVP.
- Un bloque o *consigna* puede incluir introducción, imagen opcional y varias preguntas. Una actividad/consigna por paso del estudiante cuando comparten contexto.
- Guardar trabajos sin perder respuestas. No simular persistencia.
- Mantener la evaluación funcional aunque alguna biblioteca no cubra todas las actividades.
- Diseñar responsivo, con tipografías legibles y navegación por teclado.

## 3. Roles y permisos
### Docente
- Accede por Google mediante Firebase Authentication, solo si su correo está autorizado.
- Crea, edita borradores, duplica, previsualiza y publica evaluaciones propias.
- Consulta entregas, intentos y respuestas, corrige preguntas abiertas, registra nota y aprobado/desaprobado.
- Descarga resultados por evaluación.

### Administrador
- Accede también por Google; su rol se verifica en backend/reglas, nunca únicamente en UI.
- Todas las funciones de docente; además alta/desactivación de correos autorizados, consulta de todas las evaluaciones y configuración de nombre/logo/color de la escuela.
- Sin contraseña compartida ni un panel de administración independiente.

### Estudiante (sin cuenta)
- Abre enlace público de evaluación publicada, ve portada con nombre/logo escuela, título, tipo, año, curso, docente(s).
- Introduce nombre y apellido (para prueba, preferiblemente seudónimos o códigos); presiona «Iniciar evaluación».
- Responde bloques; navega Anterior/Siguiente, sin obligación de responder antes de avanzar.
- Visualiza diálogo de confirmación al enviar. Si hay respuestas incompletas, informa cantidad y ofrece «Enviar como está» o «Volver a revisar».
- Recibe confirmación y, solo si está activada, retroalimentación disponible para las respuestas cerradas. Notas finales pendientes si hay corrección manual.

## 4. Navegación
**Docente:** «Crear evaluación» y «Mis evaluaciones». La pantalla de creación ofrece «Nueva evaluación» y «Duplicar existente». «Mis evaluaciones» muestra una lista con título, curso, estado (borrador/publicada/cerrada), fecha, acciones (editar, compartir, duplicar, ver resultados, cerrar). No ofrecer «Ver resultados» para borradores sin entregas.
**Administrador:** mismas pantallas más «Administración» (docentes, identidad escolar, vista de todas las evaluaciones).
**Estudiante:** portada → actividades → confirmación → recibo.

## 5. Crear evaluación
### Paso 1: datos generales
Campos: título (obligatorio), tipo o subtítulo, año, curso, docentes (texto o referencias a usuarios), instrucciones iniciales, máximo de intentos (entero >=1, predeterminado 1), retroalimentación activada/desactivada. Guardar como borrador.
### Paso 2: editor de consignas
- Agregar, duplicar, eliminar y reordenar consignas.
- Cada consigna tiene título opcional, indicación contextual, imagen opcional y una o más preguntas.
- Tipos de preguntas: respuesta corta/desarrollo; opción múltiple (única o múltiple); verdadero/falso; relacionar pares; clasificar en categorías; cuadro comparativo con filas fijas y celdas de texto.
- Cada pregunta tiene enunciado, puntos, imagen opcional (máximo una para MVP), definición de respuesta correcta para cerradas, y respuesta modelo privada para abiertas.
- Subida de imagen JPG/PNG con límite recomendado 5 MB, validación MIME/tamaño, vista previa, reemplazo, eliminación y texto alternativo sugerido/requerido para accesibilidad. Guardar en Cloud Storage y referencia en Firestore. Si Storage no está disponible en el proyecto, mostrar bloqueo explícito y no fingir subida.
- Cuadro comparativo: docente define columna de situaciones (solo lectura en evaluación) y columnas de respuestas editables; permite títulos de columnas, filas y puntaje por fila. En móvil presentar cada fila como tarjeta con sus campos correspondientes, sin scroll horizontal excesivo.
- Vista previa en modo estudiante sin guardar entregas.
### Paso 3: publicar
- Validar existencia de consigna y preguntas, consistencia de puntajes y respuestas correctas de preguntas cerradas.
- Publicar con identificador y enlace único; permitir copiar enlace.
- Una publicación mantiene una versión inmutable para las entregas; cambios sustantivos requieren nueva versión o duplicado. No cambiar claves de corrección retroactivamente.
- Cerrar/archivar en vez de borrar si tiene entregas.

## 6. Entrega de estudiante
- Pantalla inicial: logo, escuela, evaluación, año/curso y docentes, nombre y apellido, Iniciar.
- Cada paso muestra una consigna o grupo lógico completo con barra de progreso e indicador «Actividad X de Y»; botones Anterior/Siguiente.
- Guardado de avance mediante persistencia segura en backend cuando sea posible; como mínimo, borrador local durante sesión y recuperación controlada, indicando explícitamente cuándo se guardó. No exponer claves correctas en payload público.
- Envío final idempotente: pulsar dos veces no crea dos entregas.
- Preguntas vacías permitidas con advertencia previa.
- Reingreso/intentabilidad: vincular intentos a identificador de participante acordado para la prueba; sin cuentas de estudiante no se puede impedir suplantación. Definir si se genera código individual antes de usar notas reales.

## 7. Resultados y corrección
- Desde una evaluación publicada: tabla con participante, número de intentos enviados, último envío, puntaje automático, estado pendiente/corregido, nota y aprobado/desaprobado.
- Al abrir entrega: mostrar pregunta, respuesta, clave/respuesta modelo (solo docente), calificación por pregunta o fila, nota final y estado.
- Respuestas cerradas: autoevaluación con reglas explícitas. Abiertas y tablas: corrección manual, con puntaje editable. No usar IA para calificar en MVP.
- En caso de múltiples intentos, visualizar historial y elegir por defecto último intento; sin asumir que es la nota definitiva.
- Exportar XLSX por evaluación con una fila por entrega/participante, identificador de intento, nombre, fecha, puntajes, estado y nota; PDF para planilla imprimible o respuesta individual. No usar componentes comerciales SurveyJS PDF sin licencia.

## 8. Caso de prueba: examen de Historia adjunto
**Consigna 1:** «Del voto cantado a la Ciudadanía Activa», cuatro casos y cuatro respuestas abiertas con puntajes 0,60; 0,60; 0,65; 0,65.
**Consigna 2:** «Del Modelo Agroexportador a la Industrialización (ISI) — Territorio y Tecnología», cuadro comparativo (cuatro criterios; dos columnas de modelos, celdas para estudiante) y análisis técnico-crítico con dos respuestas abiertas. El documento original especifica 1,50 puntos para el análisis; no inventar puntajes restantes.
**Consigna 3:** «El Estado en Acción — Modelo Liberal vs. Estado Interventor y Derechos», cuatro casos con columnas de respuesta para estado liberal e interventor; el documento asigna 1,00 punto por fila completa / 0,50 por celda.
El documento proporcionado incluye soluciones modelo: almacenarlas como clave privada y no en datos accesibles a estudiantes. Conservar literalmente los enunciados al importar; no reescribir ni alterar contenidos históricos.

## 9. Arquitectura
- React + TypeScript + componentes accesibles, creados en Google AI Studio Build.
- Firebase Authentication con inicio de sesión Google para docentes/admin; listado de correos autorizados/roles en Firestore y autorización verificada por Security Rules o backend.
- Cloud Firestore: `users`, `schoolConfig`, `exams`, `attempts`. Separar `examPublic` de claves/soluciones privadas; nunca descargar respuestas correctas a navegador estudiante si feedback está desactivado ni antes de finalizar.
- Cloud Storage for Firebase: logos e imágenes de consignas; reglas de escritura para docentes autorizados y lectura pública solo de assets explícitamente publicados, no exposición general del bucket.
- Backend confiable/Cloud Run/Cloud Functions para crear intentos, controlar límites, registrar envíos definitivos, computar calificaciones y aplicar idempotencia; no depender del cliente para límites.
- SurveyJS Form Library (MIT) para componentes tradicionales; editor visual propio. Tablas de texto mediante React propio si matriz estándar no reproduce bien el caso.
- XLSX: biblioteca open source adecuada, en cliente autenticado o endpoint seguro; PDF: impresión CSS / biblioteca open source según necesidad. Verificar licencias antes de incluir.

## 10. Seguridad mínima no negociable
- Usuarios docentes/admin autorizados, verificación real de rol; no confiar en visibilidad de botones.
- Reglas Firestore/Storage con principio de denegar por defecto; acceso público limitado a examen publicado sin respuestas modelo.
- No usar datos reales de menores en pruebas iniciales si no está definido el tratamiento institucional.
- Protección contra creación masiva de entregas, doble envío y lectura pública de notas. Deshabilitar endpoints administrativos públicos.
- Nunca incorporar credenciales secretas o service account en frontend.

## 11. No alcance
H5P, IA para generación/corrección, plantillas, banco de preguntas, sección cursos, administración de matrícula, integración LMS, panel de analíticas, cuentas de estudiantes, controles antifraude robustos, edición avanzada de imágenes, rúbricas complejas.

## 12. Criterios de aceptación
1. Administrador habilita docente; docente no autorizado no puede leer/crear evaluaciones.
2. Docente crea evaluación con pregunta abierta, imagen y tabla; guarda y vuelve a abrir sin pérdida.
3. Docente duplica evaluación y asigna otro curso sin copiar entregas.
4. Estudiante ingresa por URL, completa identificación, responde, retrocede sin perder contenido, envía una vez y ve confirmación.
5. Confirmación advierte respuestas vacías; permite volver a revisar.
6. Docente ve todas las entregas, respuestas abiertas, cantidad de intentos y puede calificar.
7. XLSX correcto; PDF legible; sin exponer claves privadas en cliente estudiante.
8. Logo/nombre escuela aparecen en panel y evaluación; móviles muestran tablas como tarjetas legibles.
9. Rutas que intentan admin sin permisos quedan bloqueadas por reglas/backend.
10. Se prueba el recorrido completo publicado en navegador independiente, no solo preview.

## 13. Plan de validación
- Ensayar 4 tareas: crear evaluación (respuesta abierta + tabla + imagen), duplicar/compartir, responder/enviar, corregir/exportar.
- Registrar éxito sin ayuda, tiempo, bloqueos y errores, pérdida de datos, comprensión de etiquetas y usabilidad móvil.
- Priorizar en la semana de prueba: confiabilidad de guardado/envío y corrección por encima de variedad adicional de preguntas.

## 14. Cuestiones para decidir tras la primera prueba
- Corrección por celda vs. por fila o pregunta en tablas.
- Uso de códigos individuales para identificar estudiantes.
- Configuración exacta de feedback y criterio de nota final entre múltiples intentos.
