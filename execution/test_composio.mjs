import "dotenv/config";
import { Composio } from "@composio/core";

const existingUserId = process.env.COMPOSIO_TEST_USER_ID || "test_user";

if (!process.env.COMPOSIO_API_KEY) {
  console.error(
    "Falta COMPOSIO_API_KEY en .env. Obtenla en dashboard.composio.dev → Settings y agrégala al archivo .env antes de reintentar."
  );
  process.exit(1);
}

const composio = new Composio();
const session = await composio.create(existingUserId);
const tools = await session.tools();

console.log(`Sesión creada para el usuario "${existingUserId}".`);
console.log(`Herramientas disponibles: ${tools.length}`);
console.log(
  tools.slice(0, 10).map((tool) => tool.function?.name ?? tool.name)
);
