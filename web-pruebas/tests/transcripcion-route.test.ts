import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatearTranscripcion } from 'agente-sales-agent';
import { hoyMexico } from '../lib/hoy';
import { POST, runtime } from '../app/api/transcripcion/route';
import { CLAVE, oportunidadBase, solicitud } from './fabrica';

vi.mock('../lib/hoy', () => ({ hoyMexico: vi.fn() }));

const URL_TRANSCRIPCION = 'http://localhost/api/transcripcion';
const GENERICO = 'Error interno, intenta de nuevo.';

let consola: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('CLAVE_PRUEBAS', CLAVE);
  vi.mocked(hoyMexico).mockReturnValue('2026-11-02');
  consola = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  consola.mockRestore();
});

async function llamar(cuerpo: unknown, opciones: Parameters<typeof solicitud>[1] = {}): Promise<{ estado: number; json: any }> {
  const r = await POST(solicitud(cuerpo, { url: URL_TRANSCRIPCION, ...opciones }));
  return { estado: r.status, json: await r.json() };
}

describe('configuración de la ruta', () => {
  it('corre en Node', () => {
    expect(runtime).toBe('nodejs');
  });
});

describe('acceso', () => {
  it('sin_cookie_401', async () => {
    const { estado, json } = await llamar({ oportunidad: oportunidadBase() }, { cookie: false });
    expect(estado).toBe(401);
    expect(json.error).toEqual(expect.any(String));
  });

  it('cookie de otra contraseña: 401', async () => {
    expect((await llamar({ oportunidad: oportunidadBase() }, { cookie: 'sa_acceso=abc123' })).estado).toBe(401);
  });

  it('sin CLAVE_PRUEBAS configurada nadie entra', async () => {
    vi.stubEnv('CLAVE_PRUEBAS', '');
    expect((await llamar({ oportunidad: oportunidadBase() })).estado).toBe(401);
  });
});

describe('solicitudes inválidas', () => {
  it('json_invalido_400', async () => {
    const { estado, json } = await llamar('{no es json');
    expect(estado).toBe(400);
    expect(json.error).toMatch(/JSON/);
  });

  it('un cuerpo que no es un objeto: 400', async () => {
    expect((await llamar([])).estado).toBe(400);
    expect((await llamar('null')).estado).toBe(400);
  });

  it('sin oportunidad: 400', async () => {
    const { estado, json } = await llamar({});
    expect(estado).toBe(400);
    expect(json.error).toMatch(/oportunidad/);
  });

  it('formato_viejo_400', async () => {
    const { estado, json } = await llamar({ oportunidad: { formato: 0 } });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/formato/);
  });

  it('expediente_corrupto_400', async () => {
    const op = structuredClone(oportunidadBase()) as any;
    op.expediente.etapaCRM = 'tres';
    const { estado, json } = await llamar({ oportunidad: op });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/expediente/);
  });

  it('cuerpo de más de 1 MB: 400 sin leerlo si content-length ya lo dice', async () => {
    const req = solicitud({ oportunidad: oportunidadBase() }, {
      url: URL_TRANSCRIPCION,
      encabezados: { 'content-length': String(1024 * 1024 + 1) },
    });
    const lector = vi.spyOn(req, 'text');
    const r = await POST(req);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/grande|1 MB/);
    expect(lector).not.toHaveBeenCalled();
  });

  it('cuerpo de más de 1 MB: 400 aunque content-length declare poco', async () => {
    const op = oportunidadBase();
    op.eventos.push({ tipo: 'dato', descripcion: 'x'.repeat(1024 * 1024 + 1), fecha: '2026-11-02' });
    const { estado, json } = await llamar({ oportunidad: op }, { encabezados: { 'content-length': '10' } });
    expect(estado).toBe(400);
    expect(json.error).toMatch(/grande|1 MB/);
  });
});

describe('transcripción', () => {
  it('devuelve el texto de formatearTranscripcion con el diagnóstico recalculado en el servidor', async () => {
    const op = oportunidadBase();
    op.sesionActual = {
      modo: 'calificar', inicio: '2026-11-02', turnosVendedor: 1, versionInstrucciones: 'v', historial: [],
      transcripcion: [
        { rol: 'agente', texto: 'Hola, ¿cómo va?', fecha: '2026-11-02' },
        { rol: 'vendedor', texto: 'Muy bien', fecha: '2026-11-02' },
      ],
    };
    // Un diagnóstico falso que manda el navegador no debe llegar al texto.
    op.ultimoDiagnostico = { indice: { total: 999, semaforo: 'verde', topado: false } } as never;
    const { estado, json } = await llamar({ oportunidad: op });
    expect(estado).toBe(200);
    expect(json.texto).toEqual(expect.stringContaining('Agente: Hola, ¿cómo va?'));
    expect(json.texto).toEqual(expect.stringContaining('Vendedor: Muy bien'));
    expect(json.texto).toEqual(expect.stringContaining('Último diagnóstico'));
    expect(json.texto).not.toContain('999');
    expect(json.texto).toEqual(expect.stringMatching(/Índice: \d+\/100/));
  });

  it('incluye sesiones pasadas aunque no traigan transcripción', async () => {
    const op = oportunidadBase();
    op.sesiones.push({ fecha: '2026-10-30', modo: 'calificar', resumen: 'Resumen viejo', versionInstrucciones: 'v' } as never);
    const { estado, json } = await llamar({ oportunidad: op });
    expect(estado).toBe(200);
    expect(json.texto).toEqual(expect.stringContaining('Resumen: Resumen viejo'));
  });

  it('500_generico: una excepción no filtra detalles', async () => {
    vi.mocked(hoyMexico).mockImplementation(() => {
      throw new Error('detalle interno secreto');
    });
    const { estado, json } = await llamar({ oportunidad: oportunidadBase() });
    expect(estado).toBe(500);
    expect(json).toEqual({ error: GENERICO });
    expect(JSON.stringify(json)).not.toContain('secreto');
  });

  it('el texto coincide con formatearTranscripcion sobre la oportunidad recalculada', async () => {
    const { json } = await llamar({ oportunidad: oportunidadBase() });
    expect(json.texto).toEqual(expect.stringContaining(formatearTranscripcion(oportunidadBase()).split('\n')[0] as string));
  });
});
