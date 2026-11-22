/**
 * Avance de la atención de una incidencia o un mantenimiento: Asignado → En camino → Atendiendo (y luego Resuelto o Finalizado,
 * que lo da el estado). Lo marca el técnico asignado; quien reportó y el coordinador reciben el aviso.
 */
export type EtapaAvance = 'SIN_ASIGNAR' | 'ASIGNADO' | 'EN_CAMINO' | 'ATENDIENDO';

interface ConAvance {
  tecnicoAsignadoId?: string | number | null;
  fechaEnCamino?: string | null;
  fechaAtendiendo?: string | null;
}

export function etapaAvance(o: ConAvance): EtapaAvance {
  if (!o.tecnicoAsignadoId) return 'SIN_ASIGNAR';
  if (o.fechaAtendiendo) return 'ATENDIENDO';
  if (o.fechaEnCamino) return 'EN_CAMINO';
  return 'ASIGNADO';
}

export const ETIQUETA_AVANCE: Record<EtapaAvance, string> = {
  SIN_ASIGNAR: 'Sin asignar',
  ASIGNADO: 'Asignado',
  EN_CAMINO: 'En camino',
  ATENDIENDO: 'Atendiendo',
};

export const CLASE_AVANCE: Record<EtapaAvance, string> = {
  SIN_ASIGNAR: 'bg-slate-100 text-slate-600',
  ASIGNADO: 'bg-violet-100 text-violet-700',
  EN_CAMINO: 'bg-amber-100 text-amber-800',
  ATENDIENDO: 'bg-emerald-100 text-emerald-700',
};
