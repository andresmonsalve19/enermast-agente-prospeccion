// DEPRECADO (2026-09-01): el flujo de prospección ya no usa Apollo, por
// decisión explícita del usuario. Se conserva solo como referencia histórica
// — ver directives/prospectar_clientes.md. No forma parte del flujo activo
// (execution/scrapear_sitios.mjs + execution/generar_excel.mjs).
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Composio } from "@composio/core";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, ".tmp", "prospectos_apollo.json");
const SEMILLAS = path.join(RAIZ, "execution", "semillas_prospectos.json");

const LOTE = 10;
const PAUSA_LOTE_MS = 4000;
const PAUSA_VACANTES_MS = 1500;

if (!process.env.COMPOSIO_API_KEY) {
  console.error("Falta COMPOSIO_API_KEY en .env.");
  process.exit(1);
}
if (!process.env.APOLLO_USER_ID) {
  console.error("Falta APOLLO_USER_ID en .env (entity dueño de la conexión Apollo).");
  process.exit(1);
}

const composio = new Composio();
const userId = process.env.APOLLO_USER_ID;
const semillas = JSON.parse(fs.readFileSync(SEMILLAS, "utf8"));

// Reanudación: los créditos del plan free son escasos, así que no se vuelve a
// enriquecer un dominio que ya se resolvió en una corrida anterior.
const previo = fs.existsSync(SALIDA)
  ? JSON.parse(fs.readFileSync(SALIDA, "utf8"))
  : { resultados: [], diagnostico: [] };
const yaResueltos = new Map(
  previo.resultados.filter((r) => r.encontrado_en_apollo).map((r) => [r.dominio, r])
);

const resultados = [...yaResueltos.values()];
const diagnostico = [];
let abortarPorCuota = false;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function guardar() {
  fs.writeFileSync(
    SALIDA,
    JSON.stringify(
      { generado: new Date().toISOString(), total: resultados.length, resultados, diagnostico },
      null,
      2
    ),
    "utf8"
  );
}

async function ejecutar(slug, args) {
  const res = await composio.tools.execute(slug, {
    userId,
    arguments: args,
    dangerouslySkipVersionCheck: true,
  });
  if (!res.successful) {
    const msg = JSON.stringify(res.data ?? {});
    // 403 = límite de plan, no es transitorio: no reintentar.
    if (msg.includes("403") || msg.includes("master API key")) {
      throw Object.assign(new Error("PLAN_LIMITADO"), { detalle: msg });
    }
    if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      throw Object.assign(new Error("RATE_LIMIT"), { detalle: msg });
    }
    throw Object.assign(new Error("FALLO_TOOL"), { detalle: msg });
  }
  return res;
}

async function enriquecerLote(lote) {
  const dominios = lote.map((s) => s.dominio);
  try {
    const res = await ejecutar("APOLLO_BULK_ORGANIZATION_ENRICHMENT", { domains: dominios });
    return res.data?.organizations ?? [];
  } catch (e) {
    if (e.message === "RATE_LIMIT") {
      diagnostico.push({ etapa: "enriquecimiento", dominios, error: "rate limit, reintento único" });
      await dormir(65000);
      const res = await ejecutar("APOLLO_BULK_ORGANIZATION_ENRICHMENT", { domains: dominios });
      return res.data?.organizations ?? [];
    }
    throw e;
  }
}

try {
  const pendientes = semillas.filter((s) => !yaResueltos.has(s.dominio));
  console.log(
    `Semillas: ${semillas.length} | ya resueltas: ${yaResueltos.size} | pendientes: ${pendientes.length}\n`
  );

  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE);
    const num = Math.floor(i / LOTE) + 1;

    let organizaciones = [];
    try {
      organizaciones = await enriquecerLote(lote);
    } catch (e) {
      diagnostico.push({
        etapa: "enriquecimiento",
        lote: num,
        dominios: lote.map((s) => s.dominio),
        error: e.message,
        detalle: e.detalle?.slice(0, 300),
      });
      if (e.message === "PLAN_LIMITADO" || e.message === "RATE_LIMIT") {
        console.log(`\nLote ${num}: ${e.message}. Se conserva lo obtenido y se corta el enriquecimiento.`);
        abortarPorCuota = true;
        break;
      }
      console.log(`Lote ${num}: fallo (${e.message}), se continúa con el siguiente.`);
      continue;
    }

    // El bulk enrichment devuelve null en las posiciones sin match.
    const encontradas = organizaciones.filter(Boolean);
    const porDominio = new Map();
    for (const org of encontradas) {
      const clave = (org.primary_domain || org.website_url || "")
        .replace(/^https?:\/\/(www\.)?/, "")
        .replace(/\/$/, "");
      porDominio.set(clave.toLowerCase(), org);
    }

    for (const semilla of lote) {
      const org =
        porDominio.get(semilla.dominio.toLowerCase()) ??
        encontradas.find((o) =>
          (o.primary_domain || "").toLowerCase().includes(semilla.dominio.split(".")[0].toLowerCase())
        );

      if (!org) {
        resultados.push({ ...semilla, encontrado_en_apollo: false });
        continue;
      }

      resultados.push({
        ...semilla,
        encontrado_en_apollo: true,
        apollo_id: org.id,
        nombre: org.name,
        sitio_web: org.website_url,
        linkedin: org.linkedin_url,
        telefono: org.phone,
        ciudad: org.city,
        departamento: org.state,
        pais: org.country,
        direccion: org.raw_address ?? org.street_address,
        industria: org.industry,
        industrias: org.industries,
        industrias_secundarias: org.secondary_industries,
        empleados: org.estimated_num_employees,
        ingresos: org.annual_revenue_printed ?? org.organization_revenue_printed,
        fundada: org.founded_year,
        descripcion: org.short_description,
        keywords: org.keywords,
        tecnologias: org.technology_names,
        headcount_departamentos: org.departmental_head_count,
        num_suborganizaciones: org.num_suborganizations,
        crecimiento_headcount_12m: org.organization_headcount_twelve_month_growth,
        sic_codes: org.sic_codes,
        naics_codes: org.naics_codes,
      });
    }

    console.log(
      `Lote ${num}/${Math.ceil(pendientes.length / LOTE)}: ${encontradas.length}/${lote.length} encontradas en Apollo`
    );
    guardar();
    await dormir(PAUSA_LOTE_MS);
  }

  if (!abortarPorCuota) {
    const conId = resultados.filter((r) => r.apollo_id && r.vacantes_total === undefined);
    console.log(`\nDescargando vacantes de ${conId.length} empresas (señal de compra)...`);

    for (const [idx, prospecto] of conId.entries()) {
      try {
        const res = await ejecutar("APOLLO_GET_ORGANIZATION_JOB_POSTINGS", {
          organization_id: prospecto.apollo_id,
        });
        const vacantes = res.data?.organization_job_postings ?? [];
        prospecto.vacantes_total = vacantes.length;
        prospecto.vacantes = vacantes.slice(0, 40).map((v) => ({
          titulo: v.title,
          ciudad: v.city,
          pais: v.country,
          publicada: v.posted_at,
          url: v.url,
        }));
      } catch (e) {
        prospecto.vacantes_total = null;
        diagnostico.push({
          etapa: "vacantes",
          empresa: prospecto.nombre ?? prospecto.dominio,
          error: e.message,
          detalle: e.detalle?.slice(0, 200),
        });
        if (e.message === "PLAN_LIMITADO" || e.message === "RATE_LIMIT") {
          console.log(`\n${e.message} en vacantes. Se conserva lo obtenido y se corta esta etapa.`);
          break;
        }
      }

      if ((idx + 1) % 10 === 0) {
        console.log(`  vacantes: ${idx + 1}/${conId.length}`);
        guardar();
      }
      await dormir(PAUSA_VACANTES_MS);
    }
  }
} catch (e) {
  diagnostico.push({ etapa: "general", error: e.message, detalle: String(e.stack).slice(0, 500) });
  console.error("\nError no controlado:", e.message);
} finally {
  guardar();
  const ok = resultados.filter((r) => r.encontrado_en_apollo).length;
  console.log(`\nGuardado en .tmp/prospectos_apollo.json`);
  console.log(`Empresas procesadas: ${resultados.length} | encontradas en Apollo: ${ok} | incidencias: ${diagnostico.length}`);
}
