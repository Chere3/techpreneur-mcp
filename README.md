# techpreneur-mcp

**Maneja el Portal de Equipo de Techpreneur desde Claude.** Un servidor MCP para preguntar «¿qué entregables nos faltan y cuándo vencen?», reservar una mentoría o subir un PDF sin abrir el portal.

![Bun](https://img.shields.io/badge/runtime-Bun-black) ![MCP](https://img.shields.io/badge/protocolo-MCP-1C6E78) ![Licencia MIT](https://img.shields.io/badge/licencia-MIT-D1402E) ![No oficial](https://img.shields.io/badge/proyecto-no%20oficial-lightgrey)

[Techpreneur](https://techpreneur.app) es la plataforma donde corren programas de incubación como ITESALUD 2026. El portal no tiene API: es PHP con formularios. Este servidor lee esas páginas y envía los mismos formularios que enviarías tú, con tu propia sesión.

> Proyecto no oficial, hecho por un participante del programa. No está afiliado a Techpreneur ni a Health IDS.

## Qué puedes pedirle

- «¿Qué sesiones hay esta semana y cuál es el enlace de Zoom?»
- «¿Qué entregables están pendientes y cuándo vencen?»
- «Busca horarios libres con un mentor de regulación para el miércoles.»
- «Sube `entregable-semana-1.pdf` al entregable Post Sesión de la Semana 1.»
- «Descarga la plantilla de presentación a mi carpeta de Descargas.»

## Instalación

Necesitas [Bun](https://bun.sh) y una cuenta en el portal.

```sh
git clone https://github.com/Chere3/techpreneur-mcp.git
cd techpreneur-mcp
bun install
cp .env.example .env
```

### 1. Pon tu sesión

El login tiene CAPTCHA (Cloudflare Turnstile), así que el servidor no inicia sesión por ti: usa la cookie de una sesión que abras a mano.

1. Inicia sesión en `https://techpreneur.app/login.php`.
2. Abre DevTools → Application → Cookies y copia el valor de `PHPSESSID`.
3. Con el valor en el portapapeles (macOS):

```sh
printf 'TECHPRENEUR_SESSION=%s\n' "$(pbpaste)" > .env
```

El `.env` se lee en cada petición. Cuando la sesión caduque, las tools te lo dicen y basta con repetir estos pasos, sin reiniciar nada.

### 2. Prueba que funciona

```sh
bun run test   # recorre todas las secciones en solo lectura
```

### 3. Conéctalo

Claude Code:

```sh
claude mcp add techpreneur -s user -- bun run "$PWD/src/index.ts"
```

Claude Desktop u otro cliente MCP (`mcpServers` en su configuración):

```json
{
  "techpreneur": {
    "command": "bun",
    "args": ["run", "/ruta/a/techpreneur-mcp/src/index.ts"]
  }
}
```

## Tools

### Lectura

| Tool | Qué hace |
|---|---|
| `techpreneur_ver` | Lee una sección como texto: `inicio`, `sesiones`, `entregables`, `mentoria`, `mentores`, `documentos`, `equipo`, `perfil`, `dataroom`, `demoday`, `certificado`. |
| `techpreneur_horarios_mentoria` | Horarios libres de mentoría por mentor, con su `slot_id`. |
| `techpreneur_calendario_ics` | Calendario de sesiones en ICS. |
| `techpreneur_descargar` | Baja un archivo del portal a una carpeta local. |

Cada lectura anota las acciones posibles como `⟦tool campo=valor⟧`, con los ids que pide la tool de escritura correspondiente. Por ejemplo, en `sesiones`:

```
Masterclass
Semana 1: Masterclass
12 Oct 2026 · 18:00–20:00
⟦techpreneur_firmar_asistencia sesion_id=13⟧
```

### Escritura

Cada una es el POST de un formulario del portal y devuelve el aviso de éxito o error que muestra la página.

| Tool | Endpoint | Probada |
|---|---|---|
| `techpreneur_firmar_asistencia` | `/equipo/asistencia_firmar.php` | Sí |
| `techpreneur_subir_entregable` | `/equipo/entregable_subir.php` | Sí |
| `techpreneur_subir_entregable_sesion` | `/equipo/entregable_sesion_subir.php` | Sí |
| `techpreneur_evaluar_sesion` | `/equipo/sesion_evaluar.php` | No |
| `techpreneur_reservar_mentoria` | `/equipo/mentoria_reservar.php` | No |
| `techpreneur_solicitar_sesion_mentor` | `/equipo/solicitar_sesion_mentor.php` | No |
| `techpreneur_enviar_mensaje_mentor` | `/equipo/sesion_mensaje_enviar.php` | No |
| `techpreneur_invitar_integrante` | `/equipo/integrante_invitar.php` | No |
| `techpreneur_quitar_integrante` | `/equipo/integrante_eliminar.php` | No |
| `techpreneur_guardar_perfil` | `/equipo/perfil_guardar.php` | No |
| `techpreneur_dataroom_agregar` | `/equipo/dataroom_subir.php` | No |
| `techpreneur_subir_pitch_deck` | `/equipo/pitch_deck_subir.php` | No |
| `techpreneur_regenerar_enlace_calendario` | `/regenerar_ics_token.php` | No |

Las que dicen «No» usan los nombres de campo de los formularios reales, pero nadie las ha ejecutado contra el portal. Si pruebas una, cuéntalo en un issue.

## Cosas que conviene saber

- **La firma de asistencia es una declaración tuya.** El portal dice: «declaras bajo tu responsabilidad que tú y/o tu equipo asistieron». La tool pide un PNG con tu firma (el portal usa un lienzo de 400×150) y firma una sesión a la vez. Úsala solo para sesiones a las que sí fuiste.
- **Subir el entregable de una sesión también lo agrega a tu Data Room.** Lo hace el portal, no el servidor.
- **Tu cookie es tu sesión.** Quien la tenga entra al portal como tú. Vive en `.env`, que está fuera de git; no la pegues en chats ni en issues.
- **Las lecturas son texto, no JSON.** El HTML del portal no tiene clases ni ids con significado, así que un parser por campos se rompería con cualquier cambio de diseño. Solo los horarios de mentoría van estructurados.
- **Fuera del servidor por ahora:** «Invitar inversionista» del Data Room y la agenda de Speed Dating (el portal aún no muestra esos formularios).

## Cómo funciona

Tres archivos en `src/`:

- `techpreneur.ts`: el cliente. Manda la cookie, detecta la sesión caducada (redirección a `login.php`), convierte el `<main>` de cada página en texto y envía formularios con su `csrf_token`, que es uno por sesión.
- `index.ts`: registra las tools MCP.
- `smoke.ts`: la prueba de solo lectura.

## Contribuir

Los issues y pull requests son bienvenidos, sobre todo:

- Si tu programa en Techpreneur muestra secciones o formularios que aquí no aparecen.
- Si probaste una tool de escritura marcada como «No».
- Si el portal cambió y algo dejó de leerse bien.

Si te sirvió, una estrella ayuda a que otros equipos del programa lo encuentren.

## Licencia

[MIT](LICENSE)
