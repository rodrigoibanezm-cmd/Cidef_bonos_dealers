# Implementación de extracción documental — Bonos Dealers

## Objetivo

Convertir los documentos cargados por operación en datos estructurados persistidos en Neon, para posteriormente consolidar **1 VIN de venta = 1 operación**, validar la evidencia y calcular los montos a devolver.

El flujo está pensado inicialmente como **herramienta interna CIDEF**. Una operación puede quedar incompleta y completarse mediante cargas posteriores.

## Conceptos económicos

Se consideran cuatro bonos y un ajuste separado:

1. Bono CIDEF
2. Bono financiamiento
3. Bono reposición
4. Otro bono
5. Diferencia de precio — no es bono

La suma final será `total_devolver`.

El cálculo económico se realiza después de consolidar y validar la operación.

## Documentos del flujo

### FV — Factura de venta

Es el documento central de la operación. Su vehículo define el VIN principal de la operación.

Campos relevantes ya definidos en el flujo: VIN/Chasis, fecha de venta, dealer, cliente/RUT y valores de venta.

### FC — Factura de compra CIDEF

Factura electrónica estándar emitida por CIDEF. El identificador vehicular aparece como `Chassis:` y puede repetirse en Observaciones como `VEHICULO:`.

Campos definidos:

- `vin` — leído desde `Chassis:`
- `folio_factura_compra`
- `fecha_factura_compra`
- `precio_compra_neto` — Afecto
- `precio_compra_total` — Total
- `nota_venta`
- `nombre_destinatario`
- `rut_destinatario`
- `marca`
- `modelo`
- `anio`
- `source_filename`

El destinatario se persiste tal cual aparece. Puede ser FORUM u otra entidad; no se fuerza ningún valor.

Persistencia: `bonus_fc_extractions`.

### INS — Inscripción

Se utiliza como evidencia registral y para validar VIN y adquirente/RUT contra la operación de venta.

### FIN — Financiamiento

Documento opcional. Se utiliza para acreditar financiamiento y el eventual bono de financiamiento.

### REPO — Reposición

Documento opcional. La reposición puede involucrar un VIN distinto al VIN central de la venta. Su asociación debe resolverse contra la operación correspondiente, no suponerse únicamente por nombre de archivo.

## Regla de identidad de operación

La operación se identifica por el vehículo vendido:

`VIN operación = VIN FV = VIN FC`

INS debe corresponder al mismo vehículo. FIN debe corresponder al mismo cliente/operación cuando aplique.

REPO es evidencia asociada y puede contener un VIN nuevo diferente.

## Principio crítico para VIN / Chassis

**El nombre del archivo no es fuente de verdad.**

El VIN debe obtenerse del contenido del documento. En FC la fuente primaria es `Chassis:`.

El VIN presente en el nombre del archivo puede usarse solamente como señal secundaria de validación. Nunca debe sustituir, corregir o completar el valor leído desde la factura.

Esto es necesario porque un archivo puede:

- venir sin VIN en el nombre;
- traer un nombre incorrecto;
- ser renombrado;
- contener un VIN distinto al sugerido por el nombre.

## Extracción robusta de Chassis en FC

Se detectó un caso real donde la extracción leyó incorrectamente un carácter del Chassis y el registro terminó con `status=OK`.

Se implementó un helper aislado:

`lib/extract_fc_chassis.js`

Responsabilidades del helper:

1. Leer exclusivamente `Chassis:` desde la factura.
2. Normalizar el resultado sin inventar caracteres.
3. Si no se obtiene VIN, existe error de parseo o una señal secundaria disponible contradice la lectura, ejecutar un segundo intento puntual de Chassis.
4. Registrar primera y segunda lectura para poder detectar consistencia.
5. No asumir nunca que el VIN del nombre del archivo es el VIN correcto.

El retry es puntual para evitar volver a ejecutar innecesariamente la extracción completa del documento.

Prompt específico:

`prompts/fc_vin.js`

Reglas principales del prompt:

- buscar la etiqueta exacta `Chassis:`;
- copiar completo el valor posterior;
- usar `VEHICULO:` solo como confirmación;
- no confundir Motor, Código Inf.Técnico, Nota de Venta o folio;
- no corregir caracteres por intuición;
- devolver null cuando no sea legible con confianza.

## Extracción FC completa

Motor:

`motors/extract_fc.js`

Prompt:

`prompts/fc.js`

Persistencia:

`lib/persist_fc_extraction.js`

Tabla Neon:

`public.bonus_fc_extractions`

La persistencia usa `(tenant_id, file_id)` para evitar duplicar la misma extracción.

## Router y aislamiento de pruebas

Endpoint:

`app/api/document-router/route.js`

Durante la prueba específica de FC se dejó el flujo aislado para evitar gasto de tokens y efectos laterales:

`router → FC → extractor → persistencia → Neon`

FV, INSCRIPCIÓN, FINANCIAMIENTO y REPOSICIÓN quedaron bloqueados durante esta etapa de prueba.

Este bloqueo es temporal y debe retirarse cuando se reactive el flujo integral.

## Validaciones de operación previstas

Las validaciones deben ser deterministas y ejecutarse después de extraer los documentos, sin alterar los datos originales extraídos.

Reglas base:

- `FV.vin = FC.vin`
- `FV.vin = INS.vin`
- `FV.rut_cliente = INS.rut_adquirente`
- si existe FIN: cliente/RUT debe corresponder a la operación
- dealer de la operación debe ser coherente con FV
- `FC.fecha_compra <= FV.fecha_venta`
- si existe REPO: debe quedar asociada explícitamente a la operación central
- VIN nuevo de reposición puede ser distinto del VIN de operación

Cada regla debe producir un resultado auditable, por ejemplo `OK`, `ERROR` o `NO_APLICA`.

Una discrepancia **no debe corregir silenciosamente la extracción**. Debe generar una inconsistencia.

## Tabla consolidada de operaciones

Tabla objetivo:

`bonus_requests`

Principio:

**1 registro = 1 operación.**

La operación debe existir aunque falten documentos y actualizarse mediante UPSERT cuando lleguen nuevas cargas.

Campos principales para render del supervisor:

- ID operación
- dealer
- VIN
- marca
- modelo
- cliente
- RUT cliente
- fecha venta
- estado operativo
- estado documental
- total a devolver
- fecha creación / actualización

Estados operativos definidos:

`PENDIENTE → EN_REVISION → APROBADA → PAGADA`

Salida alternativa:

`RECHAZADA`

## Estado documental

La tabla principal del supervisor no debe mostrar una columna por documento.

Se definió una única celda/badge **Documentación**:

- `COMPLETA`
- `INCOMPLETA`
- `ERROR`

El detalle mediante popover/modal muestra el estado individual:

- FV
- FC
- INS
- FIN
- REPO

Estados visuales previstos:

- OK
- FALTA / ERROR
- NO APLICA

`bonus_requests` ya contempla campos para estados individuales, documentos faltantes e inconsistencias.

## Vista económica del supervisor

La tabla principal debe mantenerse liviana. Se muestra solamente:

**Total a devolver: $X**

con botón **Detalle**.

El detalle económico mostrará:

- Bono CIDEF
- Bono financiamiento
- Bono reposición
- Otro bono
- Diferencia de precio
- Total a devolver

Los conceptos permanecen separados en base de datos aunque el front los compacte.

## Revisión final prevista

Desde el registro de supervisor se abrirá posteriormente la revisión de la operación.

Secuencia prevista:

1. revisar evidencia JPG/PDF documento por documento;
2. validar extracción;
3. revisar validación de bonos;
4. mostrar lista de precios utilizada y fecha/vigencia;
5. mostrar regla aplicada por concepto;
6. mostrar inconsistencias;
7. aprobar o rechazar la operación.

Esta etapa todavía viene después de dejar estable el registro consolidado del supervisor.

## Estado actual / siguiente trabajo

Implementado:

- estructura ampliada de `bonus_requests` en Neon;
- tabla `bonus_fc_extractions`;
- extractor FC;
- prompt FC y prompt específico de Chassis;
- persistencia FC hasta Neon;
- aislamiento temporal del router para probar FC;
- helper `lib/extract_fc_chassis.js` para lectura/retry puntual de Chassis.

Pendiente inmediato:

1. conectar formalmente el nuevo helper de Chassis al motor FC/router y asegurar que `status=OK` solo se produzca con una lectura documental válida;
2. no usar el VIN del filename como requisito de extracción;
3. probar el caso que anteriormente leyó `LVAV2MAB1TU457596` en vez de `LVAV2MAB1TU475796`;
4. una vez estable FC, reactivar documentos y ejecutar el consolidador completo;
5. conectar `bonus_requests` al front supervisor;
6. después implementar cálculo y revisión económica de bonos.

## Caso de regresión conocido

Archivo:

`LVAV2MAB1TU475796 FC.pdf`

Valor correcto en documento:

`Chassis: LVAV2MAB1TU475796`

Extracción errónea observada anteriormente:

`LVAV2MAB1TU457596`

Este archivo debe mantenerse como caso de regresión obligatorio para cualquier cambio futuro del extractor FC.
