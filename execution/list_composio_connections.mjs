import "dotenv/config";
import { Composio } from "@composio/core";

if (!process.env.COMPOSIO_API_KEY) {
  console.error(
    "Falta COMPOSIO_API_KEY en .env. Obtenla en dashboard.composio.dev → Settings y agrégala al archivo .env antes de reintentar."
  );
  process.exit(1);
}

const composio = new Composio();
const { items } = await composio.connectedAccounts.list();

if (items.length === 0) {
  console.log("No hay conexiones en este proyecto de Composio.");
} else {
  console.log(`Conexiones encontradas: ${items.length}\n`);
  for (const account of items) {
    console.log(
      `- ${account.toolkit?.slug ?? "?"} | estado: ${account.status} | auth: ${account.authConfig?.authScheme ?? "?"} | alias: ${account.wordId ?? account.alias ?? "-"} | id: ${account.id}`
    );
  }
}
