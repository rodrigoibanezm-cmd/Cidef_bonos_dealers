# Arquitectura del pipeline de bonos dealers

Estado: 20-08-2026

## Objetivo

Procesar documentación de una operación dealer, extraer hechos, detectar inconsistencias, corregirlas de forma quirúrgica cuando sea posible, consolidar una operación canónica y calcular los montos a devolver.

Principio central:

**1 VIN de venta = 1 operación.**

La operación puede nacer incompleta y completarse mediante cargas posteriores.

## Flujo objetivo

```txt
R2 / documentos originales
→ normalización PDF/JPG
→ document_router
→ extractor por tipo documental (full)
→ tablas staging por tipo
→ cierre general inicial
→ audit_router
→ extractor targeted, solo si hay error de extracción
→ auditor global, solo si hay inconsistencia cruzada
→ cierre general final
→ bonus_requests
→ cálculo económico
→ front
```

El pipeline debe evitar loops abiertos. Cada problema puede tener como máximo 2 intentos automáticos de corrección. Si no se resuelve, queda para revisión humana.

## Responsabilidades

### Router documental

Clasifica el documento y deriva al extractor correcto.

Tipos actuales:

- FV
- FC
- INSCRIPCION
- FINANCIAMIENTO
- REPOSICION
- BASURA / no relevante

FC y REPOSICION pueden compartir apariencia. La decisión final entre ambos debe ser determinista:

```txt
VIN documento == VIN operación → FC
VIN documento != VIN operación → REPOSICION
```

El VIN del nombre del archivo puede usarse como señal secundaria de operación, pero nunca reemplaza el VIN leído desde el documento.

### Extractores

Cada extractor debe soportar dos modos:

```txt
mode = full
mode = targeted
```

`full` ejecuta la extracción normal completa.

`targeted` recibe campos concretos, contexto y motivo, y reextrae únicamente lo necesario. El objetivo es corregir errores puntuales sin repetir toda la extracción.

Contrato esperado del modo targeted:

```txt
fields[]
context
reason
attempt
```

La extracción original nunca se sobrescribe silenciosamente. Toda corrección debe quedar auditada.

### Staging

La evidencia vive en tablas intermedias, no en `bonus_requests`.

Tablas principales:

- `bonus_fv_extractions`
- `bonus_fc_extractions`
- `bonus_inscripcion_extractions`
- `bonus_financiamiento_extractions`
- `bonus_reposicion_extractions`

Las tablas staging deben conservar suficiente información para que los motores de auditoría puedan reconstruir el problema sin volver al documento completo salvo cuando sea necesario.

FV debe separar explícitamente roles cuando existan:

- facturado a
- compra para / comprador final
- dealer/emisor

INS debe conservar adquirente, RUT y evidencia de identidad.

### Cierre general inicial

Toma las extracciones disponibles y determina:

- documentos presentes / faltantes
- estados por documento
- inconsistencias preliminares
- si la operación requiere auditoría

No corrige silenciosamente.

### Audit router

No contiene lógica compleja de negocio. Lee los errores o inconsistencias detectados y decide:

- qué extractor volver a llamar
- en modo targeted
- qué campos pedir
- qué contexto entregar
- cuántos intentos quedan

Máximo: 2 intentos por problema.

Si no se resuelve:

```txt
REQUIERE_REVISION_HUMANA
```

### Auditor global

Resuelve únicamente inconsistencias entre documentos o roles.

Ejemplo real:

```txt
INS_RUT_CLIENTE_MISMATCH
```

La inscripción puede identificar al adquirente final, mientras la FV puede estar facturada a una aseguradora u otra entidad. El auditor global debe buscar nombre/RUT del adquirente de INS dentro de los distintos roles extraídos de FV.

Si encuentra coincidencia exacta de RUT o una coincidencia inequívoca de identidad, puede resolver la inconsistencia y dejar trazabilidad.

Tabla de auditoría:

`bonus_operation_identity_audits`

La auditoría conserva evidencia y resolución. `bonus_requests` recibe solo el resultado normalizado.

### Cierre general final

Después de los intentos de corrección y auditoría global, vuelve a evaluar la operación completa.

Salida propuesta:

```txt
VERDE    listo para publicación/revisión
AMARILLO requiere revisión humana
ROJO     inconsistencia material no resoluble automáticamente
```

El cierre final es la puerta de entrada a la tabla canónica y al front.

## Tabla canónica

`bonus_requests` representa la operación consolidada.

Principio:

```txt
1 registro = 1 operación
```

No debe almacenar toda la evidencia de extracción. Solo contiene el estado canónico necesario para operación, cálculo y front.

Debe poder actualizarse por UPSERT cuando llegan documentos posteriores.

## Cálculo económico

El cálculo ocurre después de la consolidación y validación documental.

Flujo:

```txt
VIN / versión
→ lista vigente a fecha de venta
→ bonos aplicables
→ reglas Excel oficiales
→ total_devolver
```

Las reglas económicas están documentadas en `docs/business_rules.md`.

El motor de lookup de listas y versiones está documentado en `docs/price_lookup_motor_llm.md`.

## Principios de implementación

- Documento original manda; filename solo ayuda a validar/rutear.
- El LLM extrae; las reglas deterministas validan y calculan.
- No repetir una extracción completa si basta una búsqueda targeted.
- No corregir silenciosamente datos originales.
- Toda corrección debe ser auditable.
- Máximo 2 intentos automáticos por problema.
- Evitar archivos monolíticos: si un motor crece demasiado, separar helpers por responsabilidad.
- `bonus_requests` es tabla canónica; staging y auditoría conservan evidencia.
