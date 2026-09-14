// PASO 1 del flujo: descubrimiento de empresas por búsqueda real en internet
// (no por conocimiento del modelo). Usa Firecrawl /search sobre consultas por
// subsector + ciudad y sobre noticias, extrae los dominios oficiales y arma
// execution/semillas_prospectos.json con la fuente de cada hallazgo.
// Ver directives/prospectar_clientes.md.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA_CRUDA = path.join(RAIZ, ".tmp", "descubrimiento.json");
const SALIDA_SEMILLAS = path.join(RAIZ, "execution", "semillas_prospectos.json");

// El endpoint /search de Firecrawl tiene un límite de tasa más estricto que
// /scrape: con 1.5s entre consultas devolvió 429 a partir de la consulta 11.
const PAUSA_MS = 8000;
const REINTENTOS_429 = 3;
const ESPERA_429_MS = 45000;
const RESULTADOS_POR_CONSULTA = 10;

// Dominios que nunca son la empresa prospecto: directorios, agregadores,
// prensa, redes sociales y portales institucionales de ciudad.
const DOMINIOS_EXCLUIDOS = [
  "wikipedia.org", "tripadvisor", "booking.com", "expedia", "despegar", "trivago", "hoteles.com",
  "instagram.com", "facebook.com", "x.com", "twitter.com", "youtube.com", "linkedin.com", "tiktok.com",
  "doctoralia", "encolombia.com", "colombiadigital.co", "infoisinfo", "paginasamarillas", "medicosdoc",
  "wanderlog", "eltiempo.com", "elheraldo.co", "eluniversal.com.co", "semana.com", "larepublica.co",
  "portafolio.co", "infobae", "rcnradio", "caracol", "wradio", "bluradio", "noticiascaracol",
  "barranquilla.gov.co", "cartagena.gov.co", "santamarta.gov.co", "atlantico.gov.co", "minsalud.gov.co",
  "google.com", "maps.google", "yelp", "foursquare", "waze", "quierohotel", "cartagenaexplorer",
  "cartagenacohotels", "cartagena-hotels", "mylatinlife", "educaedu", "unad.edu.co", "clinicasyhospitales",
  "centrosmedicosyhospitales", "mired", "amazon.", "mercadolibre", "computrabajo", "elempleo",
  "queseguro.co", "consultorsalud", "saludcapital", "sura.co", "epssura", "compensar.com",
  "colmedica", "medipiel", "issuu.com", "slideshare", "scribd", "researchgate", "dialnet",
  // Sector petróleo y gas: entidades de gobierno, gremios y prensa especializada.
  // No son prospectos (no operan planta propia) pero dominan los resultados.
  "anh.gov.co", "minenergia.gov.co", "upme.gov.co", "creg.gov.co", "ani.gov.co", "sic.gov.co",
  "dane.gov.co", "ecopetrol.com.co/wps", "acp.com.co", "naturgas.com.co", "andi.com.co",
  "valoraanalitik", "bnamericas", "argusmedia", "rigzone", "offshore-technology", "oilandgas",
  "energiaestrategica", "revistaenergia", "petroleoygas", "worldenergytrade", "elcolombiano.com",
  "dinero.com", "eleconomista", "reuters.com", "bloomberg", "spglobal", "statista",
];

// Cada consulta declara el subsector, la ciudad y la región que representa,
// para poder clasificar el prospecto sin inventar el dato.
// Corrida 2026-09-01 (segunda del día): sector Petróleo y Gas, alcance nacional
// con foco en las zonas petroleras/gasíferas reales de Colombia, priorizando
// operación y mantenimiento (instalaciones fijas) sobre exploración pura.
const CONSULTAS = [
  // Barrancabermeja y Magdalena Medio — refinación y servicios petroleros
  { q: "refinería Barrancabermeja empresas del sector petrolero sitio oficial", subsector: "Petróleo y gas - refinación", ciudad: "Barrancabermeja", region: "Magdalena Medio" },
  { q: "empresas de servicios petroleros y mantenimiento industrial Barrancabermeja sitio oficial", subsector: "Petróleo y gas - contratista O&M", ciudad: "Barrancabermeja", region: "Magdalena Medio" },
  { q: "estación de bombeo y facilidades de producción Magdalena Medio petróleo empresa sitio oficial", subsector: "Petróleo y gas - facilidades/bombeo", ciudad: "Barrancabermeja", region: "Magdalena Medio" },

  // Cartagena — refinación y petroquímica (Mamonal)
  { q: "refinería de Cartagena y planta petroquímica Mamonal sitio oficial", subsector: "Petróleo y gas - refinación/petroquímica", ciudad: "Cartagena", region: "Caribe" },
  { q: "terminal de almacenamiento de combustibles líquidos Cartagena empresa sitio oficial", subsector: "Petróleo y gas - almacenamiento/terminal", ciudad: "Cartagena", region: "Caribe" },
  { q: "empresas petroquímicas zona industrial Mamonal Cartagena sitio oficial", subsector: "Petróleo y gas - petroquímica", ciudad: "Cartagena", region: "Caribe" },

  // Casanare — Cusiana/Cupiagua, plantas de gas y facilidades
  { q: "empresas operadoras de petróleo Casanare Yopal campos de producción sitio oficial", subsector: "Petróleo y gas - operadora/producción", ciudad: "Yopal", region: "Llanos - Casanare" },
  { q: "planta de tratamiento y procesamiento de gas Cusiana Cupiagua Casanare sitio oficial", subsector: "Petróleo y gas - procesamiento de gas", ciudad: "Tauramena", region: "Llanos - Casanare" },

  // Meta — Llanos, campos y centros de facilidades
  { q: "operadoras petroleras Meta Villavicencio Puerto Gaitán campos sitio oficial", subsector: "Petróleo y gas - operadora/producción", ciudad: "Villavicencio", region: "Llanos - Meta" },
  { q: "facilidades de producción y estación de tratamiento de crudo Meta Acacías sitio oficial", subsector: "Petróleo y gas - facilidades/tratamiento de crudo", ciudad: "Acacías", region: "Llanos - Meta" },

  // La Guajira — gas natural
  { q: "empresas de producción de gas natural La Guajira campo Ballena Chuchupa sitio oficial", subsector: "Petróleo y gas - producción de gas", ciudad: "Riohacha", region: "Caribe - Guajira" },

  // Huila y Putumayo — campos maduros
  { q: "operadoras petroleras Huila Neiva campos de producción sitio oficial", subsector: "Petróleo y gas - operadora/producción", ciudad: "Neiva", region: "Sur - Huila" },
  { q: "empresas petroleras Putumayo Orito producción de crudo sitio oficial", subsector: "Petróleo y gas - operadora/producción", ciudad: "Orito", region: "Sur - Putumayo" },

  // Midstream nacional — oleoductos, gasoductos, almacenamiento
  { q: "empresas de transporte de hidrocarburos y oleoductos Colombia sitio oficial", subsector: "Petróleo y gas - midstream/oleoducto", ciudad: "Nacional", region: "Nacional" },
  { q: "empresas de transporte de gas natural gasoducto Colombia sitio oficial", subsector: "Petróleo y gas - midstream/gasoducto", ciudad: "Nacional", region: "Nacional" },
  { q: "terminales y estaciones de almacenamiento de crudo y combustibles Colombia empresa sitio oficial", subsector: "Petróleo y gas - almacenamiento/terminal", ciudad: "Nacional", region: "Nacional" },

  // Downstream — GLP, GNL, biocombustibles
  { q: "empresas distribuidoras de GLP con planta de envasado Colombia sitio oficial", subsector: "Petróleo y gas - GLP/envasado", ciudad: "Nacional", region: "Nacional" },
  { q: "terminal de regasificación GNL gas natural licuado Colombia sitio oficial", subsector: "Petróleo y gas - GNL/regasificación", ciudad: "Nacional", region: "Nacional" },
  { q: "plantas de biocombustibles y refinación de combustibles Colombia sitio oficial", subsector: "Petróleo y gas - refinación/biocombustibles", ciudad: "Nacional", region: "Nacional" },

  // Contratistas de operación y mantenimiento del sector
  { q: "empresas de mantenimiento industrial para el sector petrolero Colombia sitio oficial", subsector: "Petróleo y gas - contratista O&M", ciudad: "Nacional", region: "Nacional" },
  { q: "contratistas de paradas de planta y mantenimiento de refinerías Colombia sitio oficial", subsector: "Petróleo y gas - contratista paradas de planta", ciudad: "Nacional", region: "Nacional" },

  // Sedes administrativas de operadoras
  { q: "operadoras de petróleo y gas con sede en Bogotá Colombia sitio oficial", subsector: "Petróleo y gas - operadora (sede administrativa)", ciudad: "Bogotá", region: "Andina - Bogotá" },

  // Noticias: señales de inversión, ampliación, obra nueva y paradas de planta
  { q: "inversión ampliación planta de gas o refinería Colombia 2026 petrolera", subsector: "Petróleo y gas - inversión/ampliación", ciudad: "Nacional", region: "Nacional", fuente: "noticias" },
  { q: "parada de planta y mantenimiento mayor refinería Colombia 2026", subsector: "Petróleo y gas - parada de planta", ciudad: "Nacional", region: "Nacional", fuente: "noticias" },
  { q: "nuevo proyecto de producción de gas Colombia 2026 operadora inversión", subsector: "Petróleo y gas - nuevo proyecto de gas", ciudad: "Nacional", region: "Nacional", fuente: "noticias" },
];

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function dominioDe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function esExcluido(dominio) {
  return DOMINIOS_EXCLUIDOS.some((d) => dominio.includes(d));
}

async function buscar(consulta) {
  for (let intento = 0; intento <= REINTENTOS_429; intento++) {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: consulta.q, limit: RESULTADOS_POR_CONSULTA }),
    });
    if (res.status === 429) {
      if (intento === REINTENTOS_429) throw new Error("HTTP 429 tras reintentos");
      console.log(`     429 — esperando ${ESPERA_429_MS / 1000}s antes de reintentar…`);
      await dormir(ESPERA_429_MS);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data?.web ?? [];
  }
  return [];
}

// Reanudación: las consultas ya resueltas en una corrida anterior no se
// repiten (cada búsqueda cuesta un crédito de Firecrawl).
const previo = fs.existsSync(SALIDA_CRUDA) ? JSON.parse(fs.readFileSync(SALIDA_CRUDA, "utf8")) : { crudo: [] };
const consultasYaHechas = new Set((previo.crudo ?? []).map((c) => c.consulta));
const previoSemillas = fs.existsSync(SALIDA_SEMILLAS) ? JSON.parse(fs.readFileSync(SALIDA_SEMILLAS, "utf8")) : [];

const encontrados = new Map(
  previoSemillas
    .filter((s) => s.ciudad_esperada)
    .map((s) => [
      s.dominio,
      { dominio: s.dominio, referencia: s.referencia, subsector: s.sector_esperado, ciudad: s.ciudad_esperada, region: s.region, fuente: s.fuente_descubrimiento },
    ])
);
const crudo = [...(previo.crudo ?? [])];
const incidencias = [];

function guardar() {
  fs.writeFileSync(
    SALIDA_CRUDA,
    JSON.stringify({ generado: new Date().toISOString(), consultas: CONSULTAS.length, crudo, incidencias }, null, 2),
    "utf8"
  );
  const semillas = [...encontrados.values()].map((e) => ({
    dominio: e.dominio,
    referencia: e.referencia,
    sector_esperado: e.subsector,
    region: e.region ?? "Nacional",
    ciudad_esperada: e.ciudad,
    fuente_descubrimiento: e.fuente,
  }));
  fs.writeFileSync(SALIDA_SEMILLAS, JSON.stringify(semillas, null, 2), "utf8");
}

try {
  if (!process.env.FIRECRAWL_API_KEY) throw new Error("Falta FIRECRAWL_API_KEY en .env");
  console.log(`Descubriendo empresas con ${CONSULTAS.length} consultas de búsqueda real...\n`);

  const pendientes = CONSULTAS.filter((c) => !consultasYaHechas.has(c.q));
  console.log(`Consultas ya resueltas: ${CONSULTAS.length - pendientes.length} | pendientes: ${pendientes.length}\n`);

  for (const consulta of pendientes) {
    let resultados = [];
    try {
      resultados = await buscar(consulta);
    } catch (e) {
      incidencias.push({ consulta: consulta.q, error: e.message });
      console.log(`ERR  ${consulta.q.slice(0, 55).padEnd(56)} ${e.message}`);
      await dormir(PAUSA_MS);
      continue;
    }

    let nuevos = 0;
    for (const r of resultados) {
      crudo.push({ consulta: consulta.q, titulo: r.title, url: r.url, descripcion: r.description });
      const dominio = dominioDe(r.url);
      if (!dominio || esExcluido(dominio)) continue;
      if (encontrados.has(dominio)) continue;

      encontrados.set(dominio, {
        dominio,
        // El título del resultado es el nombre real publicado por la empresa;
        // se limpia el sufijo de marketing típico ("| Inicio", "- Bienvenidos").
        referencia: (r.title ?? dominio).split(/[|\-–—]/)[0].trim().slice(0, 70),
        subsector: consulta.subsector,
        ciudad: consulta.ciudad,
        region: consulta.region,
        fuente: `${consulta.fuente === "noticias" ? "Noticia" : "Búsqueda"}: "${consulta.q}" → ${r.url}`,
      });
      nuevos++;
    }
    console.log(`OK   ${consulta.q.slice(0, 55).padEnd(56)} ${resultados.length} resultados | ${nuevos} nuevos`);
    guardar();
    await dormir(PAUSA_MS);
  }
} catch (e) {
  incidencias.push({ etapa: "general", error: e.message });
  console.error("Error:", e.message);
} finally {
  guardar();
  console.log(`\nGuardado: ${SALIDA_SEMILLAS}`);
  console.log(`Empresas únicas descubiertas: ${encontrados.size} | incidencias: ${incidencias.length}`);
}
