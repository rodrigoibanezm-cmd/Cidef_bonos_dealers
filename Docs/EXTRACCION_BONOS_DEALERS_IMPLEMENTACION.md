# Extracción y consolidación de bonos dealers

Estado documentado: 20-08-2026

## 1. Objetivo

Automatizar la recepción interna de antecedentes enviados por dealers para devolver bonos asociados a una venta CIDEF.

Principio central:

**1 VIN de la venta = 1 operación.**

La operación puede nacer incompleta y completarse con nuevas subidas posteriores. No se debe exigir que todos los documentos lleguen juntos.

Por ahora la aplicación se considera **herramienta interna CIDEF**. Se mantiene el formato real en que hoy llegan los archivos, antes de exponer el flujo directamente a dealers.

---

## 2. Documentos del flujo

Documentos considerados:

- FV: factura de venta de la operación.
- FC: factura de compra CIDEF asociada a esa venta.
- INS: inscripción del vehículo.
- FIN: respaldo de financiamiento.
- REPO: factura/documento de reposición.

Los documentos se convierten a JPG por página para clasificación/extracción. Un PDF puede generar varias imágenes.

### Identificador vehicular

En las facturas no se debe exigir la palabra `VIN`.

- FC: normalmente usa `Chassis:`.
- FV: puede usar `Chasis:` o `Chassis:`.

El valor leído desde el documento es la fuente. **Nunca se debe reemplazar el VIN/Chassis extraído por el VIN del nombre del archivo.** El nombre solo puede utilizarse como señal secundaria o validación.

---

## 3. Lógica de negocio descubierta

### Operación principal

El VIN principal de la operación corresponde al vehículo vendido:

`VIN operación = VIN FV = VIN FC`

INS debe corresponder al mismo vehículo.

### Reposición

La reposición introduce un **VIN nuevo**, distinto del VIN vendido.

El problema observado es que el documento de reposición por sí solo puede no contener una referencia suficiente para saber a qué operación original pertenece.

Cuando el nombre/origen no permite amarrarlo de forma segura, se puede recuperar la operación original buscando el VIN central en `inventario_vehiculos_raw` y obteniendo dealer/nota de venta/factura asociados. Esto fue validado con el caso `LMXA14AG7TZ357271`, que permitió asociar la reposición a Automotriz Austral SPA.

Regla práctica descubierta para el formato actual de archivos:

- Si el nombre de una factura CIDEF contiene VIN, puede corresponder a FC de la operación.
- Si no contiene VIN, puede corresponder a reposición.
- Esta regla es de routing y **no reemplaza la lectura del documento ni las validaciones**.

### Financiamiento

Los respaldos de financiamiento pueden venir en distintos formatos, incluyendo cartas/documentos y transferencias. No se debe asumir que todos tienen el mismo layout.

Se extraen los datos propios del financiamiento y luego se valida contra la operación/FV, especialmente identidad del cliente mediante RUT cuando esté disponible.

### FC

FC es una factura electrónica estándar de CIDEF. Se decidió extraer:

- `vin` desde `Chassis`
- `folio_factura_compra`
- `fecha_factura_compra`
- `precio_compra_neto` (`Afecto`)
- `precio_compra_total` (`Total`)
- `nota_venta`
- `nombre_destinatario`
- `rut_destinatario`
- `marca`
- `modelo`
- `anio`
- `source_filename`

El destinatario puede ser FORUM u otra entidad; se persiste exactamente el destinatario real, sin lógica especial por empresa.

### Diferencia de precio

No es un bono.

Debe mantenerse separada de los bonos. La lógica económica descubierta es comparar el precio lleno al que el dealer compró con el precio de venta aplicable. Ejemplo conceptual: compra $11.500.000 y precio de venta $11.000.000 => diferencia a devolver $500.000.

Para el cálculo se requieren los valores extraídos de FC/FV y la regla definitiva de precio aplicable.

---

## 4. Conceptos económicos

Se consideran **4 bonos + 1 ajuste**:

1. `bono_cidef`
2. `bono_financiamiento`
3. `bono_reposicion`
4. `otro_bono`
5. `diferencia_precio` — no es bono

Resultado:

`total_devolver`

El cálculo económico debe ejecutarse **después** de consolidar y validar la operación:

`documentos -> extracción -> persistencia -> consolidación -> validaciones -> cálculo de bonos -> total a devolver -> revisión humana`

---

## 5. Persistencia en Neon

### Extracciones

Se han creado/persistido extracciones específicas por tipo de documento. Para FC existe `bonus_fc_extractions`, con UPSERT por `(tenant_id, file_id)`.

FC queda implementado hasta Neon con los campos definidos arriba.

### Operación consolidada

`bonus_requests` es la tabla destinada a representar la operación que finalmente consume el front supervisor.

Principio:

**1 registro = 1 operación.**

La operación se crea aunque esté incompleta y se actualiza cuando llegan documentos posteriores.

Campos/estado relevantes incorporados:

- VIN, dealer, cliente/RUT y datos principales de la venta.
- estado operativo.
- estado documental general.
- estados individuales FV/FC/INS/FIN/REPO.
- documentos faltantes.
- inconsistencias.
- desglose económico.
- total a devolver.

Estados operativos previstos:

`PENDIENTE -> EN_REVISION -> APROBADA -> PAGADA`

Salida alternativa:

`RECHAZADA`

Estado documental:

- `COMPLETA`
- `INCOMPLETA`
- `ERROR`

Una operación incompleta **no se descarta**.

---

## 6. Validaciones de operación

Las validaciones deben ser deterministas y ejecutarse después de las extracciones.

Reglas definidas hasta ahora:

- `FV.vin = FC.vin`.
- INS debe corresponder al VIN de la operación.
- `FV.rut_cliente = INS.rut_adquirente` cuando ambos existan.
- Si existe FIN: validar RUT del cliente contra FV cuando esté disponible.
- Dealer/RUT dealer debe ser coherente con la operación.
- `FC.fecha_compra <= FV.fecha_venta` cuando ambas fechas existan.
- Si existe REPO: el VIN de reposición es distinto del VIN de la operación y debe quedar correctamente asociado a ella.

Cada validación debe producir un resultado explícito, por ejemplo `OK`, `ERROR` o `NO_APLICA`, y alimentar `tiene_inconsistencias` / `inconsistencias`.

---

## 7. FC: estado actual y problema detectado

### Probado

Se corrió un lote real de 5 FC hasta Neon.

4 de 5 extracciones quedaron correctas al contrastarlas con los originales de Drive.

Caso correcto de referencia:

- `LDP35B960TG455003 FC.pdf`
- Chassis `LDP35B960TG455003`
- folio `20755`
- fecha `25-05-2026`
- neto `$16.227.563`
- total `$19.310.800`
- NV `11230`
- destinatario `AUTOMOTRIZ PORTILLO SUR LIMITADA`
- RUT `76.296.863-0`

Otro caso correcto:

- `LGJE5EE07TM494686 FC.pdf`
- total `$12.318.800`
- NV `39857`
- destinatario `FÓRUM DISTRIBUIDORA S.A.`
- RUT `96.726.670-1`

### Error descubierto

Archivo:

`LVAV2MAB1TU475796 FC.pdf`

Original Drive:

`Chassis: LVAV2MAB1TU475796`

Neon guardó incorrectamente:

`LVAV2MAB1TU457596`

Además quedó con `status = OK`, lo cual es incorrecto.

Esto demostró que no basta con confiar en una única lectura del identificador.

### Corrección en curso

Se creó el helper:

`lib/extract_fc_chassis.js`

Objetivo del helper:

- aislar la lectura de `Chassis` fuera del router/extractor principal;
- evitar seguir creciendo archivos monolíticos;
- permitir retry puntual del Chassis sin repetir toda la extracción costosa;
- normalizar el identificador sin inventar caracteres.

La fuente sigue siendo el documento. Si existe un VIN de nombre/otra fuente, se usa solo como comparación para decidir si conviene repetir la lectura, nunca para sustituir el valor extraído.

**Importante:** al momento de esta documentación el helper fue creado, pero falta terminar de conectarlo al extractor FC y volver a validar el comportamiento end-to-end. No debe considerarse probado todavía.

---

## 8. Routing / activación temporal

Durante las pruebas se han bloqueado tipos de documento para aislar cada motor y evitar gasto innecesario de tokens.

En la última prueba de FC se dejó el flujo enfocado en:

`router -> FC -> extractor -> persistencia -> Neon`

FV, INSCRIPCIÓN, FINANCIAMIENTO y REPOSICIÓN quedaron bloqueados para aislar FC.

Esta configuración es **temporal de prueba**, no la configuración final del pipeline.

---

## 9. Front supervisor definido

La vista principal no debe sobrecargarse.

Una fila representa una operación y debe mostrar solo información esencial, incluyendo:

- dealer
- VIN
- marca/modelo
- cliente
- fecha venta/ingreso
- estado
- documentación
- total a devolver
- acción de revisión

### Documentación

Una sola celda/badge:

- `COMPLETA`
- `INCOMPLETA`
- `ERROR`

Al hover/click se abre detalle tipo:

`FV OK | FC OK | INS OK | FIN FALTA | REPO NO APLICA`

### Bonos

En la tabla principal se muestra **Total a devolver** y un botón/detalle, no cinco columnas económicas.

El detalle contiene los 4 bonos, diferencia de precio y total.

### Revisión posterior

Primera misión del front: **desplegar correctamente el registro consolidado**.

Después se implementará la revisión JPG por JPG. Al final de esa revisión debe existir una sección de validación económica con:

- total a devolver;
- desglose;
- lista de precios utilizada y vigencia;
- regla aplicada;
- inconsistencias;
- aprobación final de la operación.

---

## 10. Qué está probado

- Clasificación/extracción por documentos en el flujo interno.
- Conversión de PDFs a imágenes/páginas.
- Extracciones de INSCRIPCIÓN trabajadas previamente, incluyendo variantes de formato B/N y transferencia.
- Extracción de FINANCIAMIENTO trabajada con formatos reales y persistencia; se cerró esa etapa antes de avanzar.
- Extracción/asociación de REPOSICIÓN trabajada con documentos reales y recuperación de operación desde inventario cuando fue necesario.
- FC estándar definido e implementado hasta Neon.
- Tabla `bonus_fc_extractions` operativa.
- Lote real de 5 FC persistido; 4 correctos y 1 error de lectura de Chassis detectado por auditoría contra Drive.
- Estructura de `bonus_requests` ampliada para operación consolidada, estado documental, inconsistencias y conceptos económicos.

---

## 11. Qué falta

Prioridad inmediata:

1. Conectar `lib/extract_fc_chassis.js` al flujo FC.
2. Definir con precisión cuándo repetir Chassis y qué estado dejar si dos lecturas no permiten confianza suficiente.
3. Asegurar que una lectura dudosa nunca quede silenciosamente como `OK`.
4. Validar FC end-to-end después del cambio.
5. Reactivar los motores necesarios y terminar el consolidador real `FV + FC + INS + FIN + REPO -> bonus_requests`.
6. Implementar/terminar los validadores cruzados de operación.
7. Probar que cargas posteriores completan mediante UPSERT una operación previamente incompleta.
8. Conectar `bonus_requests` al front supervisor.
9. Recién después implementar cálculo de bonos/diferencia de precio y revisión final.

---

## 12. Principios de implementación

- No inventar datos faltantes.
- Documento original manda; filename es metadata/validación.
- No repetir una extracción completa si basta un retry puntual de un campo crítico.
- Persistir resultados útiles una sola vez; evitar dobles pasadas innecesarias que consuman tokens.
- Separar helpers por responsabilidad y evitar archivos/router monolíticos.
- Mantener extracción semántica separada de validaciones y cálculos deterministas.
- Una operación incompleta es un estado válido y debe poder completarse posteriormente.
- Antes de calcular dinero, la operación debe estar consolidada y validada.
