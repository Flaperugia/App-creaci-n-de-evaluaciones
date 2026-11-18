# Especificación de Seguridad Firestore (Spark / Sin Backend Express)

## 1. Invariantes de Datos y Autorización
1. **Denegación por defecto:** Todo documento y colección no autorizados explícitamente quedan bloqueados (`allow read, write: if false`).
2. **Separación entre autenticación y autorización:** Autenticarse con Google (`request.auth != null`) NO otorga acceso interno. El acceso docente/administrador exige `request.auth.token.email_verified == true` y un documento activo (`active == true`) en `/authorizedUsers/{emailId}` coincidente con `request.auth.token.email.lower()`.
3. **Aislamiento de PII (`authorizedUsers`):** Ningún usuario puede listar ni leer correos de terceros salvo un administrador activo (`role == 'admin' && active == true`).
4. **Aislamiento de evaluaciones y entregas (`exams`, `attempts`):** Un docente (`role == 'teacher'`) solo puede leer, listar y modificar documentos donde `ownerId == request.auth.uid` (o `examOwnerId == request.auth.uid`). El listado de `/attempts` está estrictamente restringido al docente dueño o administrador.
5. **Protección de soluciones en vista estudiantil (`examPublic`, `examClosedKeys`):**
   - La colección pública `/examPublic/{slug}` solo permite `get` (nunca `list`) cuando `resource.data.status == 'publicada'` y omite todas las soluciones (`modelAnswer`, `isCorrect`, `correctBoolean`, `modelAnswers`).
   - `/examClosedKeys/{slug}` no permite `list` y solo puede consultarse cuando la evaluación está `publicada` con `feedbackEnabled == true` (el cliente la consulta únicamente dentro de la transacción de envío final, nunca durante la resolución). Cuando `feedbackEnabled == false`, el documento tiene `questions: {}` y su lectura pública está denegada.
   - **Limitación asumida (Spark sin Cloud Functions):** si `feedbackEnabled == true`, un usuario con conocimientos técnicos podría inspeccionar `/examClosedKeys/{slug}` en red al momento de enviar; las respuestas modelo de preguntas abiertas y cuadros comparativos nunca se exponen fuera de `/exams`.
6. **Intento único e idempotencia (`examParticipants`, `attempts`):**
   - `/examParticipants/{examId}__${participantKey}` no permite `list` ni decrementar `attemptsUsed`.
   - El incremento de `attemptsUsed` de `0` a `1` solo se habilita junto con la creación atómica de `/attempts/{examId}__${idempotencyKey}` (`existsAfter` / `getAfter`) validando `attemptsUsed <= 1`, `attemptNumber == 1` y `submittedAt == request.time`.
   - El progreso parcial (`activeDraft`) se guarda sin consumir el único intento (`attemptsUsed` permanece en `0`).
   - Un intento ya creado nunca puede modificarse por estudiantes ni duplicarse por doble envío gracias al ID determinístico con `idempotencyKey`.
   - **Limitación asumida (estudiantes sin login):** al no existir autenticación estudiantil, el límite de 1 intento está ligado al identificador ingresado (`participantKey`); si un usuario ingresa otro nombre o código distinto, Firestore lo registra como otro participante.
7. **Configuración escolar (`schoolConfig/default`):** Lectura puntual (`get`) permitida para mostrar identidad institucional en portada estudiantil sin PII; escritura restringida exclusivamente a administradores activos (`isAdmin()`).

## 2. "Dirty Dozen" — Payloads de prueba adversarial
1. **Escalada de privilegios propia:** Docente autenticado intenta `update` sobre `/authorizedUsers/{suCorreo}` cambiando `role: 'admin'`. -> **DENIED**.
2. **Auto-registro no autorizado:** Usuario Google autenticado pero sin autorización intenta `create` en `/authorizedUsers/{suCorreo}` con `role: 'teacher', active: true`. -> **DENIED**.
3. **Email spoofing sin verificación:** Token con correo del admin pero `email_verified: false` intenta leer `/authorizedUsers` o escribir `/schoolConfig/default`. -> **DENIED**.
4. **Lectura masiva de PII:** Docente autorizado (`role == 'teacher'`) intenta `list` sobre `/authorizedUsers`. -> **DENIED**.
5. **Acceso de docente a evaluación ajena:** Docente A intenta `get` o `update` sobre `/exams/{examDeDocenteB}`. -> **DENIED**.
6. **Listado sin filtro de dueño:** Docente intenta `list` en `/exams` sin filtrar por `ownerId == request.auth.uid`. -> **DENIED**.
7. **Superar intento único:** Participante intenta crear `/attempts/{id}` con `attemptNumber > 1` o cuando `existing().attemptsUsed == 1`, o decrementar `attemptsUsed` en `/examParticipants`. -> **DENIED**.
8. **Auto-aprobación o feedback inventado:** Estudiante intenta crear `/attempts/{id}` con `resultStatus: 'aprobado'`, `submittedAt != request.time`, o `closedFeedback` no vacío cuando `feedbackEnabled == false`. -> **DENIED**.
9. **Acceso público a borrador o evaluación cerrada:** Estudiante intenta `get` en `/examPublic/{slugBorrador}` o `/exams/{examId}`. -> **DENIED**.
10. **Scraping de evaluaciones o participantes:** Estudiante intenta `list` sobre `/examPublic`, `/examParticipants`, `/examClosedKeys` o `/attempts`. -> **DENIED**.
11. **Shadow update con campo fantasma:** Usuario intenta escribir en `/authorizedUsers`, `/exams`, `/examParticipants` o `/attempts` incluyendo campo no permitido (`ghostBypass: true`). -> **DENIED** por `hasOnly()`.
12. **Lectura de claves cerradas cuando feedback está desactivado:** Intento de `get` en `/examClosedKeys/{slug}` cuando `examPublic.feedbackEnabled == false` o `status != 'publicada'`. -> **DENIED**.
13. **Falsificación de corrector o modificación de respuestas del alumno:** Un docente intenta `update` en `/attempts/{id}` cambiando `answers`, `submittedAt`, o escribiendo `gradedByUid != request.auth.uid`. -> **DENIED**.
