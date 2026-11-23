import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../config/env';

export interface FiltrosAuditoria {
  modulo?: string;
  actor?: string;
  texto?: string;
  /** YYYY-MM-DD, hora de Ecuador. */
  desde?: string;
  hasta?: string;
  pagina?: number;
  tamano?: number;
}

export interface RegistroAuditoriaApi {
  id: string;
  fecha: string;
  actor: string;
  rol: string;
  modulo: string;
  moduloNombre: string;
  accion: string;
  resumen: string;
  entidadTipo: string | null;
  entidadId: string | null;
  antes: unknown;
  despues: unknown;
  datos: unknown;
}

export interface PaginaAuditoria {
  total: number;
  pagina: number;
  tamano: number;
  filas: RegistroAuditoriaApi[];
}

export interface ConsultaBitacoraApi {
  id: string;
  fecha: string;
  usuario: string;
  rol: string;
  tipo: 'CONSULTA' | 'EXCEL' | 'PDF';
  filtros: Record<string, unknown> | null;
  filas: number;
}

/** Auditoría del sistema: quién hizo qué y cuándo, solo de las pantallas que el rol tiene activas y dentro de su alcance. */
@Injectable({ providedIn: 'root' })
export class AuditoriaService {
  private readonly http = inject(HttpClient);

  opciones(): Observable<{ modulos: Array<{ valor: string; etiqueta: string }> }> {
    return this.http.post<{ modulos: Array<{ valor: string; etiqueta: string }> }>(apiUrl('/auditoria/opciones'), {});
  }

  listar(filtros: FiltrosAuditoria): Observable<PaginaAuditoria> {
    return this.http.post<PaginaAuditoria>(apiUrl('/auditoria/listar'), filtros);
  }

  /** Filas para exportar (hasta el tope del servidor); deja constancia en la bitácora. */
  exportar(filtros: FiltrosAuditoria, formato: 'EXCEL' | 'PDF'): Observable<{ total: number; recortado: boolean; filas: RegistroAuditoriaApi[] }> {
    const { pagina: _p, tamano: _t, ...resto } = filtros;
    return this.http.post<{ total: number; recortado: boolean; filas: RegistroAuditoriaApi[] }>(apiUrl('/auditoria/exportar'), { ...resto, formato });
  }

  bitacora(): Observable<ConsultaBitacoraApi[]> {
    return this.http.post<ConsultaBitacoraApi[]>(apiUrl('/auditoria/bitacora'), {});
  }
}
