// Funciones puras de extracción, compartidas por los motores de scraping
// (Playwright y Firecrawl). Sin I/O ni estado global: reciben HTML/texto y
// devuelven datos. Ver directives/prospectar_clientes.md.

// Señales en href/anchor que indican páginas con contenido operativo o de
// contacto aprovechable. "contacto" y "ubicacion" son las más valiosas para
// emails/teléfonos/dirección; el resto para evidencia de equipos.
export const PISTAS_ENLACE = [
  "contacto", "contact", "ubicacion", "ubicación", "donde-estamos", "sedes", "cobertura",
  "sosteni", "operacion", "planta", "produccion", "produção", "nosotros", "quienes",
  "negocio", "empresa", "compania", "about", "operations", "manufactur", "proceso",
  "energia", "energy", "infraestructura", "tecnolog", "informe", "reporte", "sustainab",
  "capacidad", "servicio", "instalacion", "mantenimiento", "trabaja", "empleo", "carrera",
  "directivo", "liderazgo", "junta", "organigrama", "equipo-directivo", "leadership", "team",
  "gobierno-corporativo", "administracion", "institucional", "hospital", "clinica", "campus",
];

export const RUTAS_CONTACTO_DIRECTAS = ["/contacto", "/contactenos", "/contact", "/contact-us", "/es/contacto"];

// Cada término mapea a la línea de negocio y equipo de Enermast que habilita.
// Incluye equivalentes en inglés (algunos sitios corporativos son bilingües).
export const TERMINOS = [
  { re: /calderas?\b|generador(es)? de vapor|\bboilers?\b|steam generators?/gi, equipo: "Calderas / generadores de vapor", linea: "Energía y eficiencia" },
  { re: /\bvapor\b|\bsteam\b/gi, equipo: "Sistemas de vapor", linea: "Energía y eficiencia" },
  { re: /torres? de enfriamiento|torres? de refrigeraci|cooling towers?/gi, equipo: "Torres de enfriamiento", linea: "Energía y eficiencia" },
  { re: /\bchillers?\b/gi, equipo: "Chillers", linea: "Energía y eficiencia" },
  { re: /intercambiador(es)? de calor|intercambiador(es)? de placas|heat exchangers?/gi, equipo: "Intercambiadores de calor", linea: "Energía y eficiencia" },
  { re: /refrigeraci[oó]n industrial|cadena de fr[ií]o|cuartos? fr[ií]os?|industrial refrigeration|cold chain/gi, equipo: "Refrigeración industrial", linea: "Energía y eficiencia" },
  { re: /aire acondicionado|climatizaci[oó]n|\bhvac\b/gi, equipo: "Climatización / HVAC", linea: "Energía y eficiencia" },
  { re: /v[aá]lvulas?\b|\bvalves?\b/gi, equipo: "Válvulas industriales", linea: "Componentes" },
  { re: /trampas? de vapor|steam traps?/gi, equipo: "Trampas de vapor", linea: "Componentes" },
  { re: /instrumentaci[oó]n|man[oó]metros?|term[oó]metros?|flu[jx][oó]metros?|instrumentation|pressure gauges?|flow meters?/gi, equipo: "Instrumentación y medición", linea: "Componentes" },
  { re: /polipastos?|puentes? gr[uú]a|eslingas?|izaje|\bhoists?\b|overhead cranes?|\bslings?\b|rigging/gi, equipo: "Equipos de izaje", linea: "Herramientas" },
  { re: /hidr[aá]ulic[oa]s?|llaves? de torque|\btorque\b|hydraulic tools?|torque wrenches?/gi, equipo: "Equipos hidráulicos / torque", linea: "Herramientas" },
  { re: /parada de planta|paradas programadas|\boverhaul\b|plant shutdown|plant turnaround/gi, equipo: "Paradas de planta", linea: "Servicios transversales" },
  { re: /mantenimiento (industrial|mec[aá]nico|preventivo|correctivo|predictivo|hospitalario|de equipos)|(preventive|predictive|corrective) maintenance/gi, equipo: "Programa de mantenimiento", linea: "Servicios transversales" },
  { re: /confiabilidad|\breliability\b/gi, equipo: "Programa de confiabilidad", linea: "Servicios transversales" },
  { re: /eficiencia energ[eé]tica|energy efficiency/gi, equipo: "Eficiencia energética", linea: "Energía y eficiencia" },
  { re: /termograf[ií]a|ultrasonido|ensayos no destructivos|thermography|ultrasonic testing|non-destructive testing/gi, equipo: "Inspección y diagnóstico", linea: "Servicios transversales" },
  { re: /compresor(es)?\b|compressors?/gi, equipo: "Compresores", linea: "Energía y eficiencia" },
  { re: /planta de (producci[oó]n|tratamiento|proceso)|plantas? industrial(es)?|(production|processing|industrial) plants?|manufacturing facilit(y|ies)/gi, equipo: "Planta industrial", linea: "General" },
  { re: /planta el[eé]ctrica|grupo electr[oó]geno|planta de emergencia|generador de emergencia/gi, equipo: "Planta eléctrica de emergencia", linea: "Energía y eficiencia" },
  { re: /gases medicinales|ox[ií]geno medicinal|central de gases/gi, equipo: "Gases medicinales", linea: "Componentes" },
  { re: /lavander[ií]a (industrial|hospitalaria)|autoclave|esterilizaci[oó]n/gi, equipo: "Autoclaves / lavandería industrial", linea: "Energía y eficiencia" },
  // Vocabulario propio de petróleo y gas (corrida 2026-09-01)
  { re: /separador(es)? (de |bif|trif)|tratador(es)? t[eé]rmic|treaters?\b/gi, equipo: "Separadores / tratadores térmicos", linea: "Energía y eficiencia" },
  { re: /calentador(es)? de (crudo|proceso|agua)|hornos? de proceso|process heaters?|fired heaters?/gi, equipo: "Calentadores / hornos de proceso", linea: "Energía y eficiencia" },
  { re: /tanques? de almacenamiento|tanques? atmosf[eé]ric|storage tanks?/gi, equipo: "Tanques de almacenamiento", linea: "Componentes" },
  { re: /estaci[oó]n(es)? de bombeo|bombas? centr[ií]fugas?|pumping stations?|centrifugal pumps?/gi, equipo: "Bombas / estaciones de bombeo", linea: "Componentes" },
  { re: /recipientes? a presi[oó]n|pruebas? hidrost[aá]tic|pressure vessels?|hydrostatic test/gi, equipo: "Recipientes a presión / pruebas hidrostáticas", linea: "Servicios transversales" },
  { re: /refiner[ií]a|refinery|planta de gas|gas plant/gi, equipo: "Refinería / planta de proceso", linea: "General" },
];

// Ciudades de referencia para detectar ubicación en el texto.
export const CIUDADES_CARIBE = [
  "Barranquilla", "Soledad", "Malambo", "Puerto Colombia", "Galapa", "Sabanalarga",
  "Cartagena", "Santa Marta", "Ciénaga", "Valledupar", "Sincelejo", "Montería",
  "Riohacha", "Maicao", "Turbaco", "Magangué", "Lorica", "Corozal", "El Carmen de Bolívar",
];
export const CIUDADES_OTRAS = [
  "Bogotá", "Medellín", "Cali", "Yumbo", "Bucaramanga", "Barrancabermeja", "Cúcuta",
  "Ibagué", "Manizales", "Pereira", "Armenia", "Neiva", "Villavicencio", "Tunja",
  "Duitama", "Sogamoso", "Cartago", "Buenaventura", "Palmira", "Popayán", "Pasto", "Chía",
  // Municipios petroleros y gasíferos (corrida Petróleo y Gas 2026-09-01)
  "Yopal", "Tauramena", "Aguazul", "Monterrey", "Paz de Ariporo", "Acacías", "Castilla la Nueva",
  "Puerto Gaitán", "Granada", "Puerto López", "Orito", "Puerto Asís", "Mocoa", "Arauca",
  "Puerto Boyacá", "Yondó", "Puerto Wilches", "Sabana de Torres", "Aguachica", "Cantagallo",
  "San Vicente de Chucurí", "Coveñas", "Tumaco", "Girón", "Floridablanca",
];
const TODAS_CIUDADES = [...CIUDADES_CARIBE, ...CIUDADES_OTRAS];
const RE_CIUDADES = new RegExp(`\\b(${TODAS_CIUDADES.join("|")})\\b`, "gi");
const RE_INDICADOR_DIRECCION = /direcci[oó]n|ubicad|sede|km\s?\d|carrera\s?\d|calle\s?\d|\bcra\.?\s?\d|\bcll\.?\s?\d|diagonal|transversal|zona franca|parque industrial|autopista|barrio/i;

const RE_CARGO_DIRECTIVO =
  /\b(gerente|jefe|director|directora|coordinador|coordinadora|l[ií]der|supervisor|vicepresidente|jefatura|rector|rectora)\s+(de\s+|del\s+)?(mantenimiento|planta|operaciones|confiabilidad|ingenier[ií]a|compras|abastecimiento|procurement|proyectos|f[aá]brica|producci[oó]n|infraestructura|servicios generales|log[ií]stica|administrativ[oa])\b/gi;

const NOMBRE = "[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}";
const RE_NOMBRE_LUEGO_CARGO = new RegExp(`(${NOMBRE})\\s*[,\\-–—:]\\s*(${RE_CARGO_DIRECTIVO.source})`, "gi");
const RE_CARGO_LUEGO_NOMBRE = new RegExp(`(${RE_CARGO_DIRECTIVO.source})\\s*[,\\-–—:]\\s*(${NOMBRE})`, "gi");

// Palabras de cargo/organización que NO son nombres de persona. Evita
// presentar una universidad, empresa o cargo como si fuera alguien real.
const PALABRAS_NO_NOMBRE = new Set([
  "gerente", "gerencia", "director", "directora", "directivo", "directiva", "vicepresidente",
  "vicepresidenta", "presidente", "presidenta", "presidencia", "coordinador", "coordinadora",
  "jefe", "jefatura", "supervisor", "supervisora", "lider", "líder", "ejecutivo", "ejecutiva",
  "corporativas", "corporativa", "corporativo", "finanzas", "desarrollo", "negocios", "industriales",
  "industrial", "aceros", "ingeniero", "ingeniera", "ingenieria", "ingeniería", "meca", "mecanico",
  "mecánico", "analista", "experiencia", "profesional", "nuevos", "nueva", "proyectos", "proyecto",
  "produccion", "producción", "colombia", "operaciones", "operación", "mantenimiento", "planta",
  "compras", "abastecimiento", "procurement", "junta", "equipo", "empresa", "grupo", "division",
  "división", "area", "área", "departamento", "unidad", "universidad", "hospital", "clinica",
  "clínica", "fundacion", "fundación", "school", "business", "services", "energy", "nacional",
  "instituto", "centro", "sede", "campus", "facultad", "rector", "rectora", "rectoria", "rectoría",
]);

function nombreValido(candidato) {
  const palabras = candidato.toLowerCase().split(/\s+/);
  if (palabras.length < 2 || palabras.length > 4) return false;
  return palabras.every((p) => !PALABRAS_NO_NOMBRE.has(p));
}

const STOPWORDS_EN = /\b(the|and|our|with|for|company|solutions|products|services|home|about)\b/gi;
const STOPWORDS_ES = /\b(el|la|los|las|nuestra|nuestro|empresa|soluciones|productos|servicios|con|inicio|nosotros|contacto)\b/gi;

export function limpiarHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function analizarEquipos(texto, url) {
  const hallazgos = [];
  for (const termino of TERMINOS) {
    const matches = texto.match(termino.re);
    if (!matches?.length) continue;
    const idx = texto.search(termino.re);
    const fragmento = texto.slice(Math.max(0, idx - 110), idx + 190).trim();
    hallazgos.push({ equipo: termino.equipo, linea: termino.linea, menciones: matches.length, fragmento, url });
  }
  return hallazgos;
}

export function extraerContacto(html, texto) {
  const emails = new Set();
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) emails.add(decodeURIComponent(m[1]).toLowerCase());
  for (const m of texto.matchAll(/[\w.+-]+@[\w-]+\.[a-z.]{2,}/gi)) emails.add(m[0].toLowerCase());
  const emailsValidos = [...emails].filter(
    (e) =>
      !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e) &&
      !/sentry|wixpress|godaddy|example\.com|domain\.com|sentry\.io|\.png|@2x/i.test(e)
  );

  // Teléfonos: href="tel:" es la señal más confiable; se complementa con
  // patrones colombianos en el texto visible (típicos del pie de página).
  const telefonos = new Set();
  for (const m of html.matchAll(/href=["']tel:([+\d\s()./-]{7,25})["']/gi)) {
    telefonos.add(m[1].replace(/\s+/g, " ").trim());
  }
  const patronesTel = [
    /\+57\s?\(?\d{1,3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, // +57 605 3369999
    /\b(?:60)?[1-8]\s?\d{3}\s?\d{4}\b/g, // fijos con indicativo nuevo
    /\b3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g, // celulares 3XX
  ];
  for (const patron of patronesTel) {
    for (const m of texto.matchAll(patron)) {
      const limpio = m[0].trim();
      if (limpio.replace(/\D/g, "").length >= 7) telefonos.add(limpio);
    }
  }

  const linkedinMatch = html.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|school)\/[a-zA-Z0-9\-_%.]+/i);

  // Ciudad: alta confianza solo si aparece cerca de un indicador de dirección.
  let ciudad = null;
  let ciudadConfianza = "baja";
  for (const m of texto.matchAll(RE_CIUDADES)) {
    const contexto = texto.slice(Math.max(0, m.index - 90), m.index + 90);
    if (RE_INDICADOR_DIRECCION.test(contexto)) {
      ciudad = m[1];
      ciudadConfianza = "alta";
      break;
    }
    if (!ciudad) ciudad = m[1];
  }

  return {
    emails: emailsValidos.slice(0, 8),
    telefonos: [...telefonos].slice(0, 8),
    linkedin: linkedinMatch?.[0] ?? null,
    ciudad_detectada: ciudad,
    ciudad_confianza: ciudad ? ciudadConfianza : null,
  };
}

// Requiere adyacencia DIRECTA entre nombre y cargo ("Nombre, Cargo" o
// "Cargo: Nombre"): una ventana amplia sobre texto narrativo captura
// universidades y empresas anteriores como si fueran la persona.
export function extraerDirectivos(texto, url) {
  const candidatos = [];
  for (const m of texto.matchAll(RE_NOMBRE_LUEGO_CARGO)) {
    if (nombreValido(m[1])) candidatos.push({ nombre: m[1].trim(), cargo: m[2].trim(), url });
  }
  for (const m of texto.matchAll(RE_CARGO_LUEGO_NOMBRE)) {
    const nombre = m[m.length - 1];
    if (nombreValido(nombre)) candidatos.push({ nombre: nombre.trim(), cargo: m[1].trim(), url });
  }
  return candidatos;
}

export function detectarIdioma(texto) {
  if (!texto || texto.length < 20) return null;
  const en = (texto.match(STOPWORDS_EN) ?? []).length;
  const es = (texto.match(STOPWORDS_ES) ?? []).length;
  if (en === 0 && es === 0) return null;
  return en > es ? "en" : "es";
}

export function extraerMeta(html) {
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim().slice(0, 200) ?? null;
  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    null;
  return { titulo, meta_descripcion: desc?.trim().slice(0, 500) ?? null };
}

function evaluarCandidato(enlaces, hrefCrudo, textoAncla, urlBase, maxPaginas) {
  let destino;
  try {
    destino = new URL(hrefCrudo, urlBase);
  } catch {
    return;
  }
  if (!/^https?:$/.test(destino.protocol)) return;
  if (destino.hostname !== new URL(urlBase).hostname) return;
  if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|mp4|docx?|xlsx?)$/i.test(destino.pathname)) return;

  const contexto = `${destino.pathname} ${textoAncla}`.toLowerCase();
  const puntaje = PISTAS_ENLACE.filter((p) => contexto.includes(p)).length;
  if (puntaje === 0) return;

  const clave = destino.origin + destino.pathname;
  if (!enlaces.has(clave) || enlaces.get(clave) < puntaje) enlaces.set(clave, puntaje);
}

export function extraerEnlaces(html, urlBase, enlacesResueltos = [], maxPaginas = 10) {
  const enlaces = new Map();
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    evaluarCandidato(enlaces, m[1], limpiarHtml(m[2]), urlBase, maxPaginas);
  }
  for (const href of enlacesResueltos) {
    evaluarCandidato(enlaces, href, "", urlBase, maxPaginas);
  }
  return [...enlaces.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPaginas)
    .map(([url]) => url);
}

export function consolidarEvidencia(hallazgos) {
  const porEquipo = new Map();
  for (const h of hallazgos) {
    const previo = porEquipo.get(h.equipo);
    if (!previo) porEquipo.set(h.equipo, { ...h });
    else {
      previo.menciones += h.menciones;
      if (h.fragmento.length > previo.fragmento.length) {
        previo.fragmento = h.fragmento;
        previo.url = h.url;
      }
    }
  }
  return [...porEquipo.values()].sort((a, b) => b.menciones - a.menciones);
}
