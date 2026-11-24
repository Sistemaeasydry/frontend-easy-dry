import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../config/env';

export interface CategoriaDotacionApi { id: string; nombre: string; activa: boolean; productos: number }
export interface ProductoDotacionApi { id: string; nombre: string; categoriaId: string; categoria: string; stock: number; activo: boolean }
export interface MovimientoDotacionApi {
  id: string; tipo: 'INGRESO' | 'SALIDA' | 'AJUSTE'; cantidad: number; stockDespues: number; nota: string | null; entregaId: string | null; actor: string; creadoEn: string;
}

export interface PlanDotacionApi {
  id: string;
  nombre: string;
  tipo: 'FIJO' | 'OCASIONAL';
  /** AAAA-MM-DD */
  fechaInicio: string;
  cadaMeses: number | null;
  roles: string[];
  agenciasIds: string[];
  /** PERSONAS: una entrega y una firma por persona. AGENCIA: una sola entrega por agencia. */
  modoEntrega: ModoEntregaDotacion;
  coordinadorId: string | null;
  coordinador: string | null;
  activo: boolean;
  items: Array<{ productoId: string; producto: string; cantidad: number }>;
}

export type ModoEntregaDotacion = 'PERSONAS' | 'AGENCIA';

export interface CoordinadorDotacionApi { id: string; nombre: string; rol: string; agencia: string | null }

export interface GuardarPlanDotacion {
  id?: string;
  nombre: string;
  tipo: 'FIJO' | 'OCASIONAL';
  fechaInicio: string;
  cadaMeses?: number;
  roles: string[];
  agenciasIds: string[];
  modoEntrega: ModoEntregaDotacion;
  coordinadorId: string;
  items: Array<{ productoId: string; cantidad: number }>;
}

export type EstadoEntregaDotacion = 'PENDIENTE' | 'ENTREGADA' | 'OMITIDA';

export interface EntregaDotacionApi {
  id: string;
  planId: string;
  plan: string;
  /** AGENCIA: la entrega es a la agencia completa y la recibe una sola persona. */
  modo: ModoEntregaDotacion;
  coordinador: string | null;
  personaId: string | null;
  persona: string;
  personasCubiertas: number | null;
  recibeNombre: string | null;
  firmada: boolean;
  rol: string;
  agencia: string | null;
  fechaProgramada: string;
  estado: EstadoEntregaDotacion;
  entregadaEn: string | null;
  nota: string | null;
  items: Array<{ id: string; productoId: string; producto: string; categoria: string; stock: number; cantidadPlan: number; cantidadEntregada: number | null }>;
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

  productos(): Observable<ProductoDotacionApi[]> { return this.post('productos/list'); }
  guardarProducto(p: { id?: string; nombre: string; categoriaId: string; activo?: boolean }): Observable<unknown> { return this.post('productos/guardar', p); }
  ingreso(productoId: string, cantidad: number, nota?: string): Observable<{ id: string; stock: number }> { return this.post('productos/ingreso', { productoId, cantidad, nota }); }
  movimientos(productoId: string): Observable<MovimientoDotacionApi[]> { return this.post('productos/movimientos', { productoId }); }

  planes(): Observable<PlanDotacionApi[]> { return this.post('planes/list'); }
  guardarPlan(p: GuardarPlanDotacion): Observable<PlanDotacionApi> { return this.post('planes/guardar', p); }
  estadoPlan(id: string, activo: boolean): Observable<unknown> { return this.post('planes/estado', { id, activo }); }

  entregas(filtro: { estado?: EstadoEntregaDotacion; planId?: string; buscar?: string } = {}): Observable<EntregaDotacionApi[]> { return this.post('entregas/list', filtro); }
  registrarEntrega(
    entregaId: string,
    items: Array<{ itemId: string; cantidadEntregada: number }>,
    evidencias: Array<{ url: string; nombre: string }>,
    recibe: { recibeNombre: string; firmaRecibe: string },
    nota?: string,
  ): Observable<EntregaDotacionApi> {
    return this.post('entregas/registrar', { entregaId, items, evidencias, nota, ...recibe });
  }
  firmaEntrega(entregaId: string): Observable<{ recibeNombre: string | null; firma: string | null }> { return this.post('entregas/firma', { entregaId }); }
  coordinadores(): Observable<CoordinadorDotacionApi[]> { return this.post('coordinadores/list'); }
  omitirEntrega(entregaId: string, motivo: string): Observable<unknown> { return this.post('entregas/omitir', { entregaId, motivo }); }
}
