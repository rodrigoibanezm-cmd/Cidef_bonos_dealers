# Reglas de negocio — Bonos Dealers

Estado: 20-08-2026

Estas reglas replican la lógica del archivo Excel utilizado actualmente por CIDEF. Cuando exista diferencia entre una aproximación del sistema y estas fórmulas, **manda la lógica Excel documentada aquí**.

## Variables de referencia

Correspondencia confirmada directamente contra los encabezados de la hoja `DETALLE`
del XLS operacional:

```txt
E = PRECIO DE COMPRA        → monto_compra
F = PRECIO DE VENTA         → monto_venta / precio_venta
H = PRECIO DE LISTA VTA     → precio_lista_venta
I = BONO CIDEF              → bono_cidef
J = BONO FIN VTA            → bono_fin_venta
K = BONO CIERRE VTA         → bono_cierre_venta
L = DESCUENTOS DEALER       → descuentos_dealer
M = FECHA DE COMPRA         → fecha_compra
N = FECHA DE VENTA          → fecha_venta
P = FAC COMPRA              → fac_compra_ok
Q = FAC VTA                 → fac_venta_ok
R = PDV OK                  → pdv_ok
S = INSCRIPCION VTA         → inscripcion_venta_ok
T = FAC REPOSICION          → fac_reposicion_ok
U = CARTA DE CREDITO        → carta_credito_ok
V = DIAS DE STOCK           → dias_stock_dealer
W = BONO DIF                → bono_dif
X = BONO CIERRE             → bono_cierre
Y = BONO FIN                → bono_fin
```

La implementación debe mapear estos conceptos a campos canónicos, pero conservar exactamente la misma lógica matemática.

## PDV_OK

Fórmula original:

```excel
=SI(F2="";"";SI((F2=(H2-J2-K2-L2-I2))=VERDADERO;"OK";""))
```

Regla:

```txt
si F está vacío → ""
si F = H - J - K - L - I → "OK"
si no → ""
```

No se debe introducir tolerancia matemática salvo que negocio la defina explícitamente.
`L = DESCUENTOS DEALER` sólo participa en esta validación cuando existe un monto
aprobado con procedencia independiente. No se puede despejar
`L = H - J - K - I - F` y reutilizarlo para aprobar la misma igualdad.

El sistema puede calcular como diagnóstico:

```txt
descuento_dealer_residual = H - J - K - I - F
```

Ese residual no es un descuento aprobado, no se persiste en `descuentos_dealer` y
no cambia `PDV_OK` a `OK` por sí solo.

## DIAS_STOCK

Fórmula original:

```excel
=SI((Y(M2="";N2=""));"";(N2-M2))
```

Regla:

```txt
si fecha_compra y fecha_venta están vacías → ""
en otro caso → fecha_venta - fecha_compra
```

En la implementación actual se trabaja en días calendario.

## BONO_DIF versionado

La fórmula depende del período de la operación. No se debe promover la regla de
un mes a todos los períodos sin evidencia operacional.

### Marzo 2026

La planilla revisada de marzo usa:

```excel
=SI((Y(P2="OK";Q2="OK";R2="OK";S2="OK";T2="OK";V2<91;V2>1))=VERDADERO;
   (SI((E2-(H2*0,92))<0;0;(E2-(H2*0,92))));
   "")
```

Por tanto:

```txt
base_marzo_2026 = E - (H * 0.92)
BONO_DIF = max(0, base_marzo_2026)
```

`I = BONO CIDEF` no se resta en la fórmula de marzo.

### Regla previamente documentada para otros períodos

Fórmula original:

```excel
=SI((Y(P2="OK";Q2="OK";R2="OK";S2="OK";T2="OK";V2<91;V2>1))=VERDADERO;
   (SI((E2-((H2-I2)*0,92))<0;0;(E2-((H2-I2)*0,92))));
   "")
```

Condiciones:

```txt
P = OK
Q = OK
R = OK
S = OK
T = OK
1 < dias_stock < 91
```

Cálculo:

```txt
base = E - ((H - I) * 0.92)
BONO_DIF = max(0, base)
```

El motor conserva esta regla para períodos distintos de marzo 2026 hasta que una
auditoría del XLS del período confirme otra versión. En ambas versiones el valor
matemático no depende de `L = descuentos_dealer`. Si no se cumplen las condiciones
P/Q/R/S/T y stock, la celda pagable `BONO_DIF` queda vacía aunque la base se pueda
calcular para diagnóstico.

`BONO_DIF` corresponde a diferencia de precio; conceptualmente no es un bono comercial y debe mantenerse separado en la información económica.

## BONO_CIERRE

Fórmula original:

```excel
=SI((Y(P2="OK";Q2="OK";R2="OK";S2="OK";T2="OK";V2<91;V2>1))=VERDADERO;K2;"")
```

Condiciones:

```txt
P = OK
Q = OK
R = OK
S = OK
T = OK
1 < dias_stock < 91
```

Resultado:

```txt
BONO_CIERRE = bono_cierre_venta
```

Por defecto, `K` es el bono promocional de la fila de lista aplicable. En marzo
2026 corresponde a la columna `Bono Marzo`, importada canónicamente como
`price_history.bono_mes`. No se deben sumar campos duplicados del payload ni
reconstruir el monto desde múltiples alias.

Los conceptos se mantienen separados:

```txt
bono_cierre_lista    = price_history.bono_mes
bono_cierre_override = monto manual conocido, si existe
bono_cierre_efectivo = bono_cierre_lista mientras el override no sea aprobado
```

El motor nunca infiere un override desde el residual económico. Un override
manual exige monto, motivo, fuente/autorización, actor y fecha. Si el valor
histórico/manual difiere de la lista, el cálculo queda `REQUIERE_REVISION` y el
override no sustituye automáticamente el valor de lista.

## BONO_FIN

Fórmula original:

```excel
=SI((Y(P2="OK";Q2="OK";R2="OK";S2="OK";U2="OK"))=VERDADERO;(J2/3);"")
```

Condiciones:

```txt
P = OK
Q = OK
R = OK
S = OK
U = OK
```

Resultado:

```txt
BONO_FIN = bono_financiamiento_venta / 3
```

Si no existe financiamiento aplicable, el estado documental de financiamiento debe ser `NO_APLICA` y no corresponde pagar `BONO_FIN`.

## TOTAL_DEVOLVER

El total final utilizado por el flujo consolidado se calcula con los conceptos efectivamente pagables de la operación.

En los casos actualmente implementados:

```txt
total_devolver = bono_dif + bono_cierre + bono_fin
```

Otros conceptos (`bono_cidef`, reposición, otro bono) se mantienen separados y solo deben incorporarse al total cuando la regla operacional correspondiente esté definida y habilitada.

## Lookup de lista vigente

Para calcular los bonos de venta:

1. Resolver VIN → marca/modelo/versión.
2. Buscar la lista con `vigencia_desde <= fecha_venta`.
3. Elegir la lista más reciente que cumpla la condición.
4. Extraer desde esa fila los valores aplicables, incluyendo:
   - precio lista
   - bono CIDEF
   - bono financiamiento/Forum
   - bono promocional (`bono_mes`), usado por defecto como bono cierre
5. Ejecutar las fórmulas anteriores.

## Caso de regresión marzo 2026

```txt
VIN: LGJE1EE09TM494653
Precio compra: $11.950.800
Precio venta: $10.890.000
Precio lista: $13.290.000
Bono CIDEF: $300.000
Bono financiamiento: $600.000
Bono promocional / cierre lista: $500.000
Descuento dealer aprobado necesario para PDV_OK: $1.000.000
```

Con todos los controles P/Q/R/S/T/U en `OK`:

```txt
BONO_DIF_MARZO = max(0, $11.950.800 - ($13.290.000 * 0,92)) = $0
BONO_CIERRE = $500.000
BONO_FIN = $600.000 / 3 = $200.000
TOTAL_DETERMINISTICO = $700.000
```

La planilla histórica contiene `bono_cierre = $300.000`. Esa diferencia se trata
como override manual no reproducible y deja la operación `REQUIERE_REVISION`; no
reemplaza automáticamente los $500.000 provenientes de la lista.

Caso de regresión documental:

```txt
VIN: LVAV2MAB5TU475588
Compra (FC): 31-03-2026
Precio compra (E): $15.799.511
Venta: 11-06-2026
Precio venta (F): $15.000.000
Versión: FOTON G7 LITE 2.0 MT 4X4
Lista utilizada: 03-06-2026
Precio lista: $15.490.000
Bono CIDEF: $900.000
Bono Forum: $600.000
Bono cierre: $100.000
```

Con la fórmula correcta, el valor matemático es:

```txt
DIAS_STOCK = 72
BONO_DIF_MATEMATICO
= $15.799.511 - (($15.490.000 - $900.000) * 0,92)
= $2.376.711
```

El XLS adjunto es una plantilla sin filas operacionales y los documentos/staging
actuales no aportan una fuente canónica independiente para `L = DESCUENTOS DEALER`.
Por eso `PDV_OK` queda indeterminado y `BONO_DIF`, `BONO_CIERRE`, `BONO_FIN` y
`TOTAL_DEVOLVER` no son pagables todavía.

El valor legado `descuentos_dealer = -$1.110.000` no es evidencia: coincide
exactamente con el antiguo despeje `H - J - K - I - F`. El total histórico
`$1.877.200` también corresponde al cálculo anterior que usaba erróneamente
`F = $15.000.000` en BONO_DIF en lugar de `E = $15.799.511`; no es una salida
válida de las fórmulas del XLS corregidas.

## Validaciones documentales y cálculo

Los bonos no deben calcularse a partir de una operación documentalmente inconsistente sin pasar antes por el cierre/auditoría.

La secuencia correcta es:

```txt
extracción
→ validaciones preliminares
→ auditoría targeted/global cuando corresponda
→ cierre general final
→ lookup de precio
→ reglas económicas
→ total_devolver
```

Las fórmulas no deben corregir documentación ni resolver identidades. Esas responsabilidades pertenecen a capas anteriores.
