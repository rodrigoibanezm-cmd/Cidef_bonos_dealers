# Reglas de negocio — Bonos Dealers

Estado: 20-08-2026

Estas reglas replican la lógica del archivo Excel utilizado actualmente por CIDEF. Cuando exista diferencia entre una aproximación del sistema y estas fórmulas, **manda la lógica Excel documentada aquí**.

## Variables de referencia

Para mantener correspondencia con el XLS original:

```txt
E = monto/precio de compra usado por la planilla
F = PDV / valor que se valida
H = precio de referencia/lista
I = descuento dealer
J = bono financiamiento venta
K = bono cierre venta
L = otro descuento/bono considerado por la planilla
M = fecha compra
N = fecha venta
P,Q,R,S,T,U = validaciones documentales
V = días de stock
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

Si no se cumplen las condiciones, queda vacío.

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

Caso validado:

```txt
VIN: LVAV2MAB5TU475588
Venta: 11-06-2026
Versión: FOTON G7 LITE 2.0 MT 4X4
Lista utilizada: 03-06-2026
Precio lista: $15.490.000
Bono CIDEF: $900.000
Bono Forum: $600.000
Bono cierre: $100.000
```

Resultado validado del motor:

```txt
PDV_OK = OK
DIAS_STOCK = 72
BONO_DIF = $1.577.200
BONO_CIERRE = $100.000
BONO_FIN = $200.000
TOTAL_DEVOLVER = $1.877.200
```

Este caso debe mantenerse como prueba de regresión de cálculo.

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
