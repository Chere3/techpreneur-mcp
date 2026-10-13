import { parse, type HTMLElement, type Node } from "node-html-parser";

export const BASE = "https://techpreneur.app";
const ENV_FILE = `${import.meta.dir}/../.env`;

/** Secciones de lectura del Portal de Equipo. */
export const SECCIONES = {
  inicio: "/equipo/dashboard.php",
  sesiones: "/equipo/sesiones.php",
  entregables: "/equipo/entregables.php",
  mentoria: "/equipo/mentoria.php",
  mentores: "/equipo/directorio_mentores.php",
  documentos: "/equipo/documentos_cohorte.php",
  equipo: "/equipo/integrantes.php",
  perfil: "/equipo/perfil.php",
  dataroom: "/equipo/dataroom.php",
  demoday: "/equipo/demoday.php",
  certificado: "/equipo/certificado.php",
} as const;
export type Seccion = keyof typeof SECCIONES;

/** Endpoint de cada formulario → tool que lo ejecuta (para anotar las lecturas). */
const TOOL_DE: Record<string, string> = {
  "sesion_evaluar.php": "techpreneur_evaluar_sesion",
  "entregable_sesion_subir.php": "techpreneur_subir_entregable_sesion",
  "entregable_subir.php": "techpreneur_subir_entregable",
  "solicitar_sesion_mentor.php": "techpreneur_solicitar_sesion_mentor",
  "sesion_mensaje_enviar.php": "techpreneur_enviar_mensaje_mentor",
  "mentoria_reservar.php": "techpreneur_reservar_mentoria",
  "integrante_invitar.php": "techpreneur_invitar_integrante",
  "integrante_eliminar.php": "techpreneur_quitar_integrante",
  "perfil_guardar.php": "techpreneur_guardar_perfil",
  "dataroom_subir.php": "techpreneur_dataroom_agregar",
  "pitch_deck_subir.php": "techpreneur_subir_pitch_deck",
  "regenerar_ics_token.php": "techpreneur_regenerar_enlace_calendario",
};

export class SesionCaducada extends Error {
  constructor() {
    super(
      `La sesión de Techpreneur no es válida o caducó. Inicia sesión en ${BASE}/login.php, copia el valor de la cookie PHPSESSID (DevTools → Application → Cookies) y ponlo en ${ENV_FILE} como TECHPRENEUR_SESSION=...`,
    );
  }
}

/** Lee la cookie en cada petición, así se puede renovar sin reiniciar el servidor. */
async function cookie(): Promise<string> {
  let v = process.env.TECHPRENEUR_SESSION ?? "";
  const f = Bun.file(ENV_FILE);
  if (await f.exists()) v = (await f.text()).match(/^TECHPRENEUR_SESSION=(.*)$/m)?.[1] ?? v;
  v = v.trim().replace(/^["']|["']$/g, "").replace(/^PHPSESSID=/, "");
  if (!v) throw new SesionCaducada();
  return `PHPSESSID=${v}`;
}

const abs = (href: string) => new URL(href, BASE).toString();

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(abs(path), {
    ...init,
    redirect: "manual",
    headers: { ...init.headers, Cookie: await cookie(), "User-Agent": "Mozilla/5.0 techpreneur-mcp" },
  });
  if ((res.headers.get("location") ?? "").includes("login.php")) throw new SesionCaducada();
  return res;
}

export async function getHtml(path: string): Promise<string> {
  const res = await request(path);
  if (res.status >= 300) throw new Error(`GET ${path} respondió ${res.status} → ${res.headers.get("location") ?? ""}`);
  return res.text();
}

const SKIP = new Set(["script", "style", "svg", "canvas", "nav", "option", "select", "input", "textarea"]);
const BLOCK = new Set(["div", "p", "section", "li", "ul", "ol", "details", "summary", "table", "tr", "main", "article", "label"]);

function formulario(f: HTMLElement): string {
  const endpoint = (f.getAttribute("action") ?? "").split("/").pop() ?? "";
  const campos = f
    .querySelectorAll("input, textarea, select")
    .filter((e) => e.getAttribute("name") && e.getAttribute("name") !== "csrf_token")
    .map((e) => {
      const name = e.getAttribute("name")!;
      if (e.getAttribute("type") === "hidden") return `${name}=${e.getAttribute("value") ?? ""}`;
      if (e.tagName === "SELECT") return `${name}:[${e.querySelectorAll("option").map((o) => o.getAttribute("value")).join("|")}]`;
      const actual = (e.tagName === "TEXTAREA" ? e.text : (e.getAttribute("value") ?? "")).trim();
      return `${name}:${e.tagName === "TEXTAREA" ? "texto" : (e.getAttribute("type") ?? "text")}${actual ? `=${JSON.stringify(actual)}` : ""}`;
    });
  return `\n⟦${TOOL_DE[endpoint] ?? `POST ${endpoint}`} ${campos.join(" ")}⟧\n`;
}

function walk(n: Node, out: string[]) {
  if (n.nodeType === 3) return void out.push(n.text);
  const el = n as HTMLElement;
  const tag = el.tagName?.toLowerCase();
  if (!tag || SKIP.has(tag) || el.id === "modal-firma") return;
  if (tag === "br") return void out.push("\n");
  if (tag === "form") return void out.push(formulario(el));
  if (/^h[1-4]$/.test(tag)) return void out.push(`\n\n${"#".repeat(Number(tag[1]))} ${el.text.trim()}\n`);
  if (tag === "a") return void out.push(` [${el.text.trim()}](${abs(el.getAttribute("href") ?? "")}) `);
  if (tag === "img") return void out.push(el.getAttribute("src")?.includes("firma_ver") ? " (firma registrada) " : "");
  if (tag === "button") {
    const firma = el.getAttribute("onclick")?.match(/abrirFirma\((\d+)/);
    return void out.push(firma ? `\n⟦techpreneur_firmar_asistencia sesion_id=${firma[1]}⟧\n` : "");
  }
  if (BLOCK.has(tag)) out.push("\n");
  for (const c of el.childNodes) walk(c, out);
  out.push(BLOCK.has(tag) ? "\n" : " ");
}

/** Convierte el <main> de una página del portal en texto compacto, con los formularios anotados como ⟦tool campo=valor⟧. */
export function outline(html: string): string {
  const root = parse(html);
  const out: string[] = [];
  walk(root.querySelector("main") ?? root.querySelector("body") ?? root, out);
  return out
    .join("")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export const ver = async (s: Seccion) => outline(await getHtml(SECCIONES[s]));

export interface MentorSlots {
  mentor: string;
  especialidad: string;
  slots: { slot_id: number; horario: string }[];
}

/** Horarios libres de mentoría, agrupados por mentor. */
export async function horarios(mentor?: string): Promise<MentorSlots[]> {
  const root = parse(await getHtml("/equipo/reservar_mentoria.php"));
  const all = root.querySelectorAll("main section").map((s) => {
    const divs = s.querySelectorAll(":scope > *");
    return {
      mentor: divs[0]?.text.trim() ?? "",
      especialidad: divs[1]?.text.trim() ?? "",
      slots: s.querySelectorAll("form").map((f) => ({
        slot_id: Number(f.querySelector("input[name=slot_id]")?.getAttribute("value")),
        horario: f.querySelector("button")?.text.replace(/\s+/g, " ").trim() ?? "",
      })),
    };
  });
  const q = mentor?.toLowerCase();
  return q ? all.filter((m) => m.mentor.toLowerCase().includes(q)) : all;
}

export type Campo = string | number | { archivo: string };

/** Envía un formulario del portal: toma el csrf_token vigente, hace el POST y devuelve la página a la que redirige. */
export async function enviar(endpoint: string, campos: Record<string, Campo | undefined>) {
  const token = parse(await getHtml(SECCIONES.perfil)).querySelector("input[name=csrf_token]")?.getAttribute("value");
  if (!token) throw new Error("No se encontró csrf_token en el portal");
  const body = new FormData();
  body.set("csrf_token", token);
  let multipart = false;
  for (const [k, v] of Object.entries(campos)) {
    if (v === undefined) continue;
    if (typeof v === "object") {
      const f = Bun.file(v.archivo);
      if (!(await f.exists())) throw new Error(`No existe el archivo ${v.archivo}`);
      body.set(k, f, v.archivo.split("/").pop());
      multipart = true;
    } else body.set(k, String(v));
  }
  const res = await request(endpoint, {
    method: "POST",
    body: multipart ? body : new URLSearchParams(body as unknown as Record<string, string>),
  });
  const destino = res.headers.get("location");
  const pagina = destino ? await getHtml(destino) : await res.text();
  return { status: res.status, redirige_a: destino, pagina: outline(pagina).slice(0, 1500) };
}

/** Descarga un archivo del portal (/descargar.php?tipo=&id=) a una carpeta local. */
export async function descargar(tipo: string, id: number, carpeta: string) {
  const res = await request(`/descargar.php?tipo=${encodeURIComponent(tipo)}&id=${id}`);
  const destino = res.headers.get("location");
  if (destino) return { enlace_externo: abs(destino) };
  if (!res.ok) throw new Error(`descargar.php respondió ${res.status}`);
  const cd = res.headers.get("content-disposition") ?? "";
  const nombre = decodeURIComponent(cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ?? cd.match(/filename="?([^";]+)/i)?.[1] ?? `${tipo}-${id}`);
  const ruta = `${carpeta.replace(/\/$/, "")}/${nombre.replace(/\//g, "_")}`;
  const bytes = await Bun.write(ruta, res);
  return { ruta, bytes, tipo: res.headers.get("content-type") };
}

/** Calendario de sesiones en formato ICS. */
export async function calendarioIcs(): Promise<string> {
  const res = await request("/equipo/calendario_ics.php");
  const destino = res.headers.get("location");
  return destino ? `Enlace de suscripción: ${abs(destino)}` : res.text();
}
