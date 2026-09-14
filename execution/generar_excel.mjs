// PASO 3 del flujo: cruza la evidencia extraída, calcula el score y genera el
// Excel final. Fuente única: .tmp/evidencia_web.json (Playwright + Firecrawl).
// Ver directives/prospectar_clientes.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { CIUDADES_CARIBE, CIUDADES_OTRAS } from "./lib/extraccion.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(RAIZ, ".tmp", "evidencia_web.json");
const LINKEDIN = path.join(RAIZ, ".tmp", "contactos_linkedin.json");
const TRADUCCIONES = path.join(RAIZ, "execution", "traducciones.json");
const DIR_SALIDA = path.join(RAIZ, "entregables");

const MAX_RESULTADOS = 50;
const AREA_METRO_BARRANQUILLA = ["Barranquilla", "Soledad", "Malambo", "Puerto Colombia", "Galapa"];

const CARGOS_OBJETIVO = [
  "Gerente de Mantenimiento",
  "Ingeniero de Confiabilidad",
  "Superintendente / Jefe de Planta",
  "Gerente de Operaciones",
  "Jefe de Compras / Abastecimiento",
];

// Equipamiento típico por subsector institucional. Es INFERENCIA basada en el
// tipo de instalación (un hospital de alta complejidad opera chillers y planta
// de emergencia por norma), nunca se presenta como dato confirmado: la columna
// de equipos distingue siempre CONFIRMADO de INFERENCIA.
const PERFIL_SUBSECTOR = {
  // Subsectores de Petróleo y Gas (corrida 2026-09-01, segunda del día). El orden
  // importa: perfilDe() devuelve la PRIMERA clave contenida en el subsector, por
  // lo que las claves más específicas van antes que las genéricas.
  "refinación": {
    base: 6,
    equipos: "Intercambiadores de calor de casco y tubos, calderas y generadores de vapor, torres de enfriamiento, hornos, válvulas de control y seguridad, trampas de vapor, instrumentación de proceso",
    razon: "Refinería: proceso continuo con transferencia térmica, vapor y válvulas críticas — máxima afinidad con el catálogo de Enermast",
  },
  "petroquímica": {
    base: 6,
    equipos: "Intercambiadores de calor, calderas, torres de enfriamiento, reactores con control térmico, válvulas de seguridad y control, instrumentación de presión y temperatura",
    razon: "Planta petroquímica: procesos térmicos continuos con sistemas de vapor y control de fluidos de alta exigencia",
  },
  "procesamiento de gas": {
    base: 6,
    equipos: "Intercambiadores de calor, torres de deshidratación y endulzamiento, compresores, calderas/calentadores de proceso, válvulas de control y seguridad, instrumentación de presión y flujo",
    razon: "Planta de tratamiento de gas: transferencia térmica y control de fluidos permanentes, con paradas programadas de mantenimiento",
  },
  "producción de gas": {
    base: 5,
    equipos: "Separadores, calentadores de proceso, compresores, intercambiadores, válvulas de seguridad y control, instrumentación de presión y flujo",
    razon: "Producción de gas: facilidades de superficie con equipos térmicos y válvulas críticas en operación continua",
  },
  "facilidades": {
    base: 5,
    equipos: "Separadores y tratadores térmicos, calentadores de crudo, intercambiadores, bombas y estaciones de bombeo, válvulas de control y seguridad, herramientas hidráulicas de torque para mantenimiento",
    razon: "Facilidades de producción (CPF/estación): tratamiento térmico de crudo y bombeo continuo, con mantenimiento mecánico intensivo",
  },
  "almacenamiento": {
    base: 5,
    equipos: "Tanques de almacenamiento, bombas de transferencia, válvulas de control y seguridad, sistemas de detección de fugas, instrumentación de presión y nivel, equipos de izaje para mantenimiento",
    razon: "Terminal de almacenamiento: tanques, bombas y válvulas de transferencia con inspección y certificación periódica obligatoria",
  },
  "operadora": {
    base: 5,
    equipos: "Facilidades de producción con separadores y calentadores, bombas, compresores, válvulas de control y seguridad, herramientas hidráulicas e izaje para mantenimiento de campo",
    razon: "Operadora de campos: múltiples instalaciones con equipos de proceso y programas formales de mantenimiento y confiabilidad",
  },
  "oleoducto": {
    base: 4,
    equipos: "Estaciones de bombeo, bombas centrífugas, válvulas de control y seguridad, instrumentación de presión y flujo, herramientas hidráulicas de torque para bridas",
    razon: "Midstream de crudo: estaciones de bombeo y válvulas de línea con mantenimiento y certificación periódica",
  },
  "gasoducto": {
    base: 4,
    equipos: "Estaciones de compresión, compresores, válvulas de control y seguridad, instrumentación de presión y flujo, intercambiadores de enfriamiento de gas",
    razon: "Midstream de gas: estaciones de compresión con equipos rotativos y válvulas críticas en operación 24/7",
  },
  "glp": {
    base: 4,
    equipos: "Tanques presurizados, bombas y compresores de trasiego, válvulas de seguridad y alivio, instrumentación de presión, básculas y equipos de envasado",
    razon: "Planta de GLP: recipientes a presión y válvulas de alivio con inspección y certificación obligatoria",
  },
  "paradas de planta": {
    base: 4,
    equipos: "Herramientas hidráulicas de torque, cilindros y bombas hidráulicas, equipos de izaje, equipos de inspección y ensayos no destructivos",
    razon: "Contratista de paradas de planta: consume herramienta hidráulica, izaje certificado y servicios de inspección en cada evento",
  },
  "contratista": {
    base: 4,
    equipos: "Herramientas hidráulicas de torque, equipos de izaje y eslingas certificadas, repuestos multimarca, instrumentación de medición",
    razon: "Contratista de mantenimiento industrial: comprador recurrente de herramienta, repuestos y servicios de certificación (ICP §8)",
  },
  // Cierre del bloque: cubre los subsectores descubiertos por noticias
  // (inversión, ampliación, parada de planta, nuevo proyecto) donde se sabe que
  // la empresa es del sector pero no qué tipo de instalación opera.
  "petróleo y gas": {
    base: 4,
    equipos: "Equipos térmicos de proceso, sistemas de vapor, bombas y compresores, válvulas de control y seguridad, instrumentación, herramientas hidráulicas e izaje para mantenimiento",
    razon: "Empresa del sector petróleo y gas detectada por una señal de inversión, ampliación o parada de planta — validar qué instalación opera",
  },
  "clínica/hospital": {
    base: 5,
    equipos: "Chillers y HVAC centralizado, calderas para lavandería y esterilización, planta eléctrica de emergencia, gases medicinales, autoclaves",
    razon: "Instalación de salud: opera climatización crítica 24/7, esterilización y respaldo eléctrico por normativa",
  },
  hotel: {
    base: 4,
    equipos: "Chillers, calderas de agua caliente sanitaria, lavandería industrial, torres de enfriamiento, bombas",
    razon: "Hotelería: climatización y agua caliente permanentes, alto costo de una falla en temporada",
  },
  "centro comercial": {
    base: 4,
    equipos: "Chillers de gran capacidad, torres de enfriamiento, manejadoras de aire, plantas de emergencia",
    razon: "Gran superficie: climatización centralizada de alto consumo y operación diaria continua",
  },
  universidad: {
    base: 3,
    equipos: "HVAC de campus, calderas de laboratorio, plantas de emergencia, sistemas hidráulicos",
    razon: "Campus extenso con laboratorios y auditorios climatizados",
  },
  // Subsectores de Energía y Petróleo/Gas (corrida 2026-09-01). El equipamiento
  // inferido sale directamente de contexto_enermast.md §3 y §9 (nunca del
  // conocimiento libre del modelo), diferenciado siempre de lo CONFIRMADO.
  "generación térmica": {
    base: 6,
    equipos: "Turbinas de vapor y gas, calderas/HRSG, intercambiadores de calor, condensadores, sistemas de vapor, válvulas de control y seguridad, instrumentación de presión y temperatura",
    razon: "Planta de generación térmica: opera turbinas, calderas y sistemas de vapor de forma continua — equipamiento núcleo del catálogo de Enermast",
  },
  "gnl": {
    base: 5,
    equipos: "Intercambiadores criogénicos, válvulas criogénicas y de seguridad, tanques de almacenamiento, instrumentación de presión y temperatura",
    razon: "Terminal de GNL: procesos de regasificación con intercambiadores y válvulas de alta exigencia técnica",
  },
  "logística de combustibles": {
    base: 5,
    equipos: "Tanques de almacenamiento, bombas de transferencia, válvulas de control y seguridad, sistemas de detección de fugas, instrumentación de presión y nivel",
    razon: "Terminal de combustibles: opera tanques, bombas y válvulas de transferencia que requieren inspección y mantenimiento periódico",
  },
  "gas natural": {
    base: 3,
    equipos: "Válvulas de control y seguridad, instrumentación de presión y flujo, compresores, trampas de vapor en estaciones de regulación",
    razon: "Distribución de gas natural: red de válvulas e instrumentación de presión que requiere mantenimiento y calibración periódica",
  },
  "logística carbón": {
    base: 3,
    equipos: "Sistemas de izaje y manejo de material a granel, cintas transportadoras, equipos hidráulicos de mantenimiento, plantas eléctricas de respaldo",
    razon: "Terminal portuario de carbón: opera equipos de izaje, manejo de granel y mantenimiento mecánico intensivo",
  },
  "generación/distribución eléctrica": {
    base: 3,
    equipos: "Transformadores, sistemas de refrigeración de subestaciones, plantas de emergencia, equipos de izaje para mantenimiento de líneas",
    razon: "Utility eléctrica: opera subestaciones y equipos de respaldo que requieren mantenimiento especializado e izaje en campo",
  },
};

function perfilDe(sectorEsperado = "") {
  const s = sectorEsperado.toLowerCase();
  for (const [clave, perfil] of Object.entries(PERFIL_SUBSECTOR)) {
    if (s.includes(clave)) return { clave, ...perfil };
  }
  return { clave: "otro", base: 2, equipos: null, razon: null };
}

const datosWeb = JSON.parse(fs.readFileSync(WEB, "utf8"));
const datosLinkedin = fs.existsSync(LINKEDIN) ? JSON.parse(fs.readFileSync(LINKEDIN, "utf8")) : { resultados: [] };
const traducciones = fs.existsSync(TRADUCCIONES) ? JSON.parse(fs.readFileSync(TRADUCCIONES, "utf8")) : {};
const linkedinPorDominio = new Map(datosLinkedin.resultados.map((r) => [r.dominio, r]));

const NO_ENCONTRADO = "No publicado en el sitio — validar por directorio o llamada";

// Ruido que se cuela en el descubrimiento: portales de noticias, directorios y
// agregadores que no son prospectos reales. Se detectan por dominio y por la
// forma del título (un titular de noticia no es una razón social).
const DOMINIOS_RUIDO = [
  "cartagenainfo", "info.com", "guiadel", "directorio", "paginas", "listado",
  "noticias", "prensa", "radio", "diario", "revista", "gov.co/noticia", "queseguro",
];

// Descartes explícitos de la corrida Petróleo y Gas (2026-09-01), revisados uno
// a uno sobre el contenido extraído. Se documenta el motivo de cada uno para
// que el descarte sea auditable y no un filtro silencioso. Dos categorías:
// (a) no es una empresa prospecto (prensa, academia, gobierno, gremio, ONG);
// (b) empresa extranjera sin planta ni filial confirmada en Colombia (regla #2
//     del proceso: solo empresas de Colombia).
const DOMINIOS_DESCARTADOS = {
  // (a) No son empresas con planta
  "academia.edu": "Repositorio académico",
  "repositorio.unal.edu.co": "Repositorio académico",
  "scielo.org.co": "Repositorio académico",
  "journalusco.edu.co": "Revista académica",
  "noesis.uis.edu.co": "Repositorio académico",
  "cervantesvirtual.com": "Biblioteca digital",
  "anla.gov.co": "Entidad de gobierno (autoridad ambiental)",
  "eiticolombia.gov.co": "Iniciativa de transparencia del gobierno",
  "barrancabermeja.gov.co": "Portal municipal",
  "business-humanrights.org": "ONG de derechos humanos",
  "ejatlas.org": "Atlas de conflictos ambientales (ONG)",
  "crudotransparente.com": "Portal de análisis y veeduría",
  "rutasdelconflicto.com": "Portal periodístico de memoria histórica",
  "gem.wiki": "Wiki de infraestructura energética",
  "uso.org.co": "Sindicato de trabajadores",
  "campetrol.org": "Gremio (Cámara Colombiana de Bienes y Servicios Petroleros)",
  "fedebiocombustibles.com": "Gremio de biocombustibles",
  "gasnova.co": "Gremio (Asociación Colombiana del GLP)",
  "bmcbec.com.co": "Gestor del mercado de gas (bolsa), no opera instalaciones",
  "blog.bancolombia.com": "Blog corporativo de un banco",
  "elpais.com": "Medio de comunicación",
  "lafm.com.co": "Medio de comunicación",
  "corrillos.com.co": "Medio de comunicación",
  "oilchannel.tv": "Medio de comunicación del sector",
  "rumbominero.com": "Medio de comunicación del sector",
  "mundopetroleo.com": "Medio de comunicación del sector",
  "lanoticiaputumayo.com": "Medio de comunicación",
  "informando.com.co": "Medio de comunicación",
  "gnlglobal.com": "Portal de noticias de GNL",
  "es-us.finanzas.yahoo.com": "Portal de noticias financieras",
  "es-us.noticias.yahoo.com": "Portal de noticias",
  "marthacifuentes.com": "Blog personal",
  "kpnsafety.com": "Artículo de blog con listado de empresas",
  "industrialinfo.com": "Base de datos de inteligencia de mercado (EE. UU.)",
  "co.jooble.org": "Portal de empleo",
  "emis.com": "Directorio empresarial de pago",
  "gettyimages.es": "Banco de imágenes",
  "cartagenarealty.com": "Inmobiliaria",
  "proexca.es": "Agencia de promoción exterior (Canarias, España)",
  "hklaw.com": "Firma de abogados",
  "wompea.com": "Seguridad empresarial, fuera del sector",
  "portalrefineriacartagena.powerappsportals.com": "Portal de proveedores de Reficar (duplicado de refineriadecartagena.com.co)",
  // (b) Empresas extranjeras sin planta ni filial confirmada en Colombia
  "petrobras.com.br": "Empresa brasileña — sin operación confirmada en Colombia",
  "tgn.com.ar": "Transportadora de Gas del Norte (Argentina)",
  "axionenergy.com": "Axion Energy (Argentina)",
  "corporacioncontrol.com": "Corporación Control (Venezuela)",
  "delsur-international.com": "Servicios petroleros en Venezuela",
  "pergas.net": "PERGAS C.A. (Venezuela)",
  "eulen.com": "Grupo Eulen (España) — servicios generales, no sector",
  "arvengtraining.com": "Arveng Training (España) — formación técnica",
  "exolum.com": "Exolum (España) — logística de graneles líquidos",
  "molgasenergy.com": "Molgas Energy (España) — red logística europea",
  "idom.com": "IDOM (España) — ingeniería",
  "nievesenergia.com": "Grupo Nieves (España) — la 'Cartagena' detectada es Cartagena, Murcia",
  "cartagena.repsol.es": "Refinería de Repsol en Cartagena, ESPAÑA (no Cartagena, Colombia)",
  "repsol.com": "Sitio corporativo global de Repsol (España)",
  "emcowheaton.com": "EMCO Wheaton (EE. UU./Alemania) — fabricante de equipos",
  "savageco.com": "Savage (EE. UU.) — sin operación confirmada en Colombia",
  "sgs.com": "SGS (Suiza) — certificadora global",
  "searaproyectos.com": "Seara Group (España) — sin operación confirmada en Colombia",
  "northindustrialgroup.com": "North Industrial Group — sitio con 10 referencias a Venezuela y teléfono +507; sin sede en Colombia",
  "serviciosjtfr.com": "Servicios JTFR — único teléfono publicado es de Venezuela (+58)",
  "tasweldermechanics.com": "Tasweldermechanics — teléfono de Sint Maarten (+1721), opera 'across the Caribbean' sin sede colombiana",
  // (c) Empresas colombianas reales cuyo sitio bloqueó toda extracción: se sacan
  //     del reporte porque no hay ni un dato que entregar, pero quedan aquí
  //     señaladas para que el equipo comercial las valide a mano.
  "clientes.speclng.com":
    "SPEC LNG (terminal de regasificación, Cartagena) — sitio bloqueado (HTTP 403), cero datos extraíbles. PROSPECTO VÁLIDO: contactar manualmente",
  "cienaga-lng.energy":
    "Ciénaga LNG (proyecto de regasificación, Magdalena) — sitio bloqueado (HTTP 403), cero datos extraíbles. PROSPECTO VÁLIDO: contactar manualmente",
};
const RE_TITULAR_NOTICIA =
  /\b(present[oó]|inaugur|abrir[áa]|construir[áa]|invertir[áa]|anunci|entreg[oó]|firm[oó]|adjudic|avanza|arranca|comenz|millones|proyecto de|as[íi] ser[áa]|conozca|estos son)\b/i;
const RE_TITULO_LISTADO = /^(listado|lista|los\s+\d*\s*mejores|las\s+\d*\s*mejores|top\s*\d+|mejores|directorio|gu[íi]a)\b/i;
// Etiquetas de página que se cuelan como si fueran la razón social. Se
// detectaron en esta corrida: "Nuestra historia" (Ecopetrol), "Operación"
// (Ocensa), "Páginas" (Promigas), "WordPress en Azure" (Cenit), "Joinchat"
// (plugin de WhatsApp), "Colombia" (Perenco).
const RE_NOMBRE_GENERICO =
  /^(inicio|home|bienvenid|principal|p[áa]gina principal|sitio oficial|index|operaci[oó]n(es)?|nuestra historia|nuestra empresa|p[áa]ginas?|contacto|cont[áa]ctenos|contact|qui[eé]nes somos|acerca de|nosotros|servicios|productos|joinchat|wordpress|untitled|colombia|espa[ñn]ol|english)\b/i;

function esRuido(web) {
  const dominio = (web.dominio ?? "").toLowerCase();
  const ref = (web.referencia ?? "").trim();
  if (DOMINIOS_DESCARTADOS[dominio]) return true;
  if (DOMINIOS_RUIDO.some((d) => dominio.includes(d))) return true;
  if (RE_TITULO_LISTADO.test(ref)) return true;
  // Un titular de noticia como "referencia" significa que el resultado era una
  // nota de prensa, no el sitio de la institución.
  if (RE_TITULAR_NOTICIA.test(ref) && ref.split(/\s+/).length > 5) return true;
  return false;
}

// Nombre derivado del dominio: última red de seguridad cuando ni el <title> ni
// el resultado de búsqueda dan una razón social utilizable. Es verificable (el
// usuario ve de dónde sale) y nunca inventa: solo limpia el dominio.
function nombreDesdeDominio(dominio = "") {
  const host = dominio
    .toLowerCase()
    .replace(/^(www|extranet|clientes|blog|portal|web|sitio)\./, "")
    .replace(/^[a-z]{2}\./, "");
  const base = host.replace(/\.(com|co|net|org|energy|tv|info|io|app)(\.[a-z]{2})?$/i, "");
  return base
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Basura observada en los <title> de esta corrida: entidades HTML sueltas
// ("&nbsp;"), el título por defecto de WordPress ("Solo otro sitio de
// WordPress"), nombres de plantilla ("sas.main"), títulos de video con años
// ("Video Corporativo 2026 2025") y frases geográficas ("Norte de Santander,
// Colombia"). Ninguno identifica a la empresa.
const RE_TITULO_BASURA =
  /&nbsp;|&amp;|wordpress|joinchat|youtube|vimeo|facebook|instagram|starter portal|^video\b|^solo otro sitio|just another|^\s*$|^[a-z]+\.[a-z]+$|,\s*colombia\s*$|(19|20)\d{2}\D+(19|20)\d{2}/i;

// El <title> de un sitio puede nombrar a otra empresa (transmetano.co titulaba
// "Promigas 50 años", su casa matriz). Un candidato que comparte raíz con el
// dominio es casi con certeza la razón social de ESTA empresa.
function coincideConDominio(nombre, dominio = "") {
  const normalizar = (s) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const n = normalizar(nombre);
  const d = normalizar(dominio).replace(/(com|co|net|org|energy)+$/, "");
  if (n.length < 3 || d.length < 3) return false;
  return d.includes(n) || n.includes(d);
}

function pareceRazonSocial(texto) {
  if (!texto) return false;
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length < 3 || limpio.length > 70) return false;
  if (RE_TITULO_BASURA.test(limpio)) return false;
  if (RE_NOMBRE_GENERICO.test(limpio)) return false;
  if (RE_TITULO_LISTADO.test(limpio)) return false;
  if (RE_TITULAR_NOTICIA.test(limpio) && limpio.split(/\s+/).length > 5) return false;
  // Una frase larga es una descripción o un titular, no una razón social.
  if (limpio.split(/\s+/).length > 8) return false;
  // Una sola palabra corta en minúsculas ("pos", "es") no identifica a nadie.
  if (!/\s/.test(limpio) && limpio.length < 5 && limpio === limpio.toLowerCase()) return false;
  // Un dominio pelado se resuelve mejor con nombreDesdeDominio().
  if (/^[\w-]+\.(com|co|net|org)(\.[a-z]{2})?$/i.test(limpio)) return false;
  return true;
}

// El nombre sale del <title> del propio sitio (partido por separadores, porque
// el patrón habitual es "Inicio - Empresa" y quedarse con el primer trozo daba
// "Inicio"), luego del resultado de búsqueda, y por último del dominio.
function nombreEmpresaDe(web) {
  const presentar = (n) => {
    const limpio = n.replace(/\s+/g, " ").trim();
    // Un nombre publicado todo en minúsculas ("transmetano") se muestra
    // capitalizado; no se toca si ya trae mayúsculas (siglas como TGI, AW).
    return limpio === limpio.toLowerCase() ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : limpio;
  };
  const candidatos = [
    ...(web.titulo ?? "").split(/[|\-–—:·]|\n/).map((s) => s.trim()),
    web.referencia ?? "",
  ].filter((c) => pareceRazonSocial(c));

  // 1º el candidato que además coincide con el dominio (es sin duda esta
  // empresa), 2º el primero que parezca una razón social, 3º el dominio limpio.
  const propio = candidatos.find((c) => coincideConDominio(c, web.dominio));
  if (propio) return presentar(propio);
  if (candidatos.length > 0) return presentar(candidatos[0]);
  return nombreDesdeDominio(web.dominio) || web.dominio;
}

// --- Selección del mejor dato de contacto -------------------------------------
// El scraping recoge TODO lo que parece un teléfono o un correo; aquí se elige
// cuál mostrar. No se descarta nada del dato original, solo se ordena.

// Rangos de años pegados ("2025 2024") y numeraciones de documento se colaban
// como teléfono porque cumplen el patrón de dígitos.
function puntajeTelefono(tel = "") {
  const digitos = tel.replace(/\D/g, "");
  if (/(19|20)\d{2}\s+(19|20)\d{2}/.test(tel)) return -100;
  if (digitos.length < 7 || digitos.length > 13) return -50;
  let p = 0;
  if (/^\+?57/.test(tel.replace(/\s/g, ""))) p += 10;
  if (/^3\d{9}$/.test(digitos)) p += 8;
  if (/^60\d{8}$/.test(digitos)) p += 6;
  if (/^(601|602|604|605|606|607|608)/.test(digitos)) p += 4;
  if (/^\+(?!57)/.test(tel.trim())) p -= 6;
  if (tel.includes("+") || tel.includes(" ") || tel.includes("(")) p += 1;
  return p;
}

function mejorTelefono(telefonos = []) {
  const ordenados = [...telefonos].sort((a, b) => puntajeTelefono(b) - puntajeTelefono(a));
  const mejor = ordenados[0];
  return mejor && puntajeTelefono(mejor) > -50 ? mejor : null;
}

// Un correo de notificaciones judiciales prueba que el dominio existe, pero no
// sirve para vender (lo advierte la propia directiva). Se prefiere el comercial.
const EMAIL_PREFERIDO = /^(comercial|ventas|sales|contacto|contactenos|info|informacion|mercadeo|servicioalcliente|atencion|atencionalcliente|gerencia|direccion)/i;
const EMAIL_EVITAR =
  /^(notificacion|notificaciones|notificacionesjudiciales|judicial|legal|juridic|rrhh|talento|empleo|trabaje|proveedores|pqr|quejas|correspondencia|prensa|comunicaciones|webmaster|noreply|no-reply|soporte|privacidad|compliance|etica|transparencia)/i;

function mejorEmail(emails = []) {
  // El scraping arrastra a veces escapes del HTML pegados al correo
  // (quejasyreclamos@ocensa.com.co"...); se corta en el primer carácter
  // que no puede formar parte de una dirección.
  emails = emails
    .map((e) => e.split(/[\\"'<>\s,;]/)[0].replace(/[.,;:]+$/, ""))
    .filter((e) => /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(e));
  const puntaje = (e) => {
    const usuario = e.split("@")[0] ?? "";
    if (EMAIL_PREFERIDO.test(usuario)) return 10;
    if (EMAIL_EVITAR.test(usuario)) return -5;
    return 0;
  };
  const ordenados = [...emails].sort((a, b) => puntaje(b) - puntaje(a));
  return ordenados[0] ?? null;
}

// Si lo único publicado es un buzón legal o de PQR, se dice explícitamente en la
// celda para que nadie lo use como si fuera el correo del área de mantenimiento.
function etiquetarEmail(email) {
  if (!email) return NO_ENCONTRADO;
  const usuario = email.split("@")[0] ?? "";
  if (EMAIL_EVITAR.test(usuario)) {
    return `${email} (buzón institucional/legal — NO es contacto comercial: pedir el área de mantenimiento por conmutador)`;
  }
  return email;
}

const STOPWORDS_EN = /\b(the|and|our|with|for|company|solutions|products|services|home|about|leading)\b/gi;
const STOPWORDS_ES = /\b(el|la|los|las|nuestra|nuestro|empresa|soluciones|productos|servicios|con|inicio|sitio)\b/gi;

function pareceIngles(texto) {
  if (!texto || texto.length < 15) return false;
  return (texto.match(STOPWORDS_EN) ?? []).length > (texto.match(STOPWORDS_ES) ?? []).length;
}

function textoEnEspanol(web) {
  const trad = traducciones[web.dominio];
  const original = `${web.titulo ?? ""} ${web.descripcion ?? ""}`;
  if (!pareceIngles(original)) return { titulo: web.titulo, descripcion: web.descripcion };
  if (trad) return { titulo: trad.titulo_es ?? web.titulo, descripcion: trad.descripcion_es ?? web.descripcion };
  return {
    titulo: web.titulo,
    descripcion: web.descripcion ? `[Pendiente de traducción — original en inglés] ${web.descripcion}` : web.descripcion,
  };
}

function ciudadFinal(web) {
  const detectada = web.ciudad_detectada;
  if (detectada && CIUDADES_CARIBE.some((c) => c.toLowerCase() === detectada.toLowerCase())) {
    return { ciudad: detectada, enCaribe: true, confirmada: web.ciudad_confianza === "alta" };
  }
  if (detectada && CIUDADES_OTRAS.some((c) => c.toLowerCase() === detectada.toLowerCase())) {
    return { ciudad: detectada, enCaribe: false, confirmada: web.ciudad_confianza === "alta" };
  }
  // Sin ciudad detectada en el sitio: se conserva la ciudad de la consulta que
  // lo descubrió, marcada explícitamente como sin confirmar.
  return { ciudad: web.ciudad_esperada ?? "Sin determinar", enCaribe: false, confirmada: false, soloBusqueda: true };
}

function calcular(web) {
  const evidencia = web.evidencia ?? [];
  const perfil = perfilDe(web.sector_esperado);
  const equiposConfirmados = evidencia.filter((e) => e.linea !== "General" && e.linea !== "Servicios transversales");
  const ubic = ciudadFinal(web);

  let score = 0;
  const justificacion = [];

  if (perfil.base > 0) {
    score += perfil.base;
    justificacion.push(`+${perfil.base} tipo de instalación (${perfil.clave}): ${perfil.razon ?? "sector objetivo del ICP"}`);
  }

  const lineasConEquipo = new Set(equiposConfirmados.map((e) => e.linea));
  if (lineasConEquipo.size > 0) {
    const extra = Math.min(lineasConEquipo.size * 2, 4);
    score += extra;
    justificacion.push(`+${extra} equipos CONFIRMADOS en su sitio (${[...lineasConEquipo].join(", ")})`);
  }

  const equiposClave = evidencia.filter((e) =>
    /chiller|caldera|torres de enfriamiento|climatizaci|hvac|intercambiador|vapor|v[áa]lvula|izaje|hidr[áa]ulic/i.test(e.equipo)
  );
  if (equiposClave.length > 0) {
    score += 2;
    justificacion.push(`+2 menciona equipos núcleo de Enermast (${equiposClave.map((e) => e.equipo).join(", ")})`);
  }

  if (evidencia.some((e) => e.linea === "Servicios transversales")) {
    score += 2;
    justificacion.push("+2 habla públicamente de mantenimiento/confiabilidad");
  }

  if (AREA_METRO_BARRANQUILLA.some((c) => c.toLowerCase() === (ubic.ciudad ?? "").toLowerCase())) {
    score += 3;
    justificacion.push("+3 en el área metropolitana de Barranquilla (sede de Enermast)");
  } else if (ubic.enCaribe) {
    score += 2;
    justificacion.push("+2 en la Costa Caribe");
  }

  // Se puntúa el contacto realmente utilizable, no cualquier cadena que el
  // scraping haya recogido (un "2025 2024" no es un teléfono).
  const tieneEmail = Boolean(mejorEmail(web.emails));
  const tieneTel = Boolean(mejorTelefono(web.telefonos));
  if (tieneEmail && tieneTel) {
    score += 2;
    justificacion.push("+2 tiene correo y teléfono publicados (contacto directo inmediato)");
  } else if (tieneEmail || tieneTel) {
    score += 1;
    justificacion.push("+1 tiene un canal de contacto publicado");
  }

  if ((web.directivos?.length ?? 0) > 0) {
    score += 1;
    justificacion.push("+1 publica nombres de cargos directivos en su sitio");
  }


  const nivel = score >= 12 ? "Alto" : score >= 8 ? "Medio" : "Bajo";

  const lineas = [...new Set(evidencia.map((e) => e.linea))].filter((l) => l !== "General");
  const serviciosPorLinea = {
    "Energía y eficiencia": "Mantenimiento y limpieza química de chillers, torres de enfriamiento y calderas; pruebas de eficiencia térmica; detección y corrección de fugas.",
    Componentes: "Mantenimiento y certificación de válvulas de seguridad; trampas de vapor; calibración de instrumentación y manómetros.",
    Herramientas: "Inspección, prueba y certificación de equipos de izaje y herramientas hidráulicas.",
    "Servicios transversales": "Mantenimiento preventivo/correctivo, termografía y ultrasonido, acompañamiento en paradas programadas.",
  };

  return { evidencia, equiposConfirmados, perfil, ubic, score, nivel, justificacion, lineas, serviciosPorLinea };
}

function textoEquipos(c) {
  const partes = [];
  if (c.evidencia.length > 0) {
    partes.push(
      "CONFIRMADO en su sitio: " + c.evidencia.map((e) => `${e.equipo} (${e.menciones} menciones) — ${e.url}`).join(" | ")
    );
  }
  if (c.perfil.equipos) {
    partes.push(`INFERENCIA por tipo de instalación (no confirmado, validar en visita): ${c.perfil.equipos}`);
  }
  return partes.join("\n\n") || "Sin evidencia ni perfil típico — validar en llamada";
}

function anguloContacto(nombre, c) {
  const confirmados = c.equiposConfirmados.map((e) => e.equipo);
  if (confirmados.length > 0) {
    return `Su sitio menciona ${confirmados.slice(0, 2).join(" y ")}. Entrar con la preinspección gratuita enfocada en esos equipos, cuantificando el costo de una falla no programada en su operación.`;
  }
  if (c.perfil.equipos) {
    return `${c.perfil.razon}. Entrar con la preinspección gratuita enfocada en sus equipos térmicos, válvulas críticas y herramienta de mantenimiento: en esta operación una parada no programada tiene costo directo por hora. Validar primero qué equipos operan.`;
  }
  return "Validar en llamada qué equipos térmicos, de vapor, válvulas o izaje operan antes de proponer. Usar la preinspección gratuita como puerta de entrada.";
}

const descubiertas = datosWeb.sitios.length;
// Se descartan portales de noticias, directorios y agregadores que no son
// prospectos reales antes de puntuar.
const sitiosLimpios = datosWeb.sitios.filter((web) => !esRuido(web));
const descartadasRuido = descubiertas - sitiosLimpios.length;

const descartados = datosWeb.sitios
  .filter((web) => esRuido(web))
  .map((web) => ({
    dominio: web.dominio,
    referencia: web.referencia ?? "",
    motivo: DOMINIOS_DESCARTADOS[(web.dominio ?? "").toLowerCase()] ?? "Portal de noticias, directorio o agregador (no es una empresa prospecto)",
    fuente: web.fuente_descubrimiento ?? "",
  }))
  .sort((a, b) => a.dominio.localeCompare(b.dominio));

const todas = sitiosLimpios.map((web) => ({ web, c: calcular(web) }));
// Alcance de esta corrida: toda Colombia (el usuario pidió las zonas petroleras
// y gasíferas del país, no una ciudad concreta). La cercanía al Caribe ya no
// excluye a nadie: solo suma puntos por proximidad operativa a Enermast.
const enAlcance = [...todas].sort((a, b) => b.c.score - a.c.score);
const enCaribe = todas.filter((f) => f.c.ubic.enCaribe).length;
const filas = enAlcance.slice(0, MAX_RESULTADOS);
const excluidasPorLimite = enAlcance.length - filas.length;

const wb = new ExcelJS.Workbook();
wb.creator = "Agente de prospección Enermast";
wb.created = new Date();

// ================= Hoja 1: Prospectos =================
const hoja = wb.addWorksheet("Prospectos", { views: [{ state: "frozen", ySplit: 1 }] });
hoja.columns = [
  { header: "Nivel de oportunidad", key: "oportunidad", width: 16 },
  { header: "Score", key: "score", width: 7 },
  { header: "Empresa", key: "empresa", width: 34 },
  { header: "Sitio web", key: "web", width: 32 },
  { header: "País", key: "pais", width: 10 },
  { header: "Ciudad", key: "ciudad", width: 24 },
  { header: "Sector / Industria", key: "industria", width: 26 },
  { header: "Descripción", key: "descripcion", width: 55 },
  { header: "Equipos relevantes identificados", key: "equipos", width: 60 },
  { header: "Posible necesidad", key: "necesidad", width: 45 },
  { header: "Servicio Enermast recomendado", key: "servicio", width: 55 },
  { header: "Línea de negocio", key: "linea", width: 24 },
  { header: "Cargos objetivo a buscar", key: "cargos", width: 40 },
  { header: "LinkedIn empresa", key: "linkedin", width: 40 },
  { header: "Teléfono", key: "telefono", width: 22 },
  { header: "Email", key: "email", width: 30 },
  { header: "Justificación del score", key: "justificacion", width: 70 },
  { header: "Ángulo de contacto recomendado", key: "angulo", width: 70 },
];

for (const { web, c } of filas) {
  const es = textoEnEspanol(web);
  const nombre = nombreEmpresaDe(web);
  hoja.addRow({
    oportunidad: c.nivel,
    score: c.score,
    empresa: nombre,
    web: web.sitio_web,
    pais: "Colombia",
    // La ciudad de la consulta NUNCA se presenta como un hecho: si no se pudo
    // verificar en el propio sitio, la celda dice de dónde salió el dato.
    ciudad: c.ubic.confirmada
      ? c.ubic.ciudad
      : c.ubic.soloBusqueda
        ? `${c.ubic.ciudad} — sin confirmar (es la ciudad de la búsqueda, no del sitio)`
        : `${c.ubic.ciudad} (mencionada en el sitio, sin dirección que la confirme)`,
    industria: web.sector_esperado ?? "",
    descripcion: (es.descripcion ?? es.titulo ?? "").slice(0, 900),
    equipos: textoEquipos(c),
    necesidad: c.equiposConfirmados.length
      ? "Pérdida de eficiencia térmica, incrustación, fugas y paradas no programadas en los equipos identificados."
      : "Mantenimiento de equipos térmicos, sistemas de vapor, válvulas e izaje; riesgo de parada no programada en operación continua.",
    servicio: c.lineas.map((l) => c.serviciosPorLinea[l]).filter(Boolean).join(" ") ||
      "Preinspección gratuita de intercambiadores, calderas, torres de enfriamiento y válvulas críticas para diagnóstico inicial.",
    linea: c.lineas.join(" / ") || "Energía y eficiencia (probable)",
    cargos: CARGOS_OBJETIVO.join(", "),
    linkedin: web.linkedin || NO_ENCONTRADO,
    telefono: mejorTelefono(web.telefonos) || NO_ENCONTRADO,
    email: etiquetarEmail(mejorEmail(web.emails)),
    justificacion: c.justificacion.join(" · "),
    angulo: anguloContacto(nombre, c),
  });
}

hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
hoja.getRow(1).alignment = { vertical: "middle", wrapText: true };
hoja.getRow(1).height = 30;
hoja.autoFilter = { from: "A1", to: "R1" };
hoja.eachRow((row, i) => {
  if (i === 1) return;
  row.alignment = { vertical: "top", wrapText: true };
  const nivel = row.getCell("oportunidad").value;
  const color = nivel === "Alto" ? "FFC6EFCE" : nivel === "Medio" ? "FFFFEB9C" : "FFF2F2F2";
  row.getCell("oportunidad").fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  row.getCell("oportunidad").font = { bold: true };
  for (const key of ["telefono", "email", "linkedin"]) {
    if (row.getCell(key).value === NO_ENCONTRADO) row.getCell(key).font = { italic: true, color: { argb: "FF999999" } };
  }
});

// ================= Hoja 2: Contactos objetivo =================
// Nunca deja filas vacías: si no hay un contacto real identificado, entrega
// la búsqueda de LinkedIn lista para cada cargo objetivo de esa empresa.
const hoja2 = wb.addWorksheet("Contactos objetivo", { views: [{ state: "frozen", ySplit: 1 }] });
hoja2.columns = [
  { header: "Empresa", key: "empresa", width: 34 },
  { header: "Nivel", key: "nivel", width: 9 },
  { header: "Ciudad", key: "ciudad", width: 20 },
  { header: "Nombre identificado", key: "nombre", width: 28 },
  { header: "Cargo objetivo", key: "cargo", width: 32 },
  { header: "Perfil / búsqueda en LinkedIn", key: "perfil", width: 85 },
  { header: "Estado", key: "estado", width: 34 },
  { header: "Teléfono empresa", key: "telefono", width: 22 },
  { header: "Email empresa", key: "email", width: 30 },
];

for (const { web, c } of filas) {
  const nombreEmpresa = nombreEmpresaDe(web);
  const ciudad = c.ubic.ciudad;
  const telefono = mejorTelefono(web.telefonos) || NO_ENCONTRADO;
  const email = mejorEmail(web.emails) || NO_ENCONTRADO;
  const perfilesLi = linkedinPorDominio.get(web.dominio)?.perfiles ?? [];
  const directivos = web.directivos ?? [];

  if (directivos.length > 0) {
    for (const d of directivos) {
      const apellido = d.nombre.split(" ").slice(-1)[0].toLowerCase();
      const match = perfilesLi.find((p) => p.confianza !== "baja" && (p.titulo ?? "").toLowerCase().includes(apellido));
      hoja2.addRow({
        empresa: nombreEmpresa,
        nivel: c.nivel,
        ciudad,
        nombre: d.nombre,
        cargo: d.cargo,
        perfil: match
          ? match.url
          : `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${d.nombre} ${nombreEmpresa}`)}`,
        estado: match ? "Perfil encontrado — verificar antes de contactar" : "Nombre confirmado en el sitio; verificar perfil",
        telefono,
        email,
      });
    }
  } else {
    // El usuario pidió explícitamente NO entregar enlaces de búsqueda genéricos
    // por cargo. Si el sitio no publica a nadie, se dice tal cual y se entrega
    // la vía real de entrada: el conmutador, pidiendo por el cargo.
    hoja2.addRow({
      empresa: nombreEmpresa,
      nivel: c.nivel,
      ciudad,
      nombre: "Sin contacto público verificable en esta corrida",
      cargo: CARGOS_OBJETIVO.join(" · "),
      perfil: "No se encontró ningún perfil confirmable — no se entrega una búsqueda genérica por norma del proceso",
      estado:
        telefono === NO_ENCONTRADO
          ? "Sin teléfono publicado: entrar por el correo de la empresa pidiendo el área de mantenimiento"
          : "Llamar al conmutador y pedir por alguno de los cargos objetivo",
      telefono,
      email,
    });
  }
}
hoja2.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
hoja2.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
hoja2.getRow(1).alignment = { vertical: "middle", wrapText: true };
hoja2.eachRow((row, i) => {
  if (i > 1) row.alignment = { vertical: "top", wrapText: true };
});

// ================= Hoja 3: Explicación de columnas =================
const hoja3 = wb.addWorksheet("Explicación de columnas");
hoja3.columns = [
  { header: "Hoja", key: "hoja", width: 22 },
  { header: "Columna", key: "columna", width: 32 },
  { header: "Qué significa", key: "explicacion", width: 100 },
];
const explicaciones = [
  ["Prospectos", "Nivel de oportunidad", "Alto (score ≥12), Medio (8-11) o Bajo (<8). Es un resumen del Score; para priorizar, ordene por Score."],
  ["Prospectos", "Score", "Puntaje acumulado según las reglas listadas al final de esta hoja. La columna 'Justificación del score' muestra, fila por fila, exactamente qué regla sumó y por qué."],
  ["Prospectos", "Empresa / Sitio web / País", "Identificación. El nombre viene del resultado de búsqueda con el que se descubrió la empresa; el sitio es la URL final tras redirecciones. País siempre Colombia (regla del proceso)."],
  ["Prospectos", "Ciudad", "Ciudad detectada junto a una dirección en el propio sitio web (dato confirmado). Si dice 'es la ciudad de la búsqueda', el sitio no publica dirección y lo que se muestra es la ciudad de la consulta que lo descubrió: NO es la sede real y debe verificarse. Si dice 'mencionada en el sitio, sin dirección que la confirme', la ciudad aparece en el texto pero no junto a una dirección."],
  ["Prospectos", "Sector / Industria", "Subsector asignado según la consulta de búsqueda que descubrió la empresa (p. ej. refinación, petroquímica, procesamiento de gas, producción de gas, facilidades de producción, midstream/oleoducto, midstream/gasoducto, almacenamiento/terminal, GLP, GNL, contratista O&M o de paradas de planta)."],
  ["Prospectos", "Descripción", "Meta-descripción o título publicado por el propio sitio. Si el sitio está en inglés y no hay traducción cargada, se marca '[Pendiente de traducción]'."],
  ["Prospectos", "Equipos relevantes identificados", "Se divide en dos partes claramente separadas: 'CONFIRMADO en su sitio' son equipos mencionados literalmente en su web, con número de menciones y la URL exacta donde se encontró; 'INFERENCIA por tipo de instalación' es el equipamiento que ese tipo de instalación necesariamente opera (una refinería opera intercambiadores y sistemas de vapor), y NO está verificado: debe validarse en la visita."],
  ["Prospectos", "Posible necesidad / Servicio Enermast recomendado / Línea de negocio", "Se derivan de los equipos identificados, cruzando contra el catálogo de servicios de Enermast (directives/contexto_enermast.md)."],
  ["Prospectos", "Cargos objetivo a buscar", "Los cargos que en este tipo de institución deciden sobre mantenimiento e infraestructura."],
  ["Prospectos", "LinkedIn empresa / Teléfono / Email", "Extraídos del sitio web con navegador real (Playwright), incluyendo el pie de página y la página de contacto. Si dice 'No publicado en el sitio', se buscó y no se encontró: no es un campo sin revisar."],
  ["Prospectos", "Justificación del score", "Desglose de cada regla que sumó puntos a esa empresa en particular."],
  ["Prospectos", "Ángulo de contacto recomendado", "Cómo abrir la conversación comercial según la evidencia concreta de esa empresa."],
  ["Contactos objetivo", "Nombre identificado", "Persona extraída del propio sitio (páginas de directivos/organigrama) cuando aparece con el formato 'Nombre, Cargo'. Si dice 'Por identificar', el sitio no publica nombres para ese cargo."],
  ["Contactos objetivo", "Perfil / búsqueda en LinkedIn", "Solo aparece un enlace cuando se identificó a una persona real en el sitio de la empresa. Si no se encontró a nadie verificable, la celda lo dice: por norma del proceso NO se entregan búsquedas genéricas por cargo."],
  ["Contactos objetivo", "Estado", "Indica si el nombre está confirmado en el sitio de la empresa (verificar siempre antes de escribir) o cuál es la vía de entrada recomendada cuando no hay contacto nominal."],
  ["Contactos objetivo", "Teléfono / Email empresa", "Contacto general de la institución, para llegar por conmutador cuando no hay contacto nominal."],
  ["Diagnóstico", "(resumen)", "Resumen de la corrida: fecha, fuentes usadas, cuántas empresas se descubrieron y evaluaron, y cobertura de contactos."],
  ["Descartados", "(listado)", "Todo dominio que salió del descubrimiento pero NO llegó al reporte, con el motivo exacto: prensa, academia, gobierno, gremio, directorio, o empresa extranjera sin operación confirmada en Colombia. Sirve para auditar el filtro y rescatar manualmente cualquier caso que usted considere válido."],
];
for (const [h, columna, explicacion] of explicaciones) hoja3.addRow({ hoja: h, columna, explicacion });

hoja3.addRow({});
hoja3.addRow({ hoja: "CÓMO SE CALCULA EL SCORE", columna: "", explicacion: "" });
const basesPorSubsector = Object.entries(PERFIL_SUBSECTOR)
  .map(([clave, p]) => `+${p.base} ${clave}`)
  .join(" · ");
for (const linea of [
  `Puntaje base por tipo de instalación/subsector (según lo que ese tipo de instalación necesariamente opera): ${basesPorSubsector}.`,
  "+2 por cada línea de negocio de Enermast con equipos CONFIRMADOS en el sitio (tope +4).",
  "+2 si menciona explícitamente equipos núcleo de Enermast: intercambiadores, calderas, torres de enfriamiento, chillers, sistemas de vapor, válvulas, izaje o equipos hidráulicos.",
  "+2 si habla públicamente de mantenimiento, confiabilidad o paradas programadas.",
  "+3 si está en el área metropolitana de Barranquilla (sede de Enermast) · +2 si está en el resto de la Costa Caribe. Ninguna empresa se excluye por su ciudad: el alcance de esta corrida es toda Colombia y la cercanía solo suma puntos.",
  "+2 si publica correo Y teléfono · +1 si publica solo uno de los dos.",
  "+1 si publica nombres de cargos directivos en su sitio.",
  "Umbrales: Alto = 12 o más · Medio = 8 a 11 · Bajo = menos de 8.",
  "Nota: el puntaje base por tipo de instalación es una INFERENCIA declarada, no evidencia. La columna 'Equipos relevantes identificados' siempre separa lo confirmado de lo inferido.",
]) {
  hoja3.addRow({ hoja: "", columna: "", explicacion: "• " + linea });
}
hoja3.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
hoja3.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
hoja3.eachRow((row, i) => {
  if (i > 1) row.alignment = { vertical: "top", wrapText: true };
});

// ================= Hoja 4: Diagnóstico (solo resumen) =================
const hoja4 = wb.addWorksheet("Diagnóstico");
hoja4.columns = [
  { header: "Concepto", key: "tema", width: 46 },
  { header: "Detalle", key: "detalle", width: 105 },
];
const conEmail = filas.filter((f) => f.web.emails?.length > 0).length;
const conTel = filas.filter((f) => f.web.telefonos?.length > 0).length;
const conAmbos = filas.filter((f) => f.web.emails?.length > 0 && f.web.telefonos?.length > 0).length;
const conEvidencia = filas.filter((f) => f.c.evidencia.length > 0).length;
const conDirectivos = filas.filter((f) => f.web.directivos?.length > 0).length;

for (const [tema, detalle] of [
  ["Fecha de generación", new Date().toLocaleString("es-CO")],
  ["Sector prospectado", "Petróleo y Gas: refinación y petroquímica, procesamiento y producción de gas, facilidades de producción y tratamiento de crudo, midstream (oleoductos y gasoductos), almacenamiento y terminales, GLP/GNL y contratistas de mantenimiento y paradas de planta"],
  ["Alcance geográfico", "Toda Colombia, con foco en las zonas petroleras y gasíferas: Barrancabermeja y Magdalena Medio, Cartagena (Mamonal), Casanare (Cusiana/Cupiagua), Meta (Llanos), La Guajira, Huila, Putumayo, más sedes administrativas en Bogotá y la Costa Caribe"],
  ["Enfoque solicitado", "Operación y mantenimiento: se priorizan empresas con instalaciones fijas en operación continua (refinerías, plantas de gas, terminales, facilidades) sobre exploración y perforación pura"],
  ["Línea de negocio", "Todas (Energía y eficiencia · Herramientas · Componentes) — cada prospecto se evalúa contra las tres según la evidencia de su propio sitio"],
  ["Fuentes utilizadas", "Paso 1 — Descubrimiento: búsqueda web real (Firecrawl /search) sobre directorios, sitios oficiales y noticias del sector. Paso 2 — Extracción: navegador real Playwright (Chromium) sobre cada sitio, con Firecrawl como respaldo."],
  ["Empresas descubiertas (Paso 1)", `${descubiertas} dominios únicos encontrados por búsqueda en internet`],
  ["Descartadas del reporte", `${descartadasRuido} — prensa, academia, gobierno, gremios, directorios y empresas extranjeras sin operación confirmada en Colombia. El detalle con el motivo de cada una está en la hoja 'Descartados'`],
  ["Empresas evaluadas (Paso 2)", `${todas.length} sitios scrapeados y puntuados`],
  ["Distribución geográfica", `${enCaribe} de ${todas.length} empresas con ciudad confirmada en la Costa Caribe (suman puntos por proximidad a la sede de Enermast en Barranquilla); el resto está en el interior del país y NO se excluye — el alcance de esta corrida es toda Colombia`],
  ["Empresas en el reporte", `${filas.length} (tope de ${MAX_RESULTADOS})${excluidasPorLimite > 0 ? `, se excluyeron ${excluidasPorLimite} con menor score` : ""}`],
  ["Prioridad Alta", String(filas.filter((f) => f.c.nivel === "Alto").length)],
  ["Prioridad Media", String(filas.filter((f) => f.c.nivel === "Medio").length)],
  ["Prioridad Baja", String(filas.filter((f) => f.c.nivel === "Bajo").length)],
  ["Empresas con email publicado", `${conEmail} de ${filas.length}`],
  ["Empresas con teléfono publicado", `${conTel} de ${filas.length}`],
  ["Empresas con email y teléfono", `${conAmbos} de ${filas.length}`],
  ["Empresas con equipos confirmados en su web", `${conEvidencia} de ${filas.length} — el resto tiene equipamiento inferido por tipo de instalación, marcado como tal`],
  ["Empresas con directivos identificados", `${conDirectivos} de ${filas.length} — ninguna de estas empresas publica nombres de su equipo de mantenimiento u operaciones en su sitio web`],
  ["Por qué no hay nombres de personas", "Los sitios corporativos de petróleo y gas publican junta directiva y alta gerencia, pero no a los jefes de mantenimiento, confiabilidad o compras, que son los cargos que decide Enermast. La confirmación automática de perfiles de LinkedIn se probó y no es viable a escala (el buscador bloquea la consulta automatizada). Por norma del proceso NO se rellena con búsquedas genéricas ni con nombres sin verificar: la vía de entrada es el conmutador o el correo comercial, pidiendo por el cargo"],
  ["Limitación de fuentes", "Dos empresas reales del sector (SPEC LNG y Ciénaga LNG, terminales de regasificación) bloquearon toda extracción con HTTP 403; quedan señaladas en la hoja 'Descartados' para contacto manual"],
]) {
  hoja4.addRow({ tema, detalle });
}
hoja4.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
hoja4.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
hoja4.eachRow((row, i) => {
  if (i > 1) row.alignment = { vertical: "top", wrapText: true };
});

// ================= Hoja 5: Descartados =================
// Transparencia del filtro: toda empresa que salió del descubrimiento pero no
// llegó al reporte aparece aquí con el motivo, para que el descarte sea
// auditable y el usuario pueda rescatar manualmente lo que considere.
const hoja5 = wb.addWorksheet("Descartados", { views: [{ state: "frozen", ySplit: 1 }] });
hoja5.columns = [
  { header: "Dominio", key: "dominio", width: 34 },
  { header: "Nombre en el resultado de búsqueda", key: "referencia", width: 42 },
  { header: "Motivo del descarte", key: "motivo", width: 62 },
  { header: "Cómo se descubrió", key: "fuente", width: 80 },
];
for (const d of descartados) hoja5.addRow(d);
hoja5.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
hoja5.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
hoja5.getRow(1).alignment = { vertical: "middle", wrapText: true };
hoja5.eachRow((row, i) => {
  if (i > 1) row.alignment = { vertical: "top", wrapText: true };
});

fs.mkdirSync(DIR_SALIDA, { recursive: true });
const fecha = new Date().toISOString().slice(0, 10);

// El nombre incluye el sector prospectado (tomado de los propios datos, no
// inventado) para que dos corridas del mismo día nunca se pisen entre sí.
// Aprendizaje 2026-09-01: una corrida de "Energía" sobrescribió sin avisar el
// entregable de una corrida institucional anterior generada el mismo día,
// porque el nombre solo llevaba la fecha. Ver directives/prospectar_clientes.md.
function slugSector() {
  const prefijos = [...new Set(sitiosLimpios.map((w) => (w.sector_esperado ?? "").split(" - ")[0].trim()).filter(Boolean))];
  const base = prefijos.length === 1 ? prefijos[0] : prefijos.join("_");
  return base
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "general";
}

let archivo = path.join(DIR_SALIDA, `prospectos_enermast_${slugSector()}_${fecha}.xlsx`);
let sufijo = 2;
while (fs.existsSync(archivo)) {
  archivo = path.join(DIR_SALIDA, `prospectos_enermast_${slugSector()}_${fecha}_v${sufijo}.xlsx`);
  sufijo++;
}
await wb.xlsx.writeFile(archivo);

console.log(`Excel generado: ${archivo}`);
console.log(`Descubiertas: ${datosWeb.sitios.length} | evaluadas: ${enAlcance.length} | en reporte: ${filas.length}`);
console.log(`Alto: ${filas.filter((f) => f.c.nivel === "Alto").length} | Medio: ${filas.filter((f) => f.c.nivel === "Medio").length} | Bajo: ${filas.filter((f) => f.c.nivel === "Bajo").length}`);
console.log(`Con email: ${conEmail} | con teléfono: ${conTel} | con ambos: ${conAmbos}`);
