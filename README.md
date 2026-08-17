# CIDEF Bonos Dealers

Sistema para digitalizar el ingreso documental de operaciones de dealers y soportar la revisión y pago de bonos CIDEF / Forum.

## Flujo actual

```txt
dealer autenticado
→ crea operación
→ carga documentos
→ sistema guarda originales
→ extrae únicamente hechos que no existan ya en las BBDD CIDEF
→ dealer revisa/corrige visualmente si corresponde
→ operación queda INGRESADA para revisión CIDEF
→ supervisor revisa cada PDF secuencialmente
→ cada PDF aprobado queda firmado por usuario + tenant supervisor
→ al aprobar todos los PDF requeridos, la solicitud queda APROBADA
→ pago posterior
```

## Tenancy

Toda operación pertenece a un `tenant_id` dealer. El tenant se obtiene desde autenticación y no desde el documento ni desde un valor libre del frontend.

Los usuarios CIDEF pertenecen al tenant CIDEF y acceden a tenants dealer según rol/permisos. Propiedad del dato y permisos de acceso son conceptos separados.

Todos los supervisores autorizados pueden ver la cola completa. La aprobación se firma con el usuario concreto y su tenant; no basta identificar solamente el tenant supervisor.

## Regla documental general

```txt
FV      obligatorio · contrato específico por dealer
FC      obligatorio · contrato global CIDEF
INSCRIP obligatorio · contrato global Registro Civil
CARTA   condicional · requerida cuando corresponde Forum
REPOS   opcional    · se revisa si existe
```

- `FV`: factura de venta del dealer al cliente final.
- `FC`: factura de compra con la que el dealer compra el vehículo a CIDEF.
- `INSCRIP`: parte del protocolo; se conserva y solo se valida que corresponda al VIN de la operación.
- `CARTA`: certificación Forum; su presencia acredita financiamiento Forum.
- `REPOS`: factura/documento de reposición; no siempre existe.

## Principio de extracción

No duplicar información que ya existe en las BBDD de CIDEF. El VIN es la llave transversal principal.

El documento aporta evidencia original, identificadores de cruce y hechos que no estén disponibles internamente.

`FV` aporta como mínimo:

```txt
vin
folio_factura
fecha_factura
precio_venta_final
financiado_por
archivo_original
```

## Arquitectura de extracción

```txt
documento original
→ motor por tipo documental
→ prompt separado
→ helper Gemini
→ JSON cerrado por schema del motor
→ validaciones deterministas posteriores
```

El LLM extrae; no aprueba, no calcula bonos y no decide reglas de negocio.

Configuración base:

```txt
extracción: gemini-3.5-flash-lite
thinking: minimal
structured output: schema definido por cada motor
SDK: @google/genai 1.8.0
```

Variables:

```txt
GEMINI_API_KEY       obligatoria
GEMINI_EXTRACT_MODEL opcional; default gemini-3.5-flash-lite
```

## Revisión CIDEF

La solicitud canónica sigue siendo `bonus_requests`; no se crea una segunda tabla para la cola administrativa.

Cada PDF vive en `bonus_request_documents` y se aprueba completo, uno por uno, en orden:

```txt
FC → FV → INSCRIP → CARTA si aplica → REPOS si existe
```

Cada documento guarda:

```txt
review_status
reviewed_by_user_id
reviewed_by_tenant_id
reviewed_at
reviewed_extraction
```

`reviewed_extraction` conserva el resultado final validado por el supervisor, incluyendo correcciones realizadas durante la revisión.

La solicitud guarda la firma final:

```txt
approved_by_user_id
approved_by_tenant_id
approved_at
```

`bonus_request_events` mantiene la bitácora de acciones por solicitud/documento.

Migración: `db/001_supervisor_approval.sql`.

Lecturas de cola/KPIs: `lib/approval_queue.js`.

Flujo secuencial de aprobación: `lib/approval_workflow.js`.

## Vista central administrativa

La vista central se modela como cola operacional estilo CMS:

```txt
KPIs: total mes · total año · pendientes · urgentes
cola: VIN · marca/modelo · dealer · fecha ingreso · días · estado · abrir
sidebar: dealers → histórico de solicitudes aprobadas del dealer seleccionado
```

`total mes` y `total año` cuentan solicitudes aprobadas. La cola muestra únicamente `INGRESADA`. La regla de urgencia se entrega como parámetro y no queda hardcodeada en la consulta.

Marca/modelo no se duplican en `bonus_requests`: deben resolverse por VIN desde las BBDD canónicas CIDEF al construir el read model final.

## Almacenamiento

```txt
Google Drive → documentos originales
Neon        → operaciones, estado, metadatos, extracciones, validaciones y referencias Drive
```

## Principios de diseño

```txt
mínimo esfuerzo para el dealer
no exigir digitación manual si el sistema puede extraerla
solo rechazar carga cuando el documento sea materialmente ilegible
archivo original inmutable
datos estructurados separados del original
contratos versionados
no construir maestros desde documentos si la información ya existe en CIDEF
1 PDF = 1 aprobación humana
firma explícita de usuario + tenant en toda aprobación
```

## Gobierno del trabajo

```txt
OBJ-02 · Digitalizar ingreso de documentación de dealers para pago de bonos
P-02.1 · ¿Cómo debe funcionar el ingreso de una operación de dealer?
T-02.1.2 · Diseñar motor global extract_fc
```

Trello mantiene el estado vivo. Esta repo documenta únicamente decisiones suficientemente cerradas.
