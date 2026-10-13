// Prueba de humo de solo lectura: recorre todas las secciones con la sesión de .env.
import { SECCIONES, ver, horarios, calendarioIcs, type Seccion } from "./techpreneur";

for (const s of Object.keys(SECCIONES) as Seccion[]) {
  const t = await ver(s);
  console.log(`\n===== ${s} (${t.length} caracteres) =====\n${t.slice(0, 600)}`);
}
const h = await horarios();
console.log(`\n===== horarios: ${h.length} mentores, ${h.reduce((n, m) => n + m.slots.length, 0)} slots =====`);
console.log(JSON.stringify(h[0], null, 2).slice(0, 400));
console.log(`\n===== calendario_ics =====\n${(await calendarioIcs()).slice(0, 300)}`);
