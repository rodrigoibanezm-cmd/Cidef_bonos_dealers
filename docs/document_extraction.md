# Extracción documental y evidencia

Estado: 20-08-2026

## Objetivo

Cada motor documental debe extraer hechos observables y persistir evidencia suficiente para validaciones y auditoría posteriores.

La extracción no debe decidir reglas económicas ni aprobar una operación.

## Documentos

### FV — Factura/orden de venta

Es el documento central de la venta.

Campos actuales relevantes:

- VIN / Chasis
- folio
- fecha venta
- precio venta total
- dealer / RUT dealer
- financiamiento explícito cuando exista
- identidades presentes en el documento

FV puede contener más de un rol de identidad. Debe distinguirse entre:

- `nombre_facturado` / `rut_facturado`: bloque Señor(es), receptor o equivalente.
- `nombre_compra_para` / `rut_compra_para`: bloque COMPRA PARA o equivalente.
- comprador final normalizado: se resuelve posteriormente usando evidencia cruzada.

No debe asumirse que `Señor(es)` siempre corresponde al adquirente final.

Caso real: una FV puede estar facturada a una aseguradora y contener en `COMPRA PARA` al adquirente que luego aparece en la inscripción.

### FC — Factura de compra CIDEF

Campos principales:

- `vin` leído desde `Chassis:`
- folio factura compra
- fecha factura compra
- precio compra neto
- precio compra total
- nota de venta
- destinatario / RUT
- marca
- modelo
- año

Regla crítica: el VIN del documento es la fuente. El VIN del filename no puede reemplazarlo.

Si la lectura de Chassis es dudosa, debe hacerse retry puntual de Chassis, no repetir necesariamente toda la FC.

Caso de regresión obligatorio:

```txt
LVAV2MAB1TU475796 FC.pdf
Chassis correcto: LVAV2MAB1TU475796
```

Si el dealer no aporta FC y no existe una fila en `bonus_fc_extractions`, la consolidación puede reconstruir evidencia interna desde `inventario_vehiculos_global_raw`. Sólo aplica cuando existe una única fila con VIN exacto, `es_dealer=true`, dealer consistente con la FV y factura, fecha, monto con IVA, nota de venta, marca y modelo completos.

La reconstrucción mantiene `source=INVENTARIO`, `documento_original=false` y `fc_reconstruida=true`. No se inserta en staging ni se materializa como archivo. El cierre append-only registra `FC_NO_APORTADA_POR_DEALER` y `FC_RECONSTRUIDA_DESDE_INVENTARIO` como señales informativas. Si falta un campo esencial, hay más de una fila o existe una inconsistencia, FC continúa en estado `FALTA`.

### INSCRIPCION

Se usa como evidencia registral del vehículo y adquirente.

Campos principales:

- VIN
- PPU
- marca/modelo/año
- nombre adquirente
- RUT adquirente
- dealer/RUT dealer cuando exista

El adquirente INS es una señal fuerte para resolver la identidad del comprador final de la operación.

### FINANCIAMIENTO

Documento opcional.

Se usa para acreditar financiamiento y eventualmente bono de financiamiento.

Debe conservar al menos:

- cliente / RUT
- financiera
- monto financiado si existe
- número de operación si existe
- fecha de aprobación si existe

Si no existe documento ni financiamiento aplicable, el estado correcto es `NO_APLICA`, no error.

### REPOSICION

Documento opcional.

Puede contener un VIN distinto al VIN de la operación.

Regla actual para facturas CIDEF visualmente similares:

```txt
VIN documento == VIN operación → FC
VIN documento != VIN operación → REPOSICION
```

Para reposición deben conservarse explícitamente:

- VIN operación/original
- VIN nuevo/reposición
- fecha
- monto
- evidencia de asociación

## Persistencia y evidencia

La extracción completa se persiste en tablas staging. Estas tablas son la fuente para los motores de auditoría.

La tabla canónica `bonus_requests` no debe cargar todos los detalles de evidencia.

### Evidencia de identidad

FV e INS deben conservar evidencia estructurada para que el auditor pueda revisar roles sin depender de una inferencia previa única.

Campos incorporados en FV staging:

- `nombre_facturado`
- `rut_facturado`
- `nombre_compra_para`
- `rut_compra_para`
- `identity_evidence`

INS staging incorpora `identity_evidence`.

## Estados de extracción

Cada extractor debe dejar un estado explícito, por ejemplo:

- `OK`
- `VIN_MISMATCH`
- `VIN_UNREADABLE`
- `PARSE_ERROR`
- `INVALID_DOCUMENT`
- `REQUIERE_CORRECCION`

Una operación no se invalida completa porque un documento tenga un problema. El error se registra y el flujo sigue.

## Extracción targeted

Los extractores deben evolucionar para aceptar modo targeted.

Objetivo: cuando el cierre general detecte un error puntual, el auditor puede volver a llamar al mismo extractor con una instrucción quirúrgica.

Ejemplos:

```txt
FV: buscar únicamente nombre/RUT bajo COMPRA PARA
FC: leer únicamente Chassis
INS: releer únicamente RUT adquirente
```

Contrato conceptual:

```txt
mode: targeted
fields: [...]
context: {...}
reason: ...
attempt: 1 | 2
```

La respuesta targeted se registra como auditoría/corrección y no borra la extracción original.

Contrato implementado:

```txt
mode: "targeted"
fields: lista no vacía de campos declarados por ese extractor
context: objeto con valores de comparación, nunca fuente del dato
reason: código de inconsistencia
attempt: 1 | 2
```

El resultado queda en `bonus_document_extraction_audits`. El cierre usa un overlay en memoria sobre la extracción full; las tablas staging originales no se actualizan con el resultado targeted.

`operation_vin` asocia cada staging con la operación aunque el documento contenga otro VIN o no contenga VIN. Es identidad de enrutamiento, no evidencia extraída del documento.

## Reglas de retry

- No hay loops abiertos.
- Máximo 2 intentos automáticos por problema.
- Si no se resuelve, queda `REQUIERE_REVISION_HUMANA`.
- El retry debe limitarse al campo o grupo de campos que originó el problema.

## Validaciones preliminares

Después de extraer se pueden marcar inconsistencias simples, sin intentar resolverlas todavía:

- FV VIN vs FC VIN
- FV VIN vs INS VIN
- RUT cliente preliminar FV vs RUT adquirente INS
- RUT cliente vs FIN cuando aplica
- VIN original vs VIN nuevo de REPO
- fechas de compra/venta incoherentes

Estas inconsistencias son señales para la siguiente capa, no necesariamente errores definitivos.

## Normalización de identidad

La identidad final se resuelve después de la primera pasada.

Ejemplo real:

1. FV preliminar lee como receptor a ZENIT SEGUROS.
2. INS lee adquirente JOHNSON SOLAR COMPANY LIMITADA.
3. Se marca `INS_RUT_CLIENTE_MISMATCH`.
4. Auditor global busca nombre/RUT de INS dentro de los roles FV.
5. Encuentra JOHNSON SOLAR en `COMPRA PARA`.
6. Resuelve comprador final y elimina la inconsistencia.

La extracción original de la FV se conserva intacta; cambia únicamente la interpretación normalizada de la operación.

Regresión automatizada: `tests/surgical_document_audit.test.js`, VIN `LVAV2MAB1TU475796`.
