// PASO 2 del flujo: extrae toda la información de cada sitio web.
// Motor principal: Playwright (Chromium headless) — renderiza JS y entrega el
// HTML completo, incluido el pie de página donde suelen estar correo y
// teléfono. Respaldo: Firecrawl (consume créditos) cuando Playwright no
// puede cargar el sitio. Ver directives/prospectar_clientes.md.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  RUTAS_CONTACTO_DIRECTAS,
  analizarEquipos,
  consolidarEvidencia,
  detectarIdioma,
  extraerContacto,
  extraerDirectivos,
  extraerEnlaces,
  extraerMeta,
  limpiarHtml,
} from "./lib/extraccion.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMILLAS = path.join(RAIZ, "execution", "semillas_prospectos.json");
const SALIDA = path.join(RAIZ, ".tmp", "evidencia_web.json");

const TIMEOUT_MS = 25000;
const CONCURRENCIA = 4;
const MAX_PAGINAS_INTERNAS = 8;
const UMBRAL_CONTENIDO_VACIO = 600;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
let firecrawlUsos = 0;
let firecrawlErrores = 0;
let firecrawlDeshabilitado = false;

let navegador;

async function descargarPlaywright(contexto, url) {
  const pagina = await contexto.newPage();
  try {
    // "domcontentloaded" + espera corta: "networkidle" cuelga en sitios con
    // analítica o chats que mantienen conexiones abiertas indefinidamente.
    await pagina.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    await pagina.waitForTimeout(1800);
    // El pie de página suele cargarse al hacer scroll (lazy loading).
    await pagina.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await pagina.waitForTimeout(700);
    const html = await pagina.content();
    return { html, texto: limpiarHtml(html), urlFinal: pagina.url() };
  } catch (e) {
    return { error: `playwright: ${e.message.split("\n")[0].slice(0, 90)}` };
  } finally {
    await pagina.close().catch(() => {});
  }
}

async function descargarFirecrawl(url) {
  if (!FIRECRAWL_API_KEY || firecrawlDeshabilitado) return { error: "firecrawl no disponible" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["html", "links"], onlyMainContent: false }),
    });
    if (res.status === 401 || res.status === 402) {
      firecrawlDeshabilitado = true;
      return { error: `firecrawl ${res.status} (${res.status === 401 ? "key inválida" : "sin créditos"}) — deshabilitado` };
    }
    if (res.status === 429) {
      firecrawlErrores++;
      return { error: "firecrawl 429 (límite de tasa, transitorio)" };
    }
    if (!res.ok) {
      firecrawlErrores++;
      return { error: `firecrawl HTTP ${res.status}` };
    }
    const json = await res.json();
    if (!json.success || !json.data?.html) {
      firecrawlErrores++;
      return { error: "firecrawl sin contenido" };
    }
    firecrawlUsos++;
    return {
      html: json.data.html,
      texto: limpiarHtml(json.data.html),
      urlFinal: json.data.metadata?.sourceURL ?? url,
      enlacesResueltos: json.data.links ?? [],
      viaFirecrawl: true,
    };
  } catch (e) {
    firecrawlErrores++;
    return { error: e.name === "AbortError" ? "timeout firecrawl" : `firecrawl ${e.message}` };
  } finally {
    clearTimeout(t);
  }
}

async function descargar(contexto, url) {
  const pw = await descargarPlaywright(contexto, url);
  const vacio = !pw.error && (pw.texto?.length ?? 0) < UMBRAL_CONTENIDO_VACIO;
  if (!pw.error && !vacio) return pw;

  const fc = await descargarFirecrawl(url);
  if (!fc.error) return fc;
  return vacio ? pw : pw.error ? fc : pw;
}

async function procesarEmpresa(contexto, semilla) {
  const base = `https://${semilla.dominio}`;
  const hallazgos = [];
  const errores = [];
  const directivos = [];
  const contactos = { emails: new Set(), telefonos: new Set(), linkedin: null, ciudad_detectada: null, ciudad_confianza: null };
  let meta = { titulo: null, meta_descripcion: null };
  let paginasOk = 0;
  let usoFirecrawl = false;
  const idiomas = [];
  const visitadas = new Set();

  function procesarPagina(url, html, texto) {
    visitadas.add(url.replace(/\/$/, ""));
    hallazgos.push(...analizarEquipos(texto, url));
    directivos.push(...extraerDirectivos(texto, url));
    const idioma = detectarIdioma(texto);
    if (idioma) idiomas.push(idioma);
    const c = extraerContacto(html, texto);
    for (const e of c.emails) contactos.emails.add(e);
    for (const t of c.telefonos) contactos.telefonos.add(t);
    contactos.linkedin ??= c.linkedin;
    if (c.ciudad_confianza === "alta" && contactos.ciudad_confianza !== "alta") {
      contactos.ciudad_detectada = c.ciudad_detectada;
      contactos.ciudad_confianza = c.ciudad_confianza;
    } else if (!contactos.ciudad_detectada) {
      contactos.ciudad_detectada = c.ciudad_detectada;
      contactos.ciudad_confianza = c.ciudad_confianza;
    }
  }

  const inicio = await descargar(contexto, base);
  if (inicio.error) {
    errores.push({ url: base, error: inicio.error });
  } else {
    paginasOk++;
    usoFirecrawl ||= Boolean(inicio.viaFirecrawl);
    meta = extraerMeta(inicio.html);
    procesarPagina(inicio.urlFinal ?? base, inicio.html, inicio.texto);

    for (const url of extraerEnlaces(inicio.html, inicio.urlFinal ?? base, inicio.enlacesResueltos, MAX_PAGINAS_INTERNAS)) {
      const pagina = await descargar(contexto, url);
      if (pagina.error) {
        errores.push({ url, error: pagina.error });
        continue;
      }
      paginasOk++;
      usoFirecrawl ||= Boolean(pagina.viaFirecrawl);
      procesarPagina(pagina.urlFinal ?? url, pagina.html, pagina.texto);
    }

    if (contactos.emails.size === 0 && contactos.telefonos.size === 0) {
      for (const ruta of RUTAS_CONTACTO_DIRECTAS) {
        const url = new URL(ruta, inicio.urlFinal ?? base).toString();
        if (visitadas.has(url.replace(/\/$/, ""))) continue;
        const pagina = await descargar(contexto, url);
        if (pagina.error) continue;
        paginasOk++;
        usoFirecrawl ||= Boolean(pagina.viaFirecrawl);
        procesarPagina(pagina.urlFinal ?? url, pagina.html, pagina.texto);
        if (contactos.emails.size > 0 || contactos.telefonos.size > 0) break;
      }
    }
  }

  const directivosUnicos = [...new Map(directivos.map((d) => [d.nombre, d])).values()].slice(0, 8);
  const enIngles = idiomas.length > 0 && idiomas.filter((i) => i === "en").length > idiomas.filter((i) => i === "es").length;

  return {
    dominio: semilla.dominio,
    referencia: semilla.referencia,
    sector_esperado: semilla.sector_esperado,
    region: semilla.region,
    ciudad_esperada: semilla.ciudad_esperada,
    fuente_descubrimiento: semilla.fuente_descubrimiento,
    sitio_web: inicio?.urlFinal ?? base,
    titulo: meta.titulo,
    descripcion: meta.meta_descripcion,
    idioma_detectado: enIngles ? "en" : "es",
    emails: [...contactos.emails],
    telefonos: [...contactos.telefonos],
    linkedin: contactos.linkedin,
    ciudad_detectada: contactos.ciudad_detectada,
    ciudad_confianza: contactos.ciudad_confianza,
    directivos: directivosUnicos,
    paginas_ok: paginasOk,
    uso_firecrawl: usoFirecrawl,
    evidencia: consolidarEvidencia(hallazgos),
    errores,
  };
}

const semillas = JSON.parse(fs.readFileSync(SEMILLAS, "utf8"));
const salida = [];

function guardar() {
  fs.writeFileSync(
    SALIDA,
    JSON.stringify(
      {
        generado: new Date().toISOString(),
        motor: "playwright + firecrawl (respaldo)",
        total: salida.length,
        firecrawl: { usos: firecrawlUsos, errores: firecrawlErrores, deshabilitado: firecrawlDeshabilitado },
        sitios: salida,
      },
      null,
      2
    ),
    "utf8"
  );
}

try {
  console.log(`Extrayendo ${semillas.length} sitios con Playwright (concurrencia ${CONCURRENCIA})...\n`);
  navegador = await chromium.launch({ headless: true });

  for (let i = 0; i < semillas.length; i += CONCURRENCIA) {
    const grupo = semillas.slice(i, i + CONCURRENCIA);
    const res = await Promise.all(
      grupo.map(async (s) => {
        const contexto = await navegador.newContext({
          userAgent: UA,
          locale: "es-CO",
          viewport: { width: 1366, height: 900 },
          ignoreHTTPSErrors: true,
        });
        try {
          return await procesarEmpresa(contexto, s);
        } catch (e) {
          return {
            dominio: s.dominio,
            referencia: s.referencia,
            sector_esperado: s.sector_esperado,
            ciudad_esperada: s.ciudad_esperada,
            paginas_ok: 0,
            evidencia: [],
            emails: [],
            telefonos: [],
            directivos: [],
            errores: [{ error: e.message.slice(0, 120) }],
          };
        } finally {
          await contexto.close().catch(() => {});
        }
      })
    );
    salida.push(...res);
    for (const r of res) {
      console.log(
        `${r.evidencia.length > 0 ? "OK " : "-- "} ${r.dominio.padEnd(30)} ${String(r.paginas_ok).padStart(2)} págs${r.uso_firecrawl ? " [fc]" : "    "} | ${r.evidencia.length} eq | ${r.emails.length} mail | ${r.telefonos.length} tel`
      );
    }
    guardar();
  }
} catch (e) {
  console.error("Error no controlado:", e.message);
} finally {
  await navegador?.close().catch(() => {});
  guardar();
  const conEvidencia = salida.filter((s) => s.evidencia.length > 0).length;
  const conEmail = salida.filter((s) => s.emails.length > 0).length;
  const conTel = salida.filter((s) => s.telefonos.length > 0).length;
  console.log(`\nGuardado en .tmp/evidencia_web.json`);
  console.log(`Sitios: ${salida.length} | con evidencia: ${conEvidencia} | con email: ${conEmail} | con teléfono: ${conTel}`);
  if (FIRECRAWL_API_KEY) console.log(`Firecrawl (respaldo): ${firecrawlUsos} páginas | ${firecrawlErrores} errores`);
}
