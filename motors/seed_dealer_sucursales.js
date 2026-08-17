import { db } from "../lib/db.js";

const SUCURSALES = [
  ["IMPORT & EXPORT", "I - Tarapaca", "Iquique", "Iquique", "Av. Colon 49 - A, Iquique", "Abierto"],
  ["VARAS HERMANOS", "III - Atacama", "Copiapó", "Copiapo", "Panamericana norte km 812, Copiapo", "Abierto"],
  ["AUTOMOTRIZ CARMONA Y COMPAÑIA LIMITADA", "IV - Coquimbo", "La Serena", "La Serena", "Avenida Balmaceda 3570, La Serena", "Abierto"],
  ["VALDEPEZ SPA", "V - Valparaiso", "La Calera", "Calera", "Lautaro 78, La Calera", "Abierto"],
  ["VALDEPEZ SPA", "V - Valparaiso", "Curauma", "Curauma", "Boulevard 68, undecimo 1605, Curauma, Valparaiso", "Abierto"],
  ["VALDEPEZ SPA", "V - Valparaiso", "Quilpué", "El Belloto", "Av. Freire 2411, local 9, Mall Centro El Belloto, Quilpue", "Abierto"],
  ["COLON", "V - Valparaiso", "Concón", "Concon", "Av. Concon Reñaca Oriente 806, Concon", "Abierto"],
  ["COLON", "V - Valparaiso", "Quillota", "Quillota", "Ramon Freire 1113, Quillota", "Abierto"],
  ["COLON", "V - Valparaiso", "Valparaíso", "Valparaiso", "Av. Independencia 2590, Valparaiso", "Abierto"],
  ["COLON", "V - Valparaiso", "Viña del mar", "Viña del Mar", "Calle Quillota 550, Viña del Mar", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "V - Valparaiso", "Camino Internacional", "Concon", "Camino Internacional 4100, Concon", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "V - Valparaiso", "Libertad", "Viña del Mar", "Calle 11 Norte 653, Viña del Mar", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "V - Valparaiso", "Viña del mar el Salto", "Limache Viña de Mar", "Calle Limache 3865, Viña del Mar", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "V - Valparaiso", "San Antonio", "San Antonio", "Barros Luco 2510, San Antonio", "Abierto"],
  ["AUTOS OGAZ", "RM - Metropolitana", "Macul", "Macul", "Av. Departamental 4500, Macul", "Abierto"],
  ["ROMANINI", "RM - Metropolitana", "Melipilla", "Melipilla", "Av. Ortuzar 1099, Melipilla", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "RM - Metropolitana", "Ñuñoa", "Irarrazaval", "Av. Irarrazaval 1235, Ñuñoa", "Abierto"],
  ["PIAMONTE", "RM - Metropolitana", "Santiago Centro", "Agustina", "Agustina 2138, Santiago Centro", "Abierto"],
  ["AUTOMOTRIZ FOR CENTER S.A", "RM - Metropolitana", "Las Condes", "Mall Plaza Los Dominicos", "Padre Hurtado sur 875, Mall Plaza Los Dominicos, Las Condes", "Abierto"],
  ["AUTOS OGAZ", "RM - Metropolitana", "Providencia", "Bilbao", "Av. Francisco Bilbao 2537, Providencia", "Abierto"],
  ["AUTOMOTRIZ FOR CENTER S.A", "RM - Metropolitana", "Puente alto", "Mall Plaza Tobalaba", "Av. Camilo Henriquez 5615, Mall Plaza Tobalaba, Puente alto", "Abierto"],
  ["AUTOMOTRIZ FOR CENTER S.A", "RM - Metropolitana", "Puente Alto", "Concha y Toro", "Av. Concha y Toro 1158, Puente Alto", "Abierto"],
  ["GELLONA", "RM - Metropolitana", "La cisterna", "La Cisterna", "Av. Gran Avenida 6819, La Cisterna", "Abierto"],
  ["COMERCIAL GRASS & ARUESTE LTDA.", "RM - Metropolitana", "Ñuñoa", "Irarrazaval", "Av. Irarrazaval 3290, Ñuñoa", "Abierto"],
  ["COMERCIAL GRASS & ARUESTE LTDA.", "RM - Metropolitana", "Chicureo", "Chicureo", "Av. Chicureo km 2,8, Colina", "Abierto"],
  ["COMERCIAL GRASS & ARUESTE LTDA.", "RM - Metropolitana", "San Bernardo", "San Bernardo", "Colon sur 625, San Bernardo", "Abierto"],
  ["KLASSIK CAR S.A.", "RM - Metropolitana", "Vitacura", "Vitacura", "Av. Vitacura 8126, Vitacura", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "RM - Metropolitana", "Huechuraba", "Huechuraba", "Av. Americo Vespucio 1155, local D3, Huechuraba", "Abierto"],
  ["RENTAL BASILIO", "VI - Libertador General Bernardo O'Higgins", "Santa Cruz", "Santa Cruz", "Orlando Diaz Besoain 470, Santa Cruz", "Abierto"],
  ["VEGA ARTUS", "VI - Libertador General Bernardo O'Higgins", "Rancagua", "Rancagua", "Miguel Ramirez 525, Rancagua", "Abierto"],
  ["CURIFOR", "VII - Maule", "Curicó", "Curico", "Longitudinal sur Km 186,5, Romeral, Curico", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "VII - Maule", "Linares", "Linares", "Kurt Moller 0101, Linares", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "VII - Maule", "Talca", "Talca", "Veintiuno oriente 832, Talca", "Abierto"],
  ["AUTOMOTRIZ ROSSELOT S.A.", "VIII - Bio Bio", "Concepción", "Concepcion", "Angol 98, esquina Chacabuco, Concepción", "Abierto"],
  ["AUTOMOTRIZ PORTILLO SUR LIMITADA", "IX - La Araucania", "Temuco", "Temuco", "San Martin 334, Temuco", "Abierto"],
  ["AUTOMOTRIZ PORTILLO SUR LIMITADA", "X - Los Lagos", "Osorno", "Osorno", "Av. Rene Soriano 2613, Osorno", "Abierto"],
  ["AUTOMOTRIZ AUSTRAL SPA", "X - Los Lagos", "Puerto Montt", "Puerto Montt", "Panamericana 500, Puerto Montt", "Abierto"],
  ["MEGACENTER", "XII - Magallanes y Antartica Chilena", "Punta Arenas", "Punta Arenas", "Av. Principal, Manzana 4A, local 2, Zona Franca, Punta Arenas", "Abierto"]
];

export async function seedDealerSucursales() {
  const sql = db();

  await sql`
    create table if not exists dealer_sucursales (
      id bigserial primary key,
      dealer text not null,
      region text not null,
      comuna text,
      sucursal text not null,
      direccion text,
      estatus text,
      updated_at timestamptz not null default now(),
      unique (dealer, region, sucursal)
    )
  `;

  await sql`truncate table dealer_sucursales restart identity`;

  for (const [dealer, region, comuna, sucursal, direccion, estatus] of SUCURSALES) {
    await sql`
      insert into dealer_sucursales (dealer, region, comuna, sucursal, direccion, estatus)
      values (${dealer}, ${region}, ${comuna}, ${sucursal}, ${direccion}, ${estatus})
    `;
  }

  const rows = await sql`
    select
      count(*)::int as sucursales,
      count(distinct dealer)::int as dealers,
      count(distinct region)::int as regiones
    from dealer_sucursales
  `;

  return rows[0];
}
