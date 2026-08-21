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
`L = DESCUENTOS DEALER` debe provenir de evidencia independiente. No se puede
despejar `L = H - J - K - I - F` y reutilizarlo para aprobar la misma igualdad.

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

## BONO_DIF

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

El valor matemático de `base` requiere solamente `E`, `H` e `I`; no depende de
`L = descuentos_dealer`. Si no se cumplen las condiciones P/Q/R/S/T y stock,
la celda pagable `BONO_DIF` queda vacía aunque esa base matemática se pueda
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

Importante: se toma únicamente el bono mes/cierre vigente de la lista aplicable. No se deben sumar campos duplicados del payload ni reconstruirlo desde múltiples alias.

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
   - bono mes/cierre
5. Ejecutar las fórmulas anteriores.

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
