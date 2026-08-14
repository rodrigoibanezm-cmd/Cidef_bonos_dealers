# CIDEF Bonos Dealers

Sistema para digitalizar el ingreso documental de operaciones de dealers y soportar posteriormente la revisión y pago de bonos CIDEF / Forum.

## Alcance actual

El foco actual es únicamente el proceso de ingreso documental.

```txt
dealer autenticado
→ crea operación
→ carga documentos
→ sistema guarda originales
→ extrae únicamente hechos que no existan ya en las BBDD CIDEF
→ dealer revisa/corrige visualmente si corresponde
→ operación queda disponible para revisión CIDEF
```

## Tenancy

Toda operación pertenece a un `tenant_id` dealer. El tenant se obtiene desde autenticación y no desde el documento ni desde un valor libre del frontend.

Los usuarios CIDEF pertenecen al tenant CIDEF y acceden a tenants dealer según rol/permisos. Propiedad del dato y permisos de acceso son conceptos separados.

## Regla documental general

```txt
FV      obligatorio · contrato específico por dealer
FC      obligatorio · contrato global CIDEF
INSCRIP obligatorio · contrato global Registro Civil
CARTA   opcional    · contrato global Forum
REPOS   opcional    · contrato global CIDEF
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

## Primer motor global

`motors/extract_fc.js`

Salida V1:

```txt
tenant_id
document_type = FC
contract_version
file_id
vin
folio_factura_compra
fecha_factura_compra
precio_compra_total
nota_venta
readable
parse_error
```

El schema de salida pertenece al motor. El prompt vive separado en `prompts/fc.js`. La llamada al modelo está encapsulada en `lib/gemini_client.js` y `lib/run_document_extraction.js`.

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
```

## Gobierno del trabajo

```txt
OBJ-02 · Digitalizar ingreso de documentación de dealers para pago de bonos
P-02.1 · ¿Cómo debe funcionar el ingreso de una operación de dealer?
T-02.1.2 · Diseñar motor global extract_fc
```

Trello mantiene el estado vivo. Esta repo documenta únicamente decisiones suficientemente cerradas.
