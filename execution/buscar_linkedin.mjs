// Intenta confirmar perfiles reales de LinkedIn por empresa + cargo objetivo
// usando DuckDuckGo (HTML, sin JS). LIMITACIÓN MEDIDA el 2026-09-01: DDG
// empieza a bloquear (respuesta "anomaly detection") después de la PRIMERA
// consulta exitosa, incluso con pausas de 8s. Por eso este script:
//   - hace una sola consulta por empresa (no por cargo, para minimizar volumen)
//   - detecta el bloqueo y corta inmediatamente sin reintentar
//   - conserva lo que haya encontrado antes de cortar
// Es un mecanismo de "mejor esfuerzo", no una fuente confiable a escala.
// Ver directives/prospectar_clientes.md para la política de uso.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(RAIZ, ".tmp", "evidencia_web.json");
const SALIDA = path.join(RAIZ, ".tmp", "contactos_linkedin.json");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const PAUSA_MS = 12000;
const CARGOS_QUERY = "(mantenimiento OR planta OR confiabilidad OR operaciones OR compras)";

function esBloqueo(html) {
  return html.length < 16000 && /anomaly\.js|unusual traffic|are you a robot/i.test(html);
}

async function buscarPerfil(nombreEmpresa) {
  const q = `site:linkedin.com/in "${nombreEmpresa}" ${CARGOS_QUERY}`;
  const res = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q), {
    headers: { "User-Agent": UA, "Accept-Language": "es-CO,es;q=0.9" },
  });
  const html = await res.text();
  if (esBloqueo(html)) return { bloqueado: true, perfiles: [] };

  const bloques = html.split('<div class="result results_links').slice(1);
  const perfiles = [];
  for (const b of bloques.slice(0, 6)) {
    const url = b.match(/href="([^"]*linkedin\.com\/in\/[^"]+)"/i)?.[1];
    if (!url) continue;
    const titulo = b.match(/result__a[^>]*>([\s\S]*?)<\/a>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    const snippet = b.match(/result__snippet[^>]*>([\s\S]*?)<\/a>/i)?.[1]?.replace(/<[^>]+>/g, "").trim();
    // Confianza: el nombre de la empresa debe aparecer en el título o snippet
    // del propio resultado, no solo haber sido parte de la query.
    const mencionaEmpresa = new RegExp(nombreEmpresa.split(" ")[0], "i").test(`${titulo} ${snippet}`);
    perfiles.push({ url: url.split("&")[0], titulo, snippet, confianza: mencionaEmpresa ? "media" : "baja" });
  }
  return { bloqueado: false, perfiles };
}

const datosWeb = JSON.parse(fs.readFileSync(WEB, "utf8"));
const resultados = [];
let bloqueadoGlobal = false;

function guardar() {
  fs.writeFileSync(
    SALIDA,
    JSON.stringify(
      { generado: new Date().toISOString(), bloqueado_por_ddg: bloqueadoGlobal, total: resultados.length, resultados },
      null,
      2
    ),
    "utf8"
  );
}

try {
  console.log(`Intentando confirmar perfiles de LinkedIn para ${datosWeb.sitios.length} empresas (mejor esfuerzo)...\n`);
  for (const sitio of datosWeb.sitios) {
    const nombre = sitio.referencia;
    try {
      const { bloqueado, perfiles } = await buscarPerfil(nombre);
      if (bloqueado) {
        console.log(`DuckDuckGo bloqueó la búsqueda en "${nombre}". Se corta aquí; se conserva lo ya encontrado.`);
        bloqueadoGlobal = true;
        break;
      }
      resultados.push({ dominio: sitio.dominio, referencia: nombre, perfiles });
      console.log(`${perfiles.length > 0 ? "OK " : "-- "} ${nombre.padEnd(30)} ${perfiles.length} posibles perfiles`);
    } catch (e) {
      resultados.push({ dominio: sitio.dominio, referencia: nombre, perfiles: [], error: e.message });
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
} finally {
  guardar();
  const conPerfil = resultados.filter((r) => r.perfiles?.length > 0).length;
  console.log(`\nGuardado en .tmp/contactos_linkedin.json`);
  console.log(`Empresas intentadas: ${resultados.length}/${datosWeb.sitios.length} | con posible perfil: ${conPerfil}`);
  if (bloqueadoGlobal) {
    console.log("Bloqueado por DuckDuckGo antes de cubrir todas las empresas — comportamiento esperado y documentado.");
  }
}
