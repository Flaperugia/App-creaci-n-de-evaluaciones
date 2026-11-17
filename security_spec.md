# Especificación de Seguridad Firestore (Actualizada)

## 1. Invariantes de Datos y Autorización
1. **Denegación por defecto:** Todo documento y colección no autorizados explícitamente quedan bloqueados (`allow read, write: if false`).
2. **Separación entre autenticación y autorización:** Autenticarse con Google (`request.auth != null`) NO otorga acceso interno. El acceso docente/administrador exige `request.auth.token.email_verified == true` y un documento activo (`active == true`) en `/authorizedUsers/{emailId}` coincidente con `request.auth.token.email.lower()`.
3. **Aislamiento de PII (`authorizedUsers`):** Ningún usuario puede listar ni leer correos de terceros salvo un administrador activo (`role == 'admin' && active == true`).
4. **Aislamiento de evaluaciones y entregas (`exams`, `attempts`):** Un docente (`role == 'teacher'`) solo puede leer, listar y modificar documentos donde `ownerId == request.auth.uid` (o `examOwnerId == request.auth.uid`). El listado de `/attempts` está estrictamente restringido al docente dueño o administrador.
5. **Protección de soluciones en vista estudiantil (`examPublic`, `examClosedKeys`):** La colección pública `/examPublic/{slug}` solo permite `get` (nunca `list`) cuando `resource.data.status == 'publicada'` y omite todas las soluciones (`modelAnswer`, `isCorrect`, `correctBoolean`, `modelAnswers`). `/examClosedKeys/{slug}` no permite `list` y solo puede consultarse cuando la evaluación está `publicada` con `feedbackEnabled == true` (exclusivamente desde el backend al confirmar entrega, nunca durante la resolución en frontend).
6. **Control de intentos e idempotencia (`examParticipants`, `attempts`):**
   - `/examParticipants/{examId}__${participantKey}` no permite `list` ni decrementar `attemptsUsed`.
   - El incremento de `attemptsUsed` solo se habilita junto con la creación atómica de `/attempts/{examId}__${idempotencyKey}` (`existsAfter` / `getAfter`) y validando `attemptsUsed <= examPublic.maxAttempts` y `submittedAt == request.time`.
   - Un intento ya creado nunca puede modificarse por estudiantes ni duplicarse por doble envío gracias al ID determinístico con `idempotencyKey`.
7. **Configuración escolar (`schoolConfig/default`):** Lectura puntual (`get`) permitida para mostrar identidad institucional en portada estudiantil sin PII; escritura restringida exclusivamente a administradores activos (`isAdmin()`).

## 2. "Dirty Dozen" — Payloads de prueba adversarial
1. **Escalada de privilegios propia:** Docente autenticado intenta `update` sobre `/authorizedUsers/{suCorreo}` cambiando `role: 'admin'`. -> **DENIED**.
2. **Auto-registro no autorizado:** Usuario Google autenticado pero sin autorización intenta `create` en `/authorizedUsers/{suCorreo}` con `role: 'teacher', active: true`. -> **DENIED**.
3. **Email spoofing sin verificación:** Token con correo del admin pero `email_verified: false` intenta leer `/authorizedUsers` o escribir `/schoolConfig/default`. -> **DENIED**.
4. **Lectura masiva de PII:** Docente autorizado (`role: 'teacher'`) intenta `list` sobre `/authorizedUsers`. -> **DENIED**.
5. **Acceso de docente a evaluación ajena:** Docente A intenta `get` o `update` sobre `/exams/{examDeDocenteB}`. -> **DENIED**.
6. **Listado sin filtro de dueño:** Docente intenta `list` en `/exams` sin filtrar por `ownerId == request.auth.uid`. -> **DENIED**.
7. **Superar máximo de intentos:** Participante intenta crear `/attempts/{id}` con `attemptNumber > examPublic.maxAttempts` o decrementar `attemptsUsed` en `/examParticipants`. -> **DENIED**.
8. **Auto-aprobación en entrega:** Estudiante intenta crear `/attempts/{id}` con `resultStatus: 'aprobado'` o `submittedAt` manipulado distinto a `request.time`. -> **DENIED**.
9. **Acceso público a borrador o evaluación cerrada:** Estudiante intenta `get` en `/examPublic/{slugBorrador}` o `/exams/{examId}`. -> **DENIED**.
10. **Scraping de evaluaciones o participantes:** Estudiante intenta `list` sobre `/examPublic`, `/examParticipants`, `/examClosedKeys` o `/attempts`. -> **DENIED**.
11. **Shadow update con campo fantasma:** Usuario intenta escribir en `/authorizedUsers`, `/exams`, `/examParticipants` o `/attempts` incluyendo campo no permitido (`ghostBypass: true`). -> **DENIED** por `hasOnly()`.
12. **Lectura de claves cerradas cuando feedback está desactivado:** Intento de `get` en `/examClosedKeys/{slug}` cuando `examPublic.feedbackEnabled == false` o `status != 'publicada'`. -> **DENIED**.
13. **Falsificación de corrector o modificación de respuestas del alumno:** Un docente intenta `update` en `/attempts/{id}` cambiando `answers`, `submittedAt`, o escribiendo `gradedByUid != request.auth.uid`. -> **DENIED**.

