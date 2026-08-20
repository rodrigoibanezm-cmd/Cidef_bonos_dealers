# CIDEF Bonos Dealers

Sistema para automatizar ingreso documental, validación, consolidación y cálculo de bonos/devoluciones de operaciones dealers.

## Principio central

```txt
1 VIN de venta = 1 operación
```

Una operación puede nacer incompleta y completarse con cargas posteriores.

## Pipeline actual/objetivo

```txt
documentos originales
→ normalización PDF/JPG
→ document_router
→ extractor por tipo (full)
→ staging por documento
→ cierre general inicial
→ audit_router
→ extractor targeted si hay error puntual
→ auditor global si hay inconsistencia cruzada
→ cierre general final
→ bonus_requests
→ cálculo económico
→ front
```

Los extractores obtienen hechos. Las validaciones y cálculos son deterministas.

Los retries automáticos son quirúrgicos y limitados a un máximo de 2 intentos por problema. Si no se resuelve, la operación queda para revisión humana.

## Documentos

```txt
FV      factura/orden de venta
FC      factura de compra CIDEF
INSCRIP inscripción registral
FIN     respaldo de financiamiento, cuando aplica
REPOS   reposición, cuando existe
```

FC y REPOS pueden tener formato visual similar. La decisión final se basa en el VIN leído del documento frente al VIN de la operación.

## Persistencia

Neon mantiene:

- tablas staging por tipo documental;
- evidencia y auditoría;
- `bonus_operation_identity_audits` para resolución de identidad;
- `bonus_requests` como tabla canónica final por operación.

La evidencia detallada vive en staging/auditoría, no en `bonus_requests`.

## Almacenamiento

```txt
Cloudflare R2 → documentos originales/normalizados
Neon          → extracciones, auditoría, consolidación y cálculo
Vercel        → aplicación y motores
```

## Documentación

Toda la documentación técnica y de negocio vive únicamente en `docs/`:

- `docs/architecture.md` — arquitectura completa del pipeline y auditoría.
- `docs/document_extraction.md` — contratos, evidencia, staging y retries targeted.
- `docs/business_rules.md` — reglas oficiales del XLS: PDV_OK, días stock, bono diferencia, cierre y financiamiento.
- `docs/price_lookup_motor_llm.md` — lookup VIN/version/lista vigente y matching de precios.

## Principios de implementación

- Documento original manda; filename es solo señal secundaria.
- No inventar datos faltantes.
- No corregir silenciosamente extracciones originales.
- Guardar evidencia suficiente en staging.
- Repetir solo el campo necesario cuando haya error.
- Máximo 2 intentos automáticos por problema.
- Mantener extracción, auditoría, consolidación y cálculo desacoplados.
- Evitar archivos monolíticos; separar helpers por responsabilidad.
- `bonus_requests` es la operación canónica que consume el front.
