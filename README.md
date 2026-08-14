# CIDEF Bonos Dealers

Sistema para digitalizar el ingreso documental de operaciones de dealers y soportar posteriormente la revisión y pago de bonos CIDEF / Forum.

## Alcance actual

El foco actual es únicamente el proceso de ingreso documental.

Flujo objetivo inicial:

```txt
dealer autenticado
→ crea operación
→ carga documentos
→ sistema guarda originales
→ extrae únicamente hechos que no existan ya en las BBDD CIDEF
→ dealer revisa/corrige visualmente si corresponde
→ operación queda disponible para revisión CIDEF
```

La lógica de revisión, aprobación y pago del supervisor CIDEF se definirá después.

## Regla documental general

Cada operación contempla hasta 5 documentos:

```txt
FV      obligatorio
FC      obligatorio
INSCRIP obligatorio
CARTA   opcional
REPOS   opcional
```

Significado:

- `FV`: factura de venta del dealer al cliente final.
- `FC`: factura de compra con la que el dealer compra el vehículo a CIDEF.
- `INSCRIP`: solicitud/certificación de primera inscripción; hoy forma parte del protocolo y acredita la venta real.
- `CARTA`: certificación Forum; aplica cuando la operación usa financiamiento Forum.
- `REPOS`: documento de reposición solicitado por el dealer; no siempre existe.

## Principio de extracción

No duplicar información que ya existe en las BBDD de CIDEF.

El documento aporta:

1. evidencia original;
2. identificadores necesarios para cruzar con sistemas internos;
3. hechos que no estén disponibles en otras fuentes.

El VIN es la llave transversal principal de la operación.

Ejemplo inicial para `FV`:

```txt
vin
folio_factura
fecha_factura
precio_venta_final
financiado_forum (solo si aparece explícitamente)
archivo_original
```

Los campos definitivos se irán cerrando por tipo documental y por dealer cuando corresponda.

## Dealer inicial

Primer caso utilizado para modelar contratos documentales: Rosselot.

## Principios de diseño

```txt
mínimo esfuerzo para el dealer
no exigir digitación manual si el sistema puede extraerla
solo rechazar carga cuando el documento sea materialmente ilegible
archivo original inmutable
datos estructurados separados del original
extracción determinista cuando el formato sea conocido
no construir maestros desde documentos si la información ya existe en CIDEF
```

## Gobierno del trabajo

El trabajo se gobierna desde Trello con la jerarquía:

```txt
Objetivo → Pregunta → Tarea
```

Estado actual:

```txt
OBJ-02 · Digitalizar ingreso de documentación de dealers para pago de bonos
P-02.1 · ¿Cómo debe funcionar el ingreso de una operación de dealer?
T-02.1.1 · Levantar contrato documental del primer dealer
```

Trello mantiene el estado vivo. Esta repo documenta únicamente decisiones suficientemente cerradas.
