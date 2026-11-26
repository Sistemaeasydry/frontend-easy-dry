import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../config/env';

export interface CategoriaDotacionApi { id: string; nombre: string; activa: boolean; productos: number }
export interface TallaStockApi { nombre: string; stock: number }
export interface ProductoDotacionApi { id: string; nombre: string; categoriaId: string; categoria: string; stock: number; activo: boolean; usaTallas: boolean; tallas: TallaStockApi[] }
export interface MovimientoDotacionApi {
  id: string; tipo: 'INGRESO' | 'SALIDA' | 'AJUSTE'; cantidad: number; stockDespues: number; talla: string | null; nota: string | null; entregaId: string | null; actor: string; creadoEn: string;
}

export interface PlanDotacionApi {
  id: string;
  nombre: string;
  tipo: 'FIJO' | 'OCASIONAL';
  cadaMeses: number | null;
  roles: string[];
  agenciasIds: string[];
  activo: boolean;
  items: Array<{ productoId: string; producto: string; cantidad: number }>;
}

export type ModoEntregaDotacion = 'PERSONAS' | 'AGENCIA';

export interface CoordinadorDotacionApi { id: string; nombre: string; rol: string; agencia: string | null }

export interface GuardarPlanDotacion {
  id?: string;
  nombre: string;
  tipo: 'FIJO' | 'OCASIONAL';
  cadaMeses?: number;
  roles: string[];
  agenciasIds: string[];
  items: Array<{ productoId: string; cantidad: number }>;
}

export interface DestinoDotacionApi {
  id: string;
  nombre: string;
  rol: string;
  agencia: string | null;
  personas: number;
  /** Fecha de la entrega de este plan que ya tiene pendiente (no se le puede crear otra). */
  pendiente: string | null;
  ultimaEntrega: string | null;
}

export interface CrearEntregasDotacion {
  planId: string;
  modo: ModoEntregaDotacion;
  destinos: string[];
  coordinadorId: string;
  /** AAAA-MM-DD */
  fecha: string;
}

export interface TallaEntregadaApi { talla: string; cantidad: number }

/** PROGRAMADA: entrega de fecha futura (se habilita el día que toca). */
export type EstadoEntregaDotacion = 'PENDIENTE' | 'ENTREGADA' | 'OMITIDA' | 'PROGRAMADA';
/** Dónde cae una entrega respecto a hoy. */
export type MomentoEntregaDotacion = 'ATRASADA' | 'HOY' | 'FUTURA' | 'CERRADA';
/** Filtro de estado del listado: POR_ENTREGAR = atrasadas, de hoy y próximas. */
export type FiltroEstadoEntrega = EstadoEntregaDotacion | 'POR_ENTREGAR';

export interface EntregaDotacionApi {
  id: string;
  planId: string;
  plan: string;
  /** AGENCIA: la entrega es a la agencia completa y la recibe una sola persona. */
  modo: ModoEntregaDotacion;
  coordinadorId: string | null;
  coordinador: string | null;
  /** Meses tras los que se vuelve a entregar; null si no se repite. */
  repiteCadaMeses: number | null;
  personaId: string | null;
  persona: string;
  personasCubiertas: number | null;
  recibeNombre: string | null;
  firmada: boolean;
  rol: string;
  agencia: string | null;
  fechaProgramada: string;
  estado: EstadoEntregaDotacion;
  momento: MomentoEntregaDotacion;
  entregadaEn: string | null;
  nota: string | null;
  items: Array<{ id: string; productoId: string; producto: string; categoria: string; stock: number; cantidadPlan: number; cantidadEntregada: number | null; usaTallas: boolean; tallasStock: TallaStockApi[]; tallas: TallaEntregadaApi[] }>;
  evidencias: Array<{ id: string; key: string; nombre: string; mime: string }>;
}

@Injectable({ providedIn: 'root' })
export class DotacionesService {
  private readonly http = inject(HttpClient);

  private post<T>(ruta: string, cuerpo: object = {}): Observable<T> {
    return this.http.post<T>(apiUrl(`/dotaciones/${ruta}`), cuerpo);
  }

  categorias(): Observable<CategoriaDotacionApi[]> { return this.post('categorias/list'); }
  guardarCategoria(c: { id?: string; nombre: string; activa?: boolean }): Observable<unknown> { return this.post('categorias/guardar', c); }

  eliminarCategoria(id: string): Observable<unknown> { return this.post('categorias/eliminar', { id }); }
  eliminarProducto(id: string): Observable<unknown> { return this.post('productos/eliminar', { id }); }
  eliminarPlan(id: string): Observable<unknown> { return this.post('planes/eliminar', { id }); }

  productos(): Observable<ProductoDotacionApi[]> { return this.post('productos/list'); }
  guardarProducto(p: { id?: string; nombre: string; categoriaId: string; activo?: boolean; usaTallas: boolean; tallas?: Array<{ nombre: string; stock?: number }> }): Observable<unknown> { return this.post('productos/guardar', p); }
  ingreso(productoId: string, cantidad: number, talla?: string, nota?: string): Observable<{ id: string; stock: number }> { return this.post('productos/ingreso', { productoId, cantidad, talla, nota }); }
  movimientos(productoId: string): Observable<MovimientoDotacionApi[]> { return this.post('productos/movimientos', { productoId }); }

  planes(): Observable<PlanDotacionApi[]> { return this.post('planes/list'); }
  guardarPlan(p: GuardarPlanDotacion): Observable<PlanDotacionApi> { return this.post('planes/guardar', p); }
  estadoPlan(id: string, activo: boolean): Observable<unknown> { return this.post('planes/estado', { id, activo }); }

  entregas(filtro: { estado?: FiltroEstadoEntrega; planId?: string; buscar?: string; desde?: string; hasta?: string } = {}): Observable<EntregaDotacionApi[]> { return this.post('entregas/list', filtro); }
  destinosDeEntrega(planId: string): Observable<{ personas: DestinoDotacionApi[]; agencias: DestinoDotacionApi[] }> { return this.post('entregas/destinos', { planId }); }
  crearEntregas(e: CrearEntregasDotacion): Observable<{ creadas: number; yaPendientes: string[] }> { return this.post('entregas/crear', e); }
  reasignarEntrega(entregaId: string, coordinadorId: string): Observable<unknown> { return this.post('entregas/reasignar', { entregaId, coordinadorId }); }
  registrarEntrega(
    entregaId: string,
    items: Array<{ itemId: string; cantidadEntregada: number; tallas?: TallaEntregadaApi[] }>,
    evidencias: Array<{ url: string; nombre: string }>,
    recibe: { recibeNombre: string; firmaRecibe: string },
    nota?: string,
  ): Observable<EntregaDotacionApi & { siguienteFecha: string | null }> {
    return this.post('entregas/registrar', { entregaId, items, evidencias, nota, ...recibe });
  }
  firmaEntrega(entregaId: string): Observable<{ recibeNombre: string | null; firma: string | null }> { return this.post('entregas/firma', { entregaId }); }
  coordinadores(): Observable<CoordinadorDotacionApi[]> { return this.post('coordinadores/list'); }
  omitirEntrega(entregaId: string, motivo: string, noRepetir: boolean): Observable<{ siguienteFecha: string | null }> { return this.post('entregas/omitir', { entregaId, motivo, noRepetir }); }
}
