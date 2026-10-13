#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SECCIONES, ver, horarios, enviar, descargar, calendarioIcs, type Campo, type Seccion } from "./techpreneur";

const server = new McpServer({ name: "techpreneur-mcp", version: "0.1.0" });

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const json = (data: unknown) => text(JSON.stringify(data, null, 2));
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }] });
const safe = <A>(fn: (a: A) => Promise<ReturnType<typeof text>>) => async (a: A) => {
  try {
    return await fn(a);
  } catch (e) {
    return fail(e);
  }
};

const id = (d: string) => z.number().int().positive().describe(d);
const archivo = (d: string) => z.string().describe(`Ruta absoluta local del archivo. ${d}`);

server.registerTool(
  "techpreneur_ver",
  {
    title: "Leer una sección del Portal de Equipo",
    description:
      "Devuelve el contenido de una sección del portal Techpreneur (Programa ITESALUD) como texto. Las acciones disponibles aparecen anotadas como ⟦tool campo=valor⟧ con los ids que necesita cada tool de escritura. Secciones: inicio (asistencia, entregables aprobados, estatus), sesiones (calendario, enlaces de Zoom, grabaciones, material, asistencia y evaluación), entregables (los 13 semanales con su estado), mentoria (mentor asignado y sesiones reservadas), mentores (directorio de mentores y ponentes), documentos, equipo (integrantes), perfil, dataroom, demoday, certificado.",
    inputSchema: { seccion: z.enum(Object.keys(SECCIONES) as [Seccion, ...Seccion[]]) },
  },
  safe(async ({ seccion }) => text(await ver(seccion))),
);

server.registerTool(
  "techpreneur_horarios_mentoria",
  {
    title: "Horarios libres de mentoría",
    description: "Lista los horarios libres para reservar mentoría 1:1, agrupados por mentor, con el slot_id que pide techpreneur_reservar_mentoria.",
    inputSchema: { mentor: z.string().optional().describe("Filtra por nombre del mentor (coincidencia parcial)") },
  },
  safe(async ({ mentor }) => json(await horarios(mentor))),
);

server.registerTool(
  "techpreneur_calendario_ics",
  {
    title: "Calendario de sesiones (ICS)",
    description: "Devuelve el calendario de sesiones del programa en formato ICS.",
    inputSchema: {},
  },
  safe(async () => text(await calendarioIcs())),
);

server.registerTool(
  "techpreneur_descargar",
  {
    title: "Descargar un archivo del portal",
    description: "Descarga un archivo del portal a una carpeta local. El tipo y el id salen de los enlaces descargar.php que devuelve techpreneur_ver.",
    inputSchema: {
      tipo: z.string().describe("Valor de «tipo» en el enlace: documento_cohorte, entregable, …"),
      id: id("Valor de «id» en el enlace"),
      carpeta: z.string().describe("Carpeta local de destino (ruta absoluta)"),
    },
  },
  safe(async ({ tipo, id, carpeta }) => json(await descargar(tipo, id, carpeta))),
);

/** Registra una tool de escritura: un POST a un formulario del portal. */
function accion<S extends z.ZodRawShape>(
  name: string,
  title: string,
  description: string,
  inputSchema: S,
  endpoint: string,
  campos: (a: z.objectOutputType<S, z.ZodTypeAny>) => Record<string, Campo | undefined> | Promise<Record<string, Campo | undefined>>,
) {
  server.registerTool(
    name,
    { title, description: `${description} Modifica datos del equipo en el portal.`, inputSchema },
    safe(async (a: any) => json(await enviar(endpoint, await campos(a)))) as any,
  );
}

accion(
  "techpreneur_firmar_asistencia",
  "Certificar y firmar asistencia",
  "Firma la asistencia del equipo a una sesión. Es una declaración bajo responsabilidad de quien firma: úsala solo cuando el usuario confirme que asistieron y con su propia firma. Una sesión a la vez.",
  {
    sesion_id: id("Id de la sesión (aparece como ⟦techpreneur_firmar_asistencia sesion_id=…⟧ en la sección sesiones)"),
    firma_png: archivo("PNG con la firma manuscrita del usuario (el portal usa un lienzo de 400×150)."),
  },
  "/equipo/asistencia_firmar.php",
  async ({ sesion_id, firma_png }) => {
    const f = Bun.file(firma_png);
    if (!(await f.exists())) throw new Error(`No existe el archivo ${firma_png}`);
    return { sesion_id, firma_data: `data:image/png;base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}` };
  },
);

accion(
  "techpreneur_evaluar_sesion",
  "Evaluar una sesión",
  "Envía o actualiza la evaluación de una sesión a la que ya se firmó asistencia.",
  {
    sesion_id: id("Id de la sesión"),
    calificacion: z.number().int().min(1).max(5).describe("Estrellas, de 1 a 5"),
    nps: z.number().int().min(0).max(10).describe("Qué tanto la recomendarías, de 0 a 10"),
    comentarios: z.string().optional(),
  },
  "/equipo/sesion_evaluar.php",
  (a) => a,
);

accion(
  "techpreneur_subir_entregable",
  "Subir un entregable semanal",
  "Sube (o reemplaza) el archivo de uno de los entregables semanales.",
  {
    entregable_plantilla_id: id("Id del entregable (sección entregables)"),
    archivo: archivo("PDF, PPT, DOC o XLS."),
  },
  "/equipo/entregable_subir.php",
  ({ entregable_plantilla_id, archivo }) => ({ entregable_plantilla_id, archivo: { archivo } }),
);

accion(
  "techpreneur_subir_entregable_sesion",
  "Subir el entregable de una sesión",
  "Sube el entregable ligado a una sesión del calendario.",
  { sesion_id: id("Id de la sesión (sección sesiones)"), archivo: archivo("PDF, PPT, DOC o XLS.") },
  "/equipo/entregable_sesion_subir.php",
  ({ sesion_id, archivo }) => ({ sesion_id, archivo: { archivo } }),
);

accion(
  "techpreneur_reservar_mentoria",
  "Reservar una mentoría 1:1",
  "Reserva un horario libre con un mentor.",
  { slot_id: id("Id del horario (techpreneur_horarios_mentoria)") },
  "/equipo/mentoria_reservar.php",
  (a) => a,
);

accion(
  "techpreneur_solicitar_sesion_mentor",
  "Solicitar sesión al mentor asignado",
  "Envía una solicitud de sesión al mentor asignado del equipo.",
  { mentor_id: id("Id del mentor (sección mentoria)"), mensaje: z.string().min(1).describe("Sobre qué quieren la sesión") },
  "/equipo/solicitar_sesion_mentor.php",
  (a) => a,
);

accion(
  "techpreneur_enviar_mensaje_mentor",
  "Mensaje al mentor de una sesión",
  "Envía un mensaje al mentor dentro de una sesión de mentoría reservada.",
  { sesion_id: id("Id de la sesión de mentoría (sección mentoria)"), mensaje: z.string().min(1) },
  "/equipo/sesion_mensaje_enviar.php",
  (a) => a,
);

accion(
  "techpreneur_invitar_integrante",
  "Invitar integrante al equipo",
  "Invita por correo a una persona al equipo.",
  { nombre: z.string().min(1), email: z.string().email(), rol: z.string().optional(), bio: z.string().optional() },
  "/equipo/integrante_invitar.php",
  (a) => a,
);

accion(
  "techpreneur_quitar_integrante",
  "Quitar integrante del equipo",
  "Quita a un integrante del equipo.",
  { integrante_id: id("Id del integrante (sección equipo)") },
  "/equipo/integrante_eliminar.php",
  (a) => a,
);

accion(
  "techpreneur_guardar_perfil",
  "Guardar mi perfil",
  "Actualiza el perfil propio. El formulario se envía completo: pasa también los campos que no cambian.",
  {
    linkedin_url: z.string().url().optional(),
    bio: z.string().optional(),
    foto: archivo("Imagen de perfil.").optional(),
  },
  "/equipo/perfil_guardar.php",
  ({ linkedin_url, bio, foto }) => ({ linkedin_url, bio, foto: foto ? { archivo: foto } : undefined }),
);

accion(
  "techpreneur_dataroom_agregar",
  "Agregar documento al Data Room",
  "Agrega un documento al Data Room, como archivo o como enlace externo.",
  {
    nombre: z.string().min(1),
    categoria: z.enum(["legal", "financiero", "pi", "pitch", "tecnico", "sesion", "otro"]),
    visibilidad: z.enum(["interno", "compartible"]).describe("interno: solo el comité; compartible: puede enviarse a inversionistas"),
    archivo: archivo("PDF, PPT, DOC o XLS.").optional(),
    enlace_externo: z.string().url().optional().describe("Alternativa al archivo: enlace de Drive, OneDrive, etc."),
  },
  "/equipo/dataroom_subir.php",
  ({ archivo, ...resto }) => ({ ...resto, archivo: archivo ? { archivo } : undefined }),
);

accion(
  "techpreneur_subir_pitch_deck",
  "Subir versión del pitch deck",
  "Sube una nueva versión del pitch deck para el Demo Day; queda como la versión final vigente.",
  { archivo: archivo("PDF o PPT.") },
  "/equipo/pitch_deck_subir.php",
  ({ archivo }) => ({ archivo: { archivo } }),
);

accion(
  "techpreneur_regenerar_enlace_calendario",
  "Regenerar enlace del calendario",
  "Regenera el enlace privado de suscripción al calendario (ICS). El enlace anterior deja de funcionar.",
  {},
  "/regenerar_ics_token.php",
  () => ({ volver: "/equipo/sesiones.php" }),
);

await server.connect(new StdioServerTransport());
