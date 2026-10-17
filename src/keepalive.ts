// Mantiene viva la sesión de .env: una lectura del portal reinicia el contador de inactividad del servidor.
import { SECCIONES, getHtml } from "./techpreneur";

const ahora = new Date().toISOString();
try {
  await getHtml(SECCIONES.inicio);
  console.log(`${ahora} sesión vigente`);
} catch (e) {
  console.error(`${ahora} ${(e as Error).message}`);
  process.exit(1);
}
