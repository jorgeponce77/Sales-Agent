import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ESCENARIOS } from 'agente-sales-agent';
import Laboratorio from '../components/Laboratorio';
import type { EscenarioVista } from '../components/Laboratorio';
import { tieneAcceso } from '../lib/acceso';
import { hoyMexico } from '../lib/hoy';

export default async function Pagina() {
  if (!tieneAcceso(await cookies())) redirect('/acceso');
  const hoy = hoyMexico();
  // Solo lo que el navegador necesita: nunca los hechos ocultos ni la persona del vendedor simulado.
  const escenarios: EscenarioVista[] = ESCENARIOS.map((e) => ({
    id: e.id,
    titulo: e.titulo,
    tarjetaPapel: e.tarjetaPapel,
    idCRM: e.construirFicha(hoy).idCRM,
  }));
  return <Laboratorio escenarios={escenarios} />;
}
