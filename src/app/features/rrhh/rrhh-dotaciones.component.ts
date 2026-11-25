import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../../shared/services/toast.service';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { AuthService } from '../../core/services/auth.service';
import { RolService } from '../../core/services/rol.service';
import { AgenciaService } from '../../core/services/agencia.service';
import {
  CategoriaDotacionApi,
  CoordinadorDotacionApi,
  DotacionesService,
  EntregaDotacionApi,
  EstadoEntregaDotacion,
  FiltroEstadoEntrega,
  MomentoEntregaDotacion,
  MovimientoDotacionApi,
  PlanDotacionApi,
  ProductoDotacionApi,
} from '../../core/services/dotaciones.service';
import { AdjuntoTareaApi } from '../../core/services/rrhh.service';
import { FirmaModalComponent, type FirmaCapturada } from '../auditorias/shared/firma-modal.component';
import { FirmaImagenComponent } from '../auditorias/shared/firma-imagen.component';
import { AdjuntoElegido, RrhhAdjuntosComponent } from './rrhh-adjuntos.component';

type Pestana = 'entregas' | 'productos' | 'planes';

const MAX_FOTOS = 5;
const ROLES_SIN_DOTACION = ['SUPER_ADMIN', 'ADMIN'];

const mensajeDe = (e: unknown, defecto: string): string => {
  const m = (e as { error?: { message?: string | string[] } } | null)?.error?.message;
  return Array.isArray(m) ? m.join(', ') : m ? String(m) : defecto;
};

const hoyEcuador = (): string => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

const ETIQUETA_ESTADO: Record<EstadoEntregaDotacion, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-100 text-amber-800 border-amber-200' },
  ENTREGADA: { texto: 'Entregada', clase: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  OMITIDA: { texto: 'Omitida', clase: 'bg-slate-100 text-slate-600 border-slate-200' },
  PROGRAMADA: { texto: 'Programada', clase: 'bg-sky-100 text-sky-800 border-sky-200' },
};

const TITULO_GRUPO: Record<MomentoEntregaDotacion, string> = {
  ATRASADA: 'Atrasadas · sin entregar',
  HOY: 'Para hoy',
  FUTURA: 'Próximas',
  CERRADA: 'Ya cerradas',
};

interface FilaPlan { productoId: string; cantidad: number }

/**
 * RRHH · Dotaciones. Productos con stock propio (las categorías las crea el super admin: Uniformes, EPP…), planes por rol o agencia con
 * calendario fijo u ocasional, y las entregas que de ahí salen: se registran con las cantidades entregadas y de 1 a 5 fotos de evidencia,
 * y cada entrega descuenta el stock.
 */
@Component({
  selector: 'app-rrhh-dotaciones',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ModalComponent, RrhhAdjuntosComponent, FirmaModalComponent, FirmaImagenComponent],
  template: `
    <div class="space-y-5 animate-fade-in">
      <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-easydry">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-bold mb-2">
          <i-lucide name="package-check" class="w-3.5 h-3.5" aria-hidden="true"></i-lucide><span>RRHH</span>
        </div>
        <h1 class="text-2xl font-extrabold text-slate-900 font-outfit">Dotaciones</h1>
        <p class="text-slate-500 text-xs mt-1 max-w-2xl">Uniformes, EPP y lo que definas: productos con su stock, planes por rol o agencia, y un coordinador que sale a entregar: a la agencia completa (firma uno) o persona por persona (firma cada una), con fotos de evidencia.</p>
      </div>

      <div class="flex gap-1 border-b border-slate-200" role="tablist" aria-label="Dotaciones">
        @for (t of pestanas; track t.id) {
          <button type="button" role="tab" [attr.aria-selected]="pestana === t.id" class="px-4 min-h-11 text-sm font-bold border-b-2 -mb-px transition-colors" [ngClass]="pestana === t.id ? 'border-easydry-blue text-easydry-blue' : 'border-transparent text-slate-500 hover:text-slate-800'" (click)="cambiarPestana(t.id)">{{ t.nombre }}</button>
        }
      </div>

      <!-- ───────────── Entregas ───────────── -->
      @if (pestana === 'entregas') {
        <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-4" aria-label="Entregas">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label class="field-label" for="de-buscar">Persona</label>
              <input id="de-buscar" class="field" [(ngModel)]="buscar" (ngModelChange)="cargarEntregas()" placeholder="Nombre o apellido…" autocomplete="off">
            </div>
            <div>
              <label class="field-label" for="de-plan">Plan</label>
              <select id="de-plan" class="field" [(ngModel)]="filtroPlan" (ngModelChange)="cargarEntregas()">
                <option value="">Todos los planes</option>
                @for (p of planesFiltro; track p.id) { <option [value]="p.id">{{ p.nombre }}</option> }
              </select>
            </div>
            <div>
              <label class="field-label" for="de-estado">Estado</label>
              <select id="de-estado" class="field" [(ngModel)]="filtroEstado" (ngModelChange)="cargarEntregas()">
                <option value="POR_ENTREGAR">Por entregar (atrasadas, hoy y próximas)</option>
                <option value="PENDIENTE">Pendientes (atrasadas y de hoy)</option>
                <option value="PROGRAMADA">Próximas</option>
                <option value="ENTREGADA">Entregadas</option>
                <option value="OMITIDA">Omitidas</option>
                <option value="">Todas</option>
              </select>
            </div>
            <div>
              <label class="field-label" for="de-desde">Fecha desde</label>
              <input id="de-desde" type="date" class="field" [(ngModel)]="desde" (ngModelChange)="cargarEntregas()">
            </div>
            <div>
              <label class="field-label" for="de-hasta">Fecha hasta</label>
              <input id="de-hasta" type="date" class="field" [(ngModel)]="hasta" (ngModelChange)="cargarEntregas()">
            </div>
          </div>
          @if (hayFiltros) {
            <button type="button" class="btn btn-secondary btn-sm" (click)="limpiarFiltros()">Quitar filtros</button>
          }
          @if (cargando) { <p class="text-sm text-slate-500">Cargando…</p> }
          @else if (!entregas.length) { <p class="text-sm text-slate-500">No hay entregas con ese filtro. Se generan solas cuando llega la fecha de un plan.</p> }
          @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th class="py-2 pr-3">Fecha</th><th class="pr-3">Persona</th><th class="pr-3">Plan y coordinador</th><th class="pr-3">Productos</th><th class="pr-3">Estado</th><th></th>
                </tr></thead>
                <tbody>
                  @for (g of grupos; track g.momento) {
                    <tr class="bg-slate-50">
                      <th colspan="6" scope="colgroup" class="py-1.5 px-2 text-left text-[11px] font-black uppercase tracking-wide" [ngClass]="g.momento === 'ATRASADA' ? 'text-rose-700' : g.momento === 'HOY' ? 'text-amber-700' : g.momento === 'FUTURA' ? 'text-sky-700' : 'text-slate-500'">
                        {{ g.titulo }} · {{ g.filas.length }}
                      </th>
                    </tr>
                  @for (e of g.filas; track e.id) {
                    <tr class="border-b border-slate-100 align-top" [ngClass]="e.momento === 'ATRASADA' ? 'bg-rose-50/60' : ''">
                      <td class="py-2 pr-3 whitespace-nowrap">{{ e.fechaProgramada }}@if (e.momento === 'ATRASADA') { <p class="text-[11px] font-bold text-rose-700">{{ diasDeAtraso(e) }}</p> }</td>
                      <td class="pr-3"><p class="font-bold text-slate-800">{{ e.persona }}</p>
                        @if (e.modo === 'AGENCIA') { <p class="text-[11px] text-slate-500">Entrega a la agencia completa@if (e.personasCubiertas) { · {{ e.personasCubiertas }} personas }</p> }
                        @else { <p class="text-[11px] text-slate-500">{{ e.rol }}@if (e.agencia) { · {{ e.agencia }} }</p> }</td>
                      <td class="pr-3"><p>{{ e.plan }}</p>@if (e.coordinador) { <p class="text-[11px] text-slate-500">Entrega: {{ e.coordinador }}</p> }</td>
                      <td class="pr-3 text-xs">
                        @for (i of e.items; track i.id) { <p>{{ i.producto }} · {{ e.estado === 'ENTREGADA' ? (i.cantidadEntregada ?? 0) + ' de ' + i.cantidadPlan : i.cantidadPlan }}</p> }
                      </td>
                      <td class="pr-3"><span class="inline-block px-2 py-0.5 rounded-full border text-[11px] font-bold" [ngClass]="etiqueta[e.estado].clase">{{ etiqueta[e.estado].texto }}</span></td>
                      <td class="text-right whitespace-nowrap">
                        @if (e.estado === 'PENDIENTE' && puede('dotaciones.entregas.registrar')) {
                          <button type="button" class="btn btn-primary btn-sm" (click)="abrirEntrega(e)">Registrar</button>
                          <button type="button" class="btn btn-secondary btn-sm ml-1" (click)="abrirOmitir(e)">Omitir</button>
                        } @else if (e.estado === 'PROGRAMADA') {
                          <span class="text-[11px] text-slate-500">Se habilita el {{ e.fechaProgramada }}</span>
                        } @else if (e.estado !== 'PENDIENTE') {
                          <button type="button" class="btn btn-secondary btn-sm" (click)="verEntrega(e)">Ver</button>
                        }
                      </td>
                    </tr>
                  }
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- ───────────── Productos ───────────── -->
      @if (pestana === 'productos') {
        <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-3" aria-label="Categorías">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-extrabold text-slate-900">Categorías</h2>
            @if (puede('dotaciones.productos.gestionar')) { <button type="button" class="btn btn-secondary btn-sm" (click)="abrirCategoria()"><i-lucide name="plus" class="w-4 h-4" aria-hidden="true"></i-lucide> Nueva categoría</button> }
          </div>
          @if (!categorias.length) { <p class="text-sm text-slate-500">Aún no hay categorías. Crea la primera (por ejemplo «Uniformes» o «EPP»).</p> }
          <div class="flex flex-wrap gap-2">
            @for (c of categorias; track c.id) {
              <button type="button" class="px-3 py-1.5 rounded-full border text-xs font-bold" [ngClass]="c.activa ? 'border-slate-300 bg-slate-50 text-slate-800' : 'border-slate-200 bg-slate-100 text-slate-400 line-through'" [disabled]="!puede('dotaciones.productos.gestionar')" (click)="abrirCategoria(c)">{{ c.nombre }} · {{ c.productos }}</button>
            }
          </div>
        </section>

        <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-3" aria-label="Productos">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-extrabold text-slate-900">Productos y stock</h2>
            @if (puede('dotaciones.productos.gestionar')) { <button type="button" class="btn btn-primary btn-sm" (click)="abrirProducto()" [disabled]="!categorias.length"><i-lucide name="plus" class="w-4 h-4" aria-hidden="true"></i-lucide> Nuevo producto</button> }
          </div>
          @if (!productos.length) { <p class="text-sm text-slate-500">No hay productos todavía.</p> }
          @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-left text-xs text-slate-500 border-b border-slate-200"><th class="py-2 pr-3">Producto</th><th class="pr-3">Categoría</th><th class="pr-3 text-right">Stock</th><th class="pr-3">Estado</th><th></th></tr></thead>
                <tbody>
                  @for (p of productos; track p.id) {
                    <tr class="border-b border-slate-100">
                      <td class="py-2 pr-3 font-bold text-slate-800">{{ p.nombre }}</td>
                      <td class="pr-3">{{ p.categoria }}</td>
                      <td class="pr-3 text-right font-extrabold" [ngClass]="p.stock === 0 ? 'text-rose-700' : 'text-slate-900'">{{ p.stock }}</td>
                      <td class="pr-3 text-xs">{{ p.activo ? 'Activo' : 'Inactivo' }}</td>
                      <td class="text-right whitespace-nowrap">
                        @if (puede('dotaciones.productos.ingreso')) { <button type="button" class="btn btn-primary btn-sm" (click)="abrirIngreso(p)">Ingreso</button> }
                        <button type="button" class="btn btn-secondary btn-sm ml-1" (click)="abrirHistorial(p)">Historial</button>
                        @if (puede('dotaciones.productos.gestionar')) { <button type="button" class="btn btn-secondary btn-sm ml-1" (click)="abrirProducto(p)">Editar</button> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }

      <!-- ───────────── Planes ───────────── -->
      @if (pestana === 'planes') {
        <section class="bg-white rounded-2xl border border-slate-100 shadow-easydry p-5 space-y-3" aria-label="Planes">
          <div class="flex items-center justify-between gap-2">
            <h2 class="font-extrabold text-slate-900">Planes de dotación</h2>
            @if (puede('dotaciones.planes.gestionar')) { <button type="button" class="btn btn-primary btn-sm" (click)="abrirPlan()" [disabled]="!productos.length"><i-lucide name="plus" class="w-4 h-4" aria-hidden="true"></i-lucide> Nuevo plan</button> }
          </div>
          @if (!planes.length) { <p class="text-sm text-slate-500">No hay planes. Un plan dice qué se entrega, a quién (roles y/o agencias) y cuándo.</p> }
          <ul class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            @for (p of planes; track p.id) {
              <li class="rounded-xl border border-slate-200 p-4 space-y-2" [class.opacity-60]="!p.activo">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-extrabold text-slate-900 truncate">{{ p.nombre }}</p>
                    <p class="text-xs text-slate-600">{{ p.tipo === 'FIJO' ? 'Cada ' + p.cadaMeses + ' ' + (p.cadaMeses === 1 ? 'mes' : 'meses') + ' desde ' + p.fechaInicio : 'Una sola vez el ' + p.fechaInicio }}</p>
                  </div>
                  <span class="px-2 py-0.5 rounded-full border text-[11px] font-bold" [ngClass]="p.activo ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'">{{ p.activo ? 'Activo' : 'Inactivo' }}</span>
                </div>
                <p class="text-xs"><strong>Productos:</strong> {{ resumenItems(p) }}</p>
                <p class="text-xs"><strong>Aplica a:</strong> {{ alcancePlan(p) }}</p>
                <p class="text-xs"><strong>Entrega:</strong> {{ p.modoEntrega === 'AGENCIA' ? 'A la agencia completa (firma uno)' : 'Persona por persona (firma cada una)' }} · {{ p.coordinador || 'Sin coordinador' }}</p>
                @if (puede('dotaciones.planes.gestionar')) {
                  <div class="flex gap-2 pt-1">
                    <button type="button" class="btn btn-secondary btn-sm" (click)="abrirPlan(p)">Editar</button>
                    <button type="button" class="btn btn-secondary btn-sm" (click)="alternarPlan(p)">{{ p.activo ? 'Desactivar' : 'Activar' }}</button>
                  </div>
                }
              </li>
            }
          </ul>
        </section>
      }

      <!-- ───────────── Modales ───────────── -->
      <app-modal [isOpen]="!!modalCategoria" [title]="modalCategoria?.id ? 'Editar categoría' : 'Nueva categoría'" icon="tag" size="sm" (close)="modalCategoria = null">
        @if (modalCategoria) {
          <form class="space-y-3" (ngSubmit)="guardarCategoria()">
            <div><label class="field-label" for="dc-nombre">Nombre *</label><input id="dc-nombre" name="nombre" class="field" [(ngModel)]="modalCategoria.nombre" maxlength="60" placeholder="Uniformes, EPP…"></div>
            @if (modalCategoria.id) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="activa" [(ngModel)]="modalCategoria.activa"> Activa</label> }
            <div class="flex justify-end gap-2"><button type="button" class="btn btn-secondary" (click)="modalCategoria = null">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="guardando">Guardar</button></div>
          </form>
        }
      </app-modal>

      <app-modal [isOpen]="!!modalProducto" [title]="modalProducto?.id ? 'Editar producto' : 'Nuevo producto'" icon="package" size="sm" (close)="modalProducto = null">
        @if (modalProducto) {
          <form class="space-y-3" (ngSubmit)="guardarProducto()">
            <div><label class="field-label" for="dp-nombre">Nombre *</label><input id="dp-nombre" name="nombre" class="field" [(ngModel)]="modalProducto.nombre" maxlength="100" placeholder="Camiseta, botas, guantes…"></div>
            <div><label class="field-label" for="dp-cat">Categoría *</label>
              <select id="dp-cat" name="categoria" class="field" [(ngModel)]="modalProducto.categoriaId">
                <option value="">Elige una categoría</option>
                @for (c of categoriasActivas(); track c.id) { <option [value]="c.id">{{ c.nombre }}</option> }
              </select>
            </div>
            @if (modalProducto.id) { <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="activo" [(ngModel)]="modalProducto.activo"> Activo</label> }
            <p class="text-[11px] text-slate-500">El stock no se edita aquí: sube con los ingresos y baja con las entregas.</p>
            <div class="flex justify-end gap-2"><button type="button" class="btn btn-secondary" (click)="modalProducto = null">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="guardando">Guardar</button></div>
          </form>
        }
      </app-modal>

      <app-modal [isOpen]="!!modalIngreso" [title]="'Ingreso de stock' + (modalIngreso ? ' · ' + modalIngreso.producto.nombre : '')" icon="package-plus" size="sm" (close)="modalIngreso = null">
        @if (modalIngreso) {
          <form class="space-y-3" (ngSubmit)="guardarIngreso()">
            <p class="text-xs text-slate-600">Stock actual: <strong>{{ modalIngreso.producto.stock }}</strong></p>
            <div><label class="field-label" for="di-cant">Cantidad que ingresa *</label><input id="di-cant" name="cantidad" type="number" min="1" class="field" [(ngModel)]="modalIngreso.cantidad"></div>
            <div><label class="field-label" for="di-nota">Nota</label><input id="di-nota" name="nota" class="field" [(ngModel)]="modalIngreso.nota" maxlength="300" placeholder="Compra, factura, proveedor…"></div>
            <div class="flex justify-end gap-2"><button type="button" class="btn btn-secondary" (click)="modalIngreso = null">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="guardando">Registrar ingreso</button></div>
          </form>
        }
      </app-modal>

      <app-modal [isOpen]="!!historial" [title]="'Movimientos' + (historial ? ' · ' + historial.producto.nombre : '')" icon="history" size="md" (close)="historial = null">
        @if (historial) {
          @if (!historial.lista.length) { <p class="text-sm text-slate-500">Sin movimientos.</p> }
          @else {
            <ul class="divide-y divide-slate-100 text-sm max-h-96 overflow-y-auto">
              @for (m of historial.lista; track m.id) {
                <li class="py-2 flex items-start justify-between gap-3">
                  <div><p class="font-bold" [ngClass]="m.tipo === 'INGRESO' ? 'text-emerald-700' : 'text-slate-800'">{{ m.tipo === 'INGRESO' ? 'Ingreso' : m.tipo === 'SALIDA' ? 'Entrega' : 'Ajuste' }} · {{ m.tipo === 'SALIDA' ? '-' : '+' }}{{ m.cantidad }}</p><p class="text-[11px] text-slate-500">{{ m.creadoEn | date:'dd/MM/yyyy HH:mm':'-0500' }} · {{ m.actor }}@if (m.nota) { · {{ m.nota }} }</p></div>
                  <span class="text-xs text-slate-500 whitespace-nowrap">Stock {{ m.stockDespues }}</span>
                </li>
              }
            </ul>
          }
        }
      </app-modal>

      <app-modal [isOpen]="!!modalPlan" [title]="modalPlan?.id ? 'Editar plan' : 'Nuevo plan'" icon="package-check" size="lg" (close)="modalPlan = null">
        @if (modalPlan) {
          <form class="space-y-4" (ngSubmit)="guardarPlan()">
            <div><label class="field-label" for="pl-nombre">Nombre *</label><input id="pl-nombre" name="nombre" class="field" [(ngModel)]="modalPlan.nombre" maxlength="120" placeholder="Uniforme semestral de lavadores"></div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label class="field-label" for="pl-tipo">Calendario *</label>
                <select id="pl-tipo" name="tipo" class="field" [(ngModel)]="modalPlan.tipo"><option value="FIJO">Fijo (se repite)</option><option value="OCASIONAL">Ocasional (una vez)</option></select>
              </div>
              <div><label class="field-label" for="pl-fecha">{{ modalPlan.tipo === 'FIJO' ? 'Primera fecha *' : 'Fecha *' }}</label><input id="pl-fecha" name="fecha" type="date" class="field" [(ngModel)]="modalPlan.fechaInicio"></div>
              @if (modalPlan.tipo === 'FIJO') {
                <div><label class="field-label" for="pl-meses">Cada cuántos meses *</label><input id="pl-meses" name="meses" type="number" min="1" max="120" class="field" [(ngModel)]="modalPlan.cadaMeses"></div>
              }
            </div>

            <fieldset class="space-y-2">
              <legend class="field-label">Productos *</legend>
              @for (f of modalPlan.items; track $index) {
                <div class="flex items-center gap-2">
                  <select [name]="'prod' + $index" class="field flex-1" [(ngModel)]="f.productoId" [attr.aria-label]="'Producto ' + ($index + 1)">
                    <option value="">Elige un producto</option>
                    @for (p of productosActivos(); track p.id) { <option [value]="p.id">{{ p.categoria }} · {{ p.nombre }}</option> }
                  </select>
                  <input [name]="'cant' + $index" type="number" min="1" class="field w-24" [(ngModel)]="f.cantidad" [attr.aria-label]="'Cantidad por persona ' + ($index + 1)">
                  <button type="button" class="text-rose-600 hover:text-rose-800" (click)="quitarFila($index)" [disabled]="modalPlan.items.length === 1" aria-label="Quitar producto"><i-lucide name="trash-2" class="w-4 h-4" aria-hidden="true"></i-lucide></button>
                </div>
              }
              <button type="button" class="btn btn-secondary btn-sm" (click)="agregarFila()"><i-lucide name="plus" class="w-4 h-4" aria-hidden="true"></i-lucide> Agregar producto</button>
              <p class="text-[11px] text-slate-500">La cantidad es por persona.</p>
            </fieldset>

            <fieldset>
              <legend class="field-label">Aplica a *</legend>
              <select class="field" name="alcance" [(ngModel)]="modalPlan.alcance">
                <option value="ROLES">Personal por rol</option>
                <option value="AGENCIAS">Por agencia</option>
                <option value="TODOS">Todo el personal</option>
              </select>
            </fieldset>

            @if (modalPlan.alcance === 'ROLES') {
              <fieldset>
                <legend class="field-label">Roles que reciben el plan</legend>
                <div class="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
                  @for (r of rolesElegibles; track r.codigo) {
                    <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="modalPlan.roles.includes(r.codigo)" (change)="alternar(modalPlan.roles, r.codigo)"> {{ r.nombre }}</label>
                  }
                </div>
              </fieldset>
            }
            @if (modalPlan.alcance === 'AGENCIAS') {
              <fieldset>
                <legend class="field-label">Agencias que reciben el plan</legend>
                <div class="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-2 space-y-1">
                  @for (a of agencias; track a.id) {
                    <label class="flex items-center gap-2 text-sm"><input type="checkbox" [checked]="modalPlan.agenciasIds.includes(a.id)" (change)="alternar(modalPlan.agenciasIds, a.id)"> {{ a.nombre }}</label>
                  }
                </div>
              </fieldset>
            }
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="field-label" for="pl-modo">Se entrega *</label>
                <select id="pl-modo" name="modoEntrega" class="field" [(ngModel)]="modalPlan.modoEntrega">
                  <option value="PERSONAS">Persona por persona (firma cada una)</option>
                  <option value="AGENCIA">A la agencia completa (firma una sola persona)</option>
                </select>
              </div>
              <div>
                <label class="field-label" for="pl-coord">Coordinador que entrega *</label>
                <select id="pl-coord" name="coordinadorId" class="field" [(ngModel)]="modalPlan.coordinadorId">
                  <option value="">Elige un coordinador</option>
                  @for (c of coordinadores; track c.id) { <option [value]="c.id">{{ c.nombre }} · {{ c.rol }}</option> }
                </select>
              </div>
            </div>
            @if (modalPlan.modoEntrega === 'AGENCIA') { <p class="text-[11px] text-slate-500">En modo agencia se genera una sola entrega por agencia, con las cantidades por persona multiplicadas por el personal de esa agencia que entra en el plan. Se omiten las personas sin agencia.</p> }
            @if (!coordinadores.length) { <p class="text-[11px] text-amber-700 font-semibold">Ningún rol tiene todavía el permiso «Registrar entregas de dotación»: dáselo al rol del coordinador en Roles y Permisos.</p> }
            <p class="text-[11px] text-slate-500">Reciben el plan las personas activas de los roles o agencias marcados. ADMIN y SUPER_ADMIN no reciben dotación. Un plan nuevo no genera entregas de fechas pasadas.</p>
            <div class="flex justify-end gap-2"><button type="button" class="btn btn-secondary" (click)="modalPlan = null">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="guardando">Guardar plan</button></div>
          </form>
        }
      </app-modal>

      <app-modal [isOpen]="!!modalEntrega" [title]="modalEntrega ? 'Entrega · ' + modalEntrega.entrega.persona : ''" icon="package-check" size="lg" (close)="cerrarEntrega()">
        @if (modalEntrega) {
          <form class="space-y-4" (ngSubmit)="registrarEntrega()">
            <p class="text-xs text-slate-600">{{ modalEntrega.entrega.plan }} · programada para el {{ modalEntrega.entrega.fechaProgramada }}</p>
            <p class="text-xs rounded-lg bg-sky-50 border border-sky-200 text-sky-900 px-3 py-2">
              @if (modalEntrega.entrega.modo === 'AGENCIA') { Entrega a la agencia completa@if (modalEntrega.entrega.personasCubiertas) { ({{ modalEntrega.entrega.personasCubiertas }} personas) }: al final firma una sola persona que recibe en nombre de la agencia. }
              @else { Entrega a una persona: al final escribe su nombre y que firme en pantalla. }
            </p>
            <div class="space-y-2">
              <p class="field-label">Cantidad entregada</p>
              @for (i of modalEntrega.entrega.items; track i.id) {
                <div class="flex items-center gap-3 text-sm">
                  <div class="flex-1 min-w-0"><p class="font-bold text-slate-800 truncate">{{ i.producto }}</p><p class="text-[11px]" [ngClass]="i.stock < i.cantidadPlan ? 'text-rose-700 font-bold' : 'text-slate-500'">Plan: {{ i.cantidadPlan }} · Stock: {{ i.stock }}</p></div>
                  <input [name]="'ent' + i.id" type="number" min="0" class="field w-24" [(ngModel)]="modalEntrega.cantidades[i.id]" [attr.aria-label]="'Cantidad entregada de ' + i.producto">
                </div>
              }
            </div>
            <div>
              <p class="field-label">Fotos de evidencia * (1 a {{ maxFotos }})</p>
              <app-rrhh-adjuntos [elegidos]="modalEntrega.fotos" (elegidosChange)="modalEntrega.fotos = $event" (ocupadoChange)="subiendo = $event" [soloFotosTipo]="'FOTO_DOTACION'" [maximo]="maxFotos" etiqueta="Adjuntar fotos de la entrega"></app-rrhh-adjuntos>
            </div>
            <div><label class="field-label" for="en-nota">Nota</label><input id="en-nota" name="nota" class="field" [(ngModel)]="modalEntrega.nota" maxlength="500" placeholder="Tallas, observaciones…"></div>
            <div class="flex justify-end gap-2"><button type="button" class="btn btn-secondary" (click)="cerrarEntrega()">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="guardando || subiendo">{{ subiendo ? 'Subiendo fotos…' : 'Continuar: nombre y firma de quien recibe' }}</button></div>
          </form>
        }
      </app-modal>

      <app-modal [isOpen]="!!modalOmitir" [title]="modalOmitir ? 'Omitir entrega · ' + modalOmitir.entrega.persona : ''" icon="x-circle" size="sm" (close)="modalOmitir = null">
        @if (modalOmitir) {
          <form class="space-y-3" (ngSubmit)="omitir()">
            <div><label class="field-label" for="om-motivo">Motivo * (mínimo 5 caracteres)</label><input id="om-motivo" name="motivo" class="field" [(ngModel)]="modalOmitir.motivo" maxlength="300" placeholder="Ya no trabaja, no aplica…"></div>
            <div class="flex justify-end gap-2"><button type="button" class="btn btn-secondary" (click)="modalOmitir = null">Cancelar</button><button type="submit" class="btn btn-primary" [disabled]="guardando">Omitir entrega</button></div>
          </form>
        }
      </app-modal>

      <app-modal [isOpen]="!!detalle" [title]="detalle ? 'Entrega · ' + detalle.persona : ''" icon="package-check" size="lg" (close)="detalle = null">
        @if (detalle) {
          <div class="space-y-3 text-sm">
            <p class="text-xs text-slate-600">{{ detalle.plan }} · {{ etiqueta[detalle.estado].texto }}@if (detalle.entregadaEn) { el {{ detalle.entregadaEn | date:'dd/MM/yyyy HH:mm':'-0500' }} }</p>
            <ul class="text-xs space-y-0.5">@for (i of detalle.items; track i.id) { <li>{{ i.producto }}: {{ i.cantidadEntregada ?? 0 }} de {{ i.cantidadPlan }}</li> }</ul>
            @if (detalle.nota) { <p class="text-xs"><strong>Nota:</strong> {{ detalle.nota }}</p> }
            @if (detalle.coordinador) { <p class="text-xs"><strong>Entregó:</strong> {{ detalle.coordinador }}</p> }
            @if (detalle.firmada) {
              <div class="space-y-1">
                <p class="text-xs"><strong>Recibió:</strong> {{ detalle.recibeNombre }}</p>
                <app-firma-imagen [imagen]="firmaDetalle" [etiqueta]="detalle.recibeNombre || ''" alto="h-28"></app-firma-imagen>
              </div>
            }
            @if (detalle.evidencias.length) { <app-rrhh-adjuntos [editable]="false" [guardados]="evidenciasDe(detalle)"></app-rrhh-adjuntos> }
          </div>
        }
      </app-modal>

      @if (modalEntrega?.firmando) {
        <app-firma-modal titulo="Recibe la entrega · nombre y firma" [pedirNombre]="true" (cancelar)="cancelarFirma()" (firmada)="confirmarConFirma($event)"></app-firma-modal>
      }
    </div>
  `,
})
export class RrhhDotacionesComponent implements OnInit {
  private readonly api = inject(DotacionesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly rolesApi = inject(RolService);
  private readonly agenciasApi = inject(AgenciaService);

  readonly etiqueta = ETIQUETA_ESTADO;
  readonly maxFotos = MAX_FOTOS;
  pestanas: Array<{ id: Pestana; nombre: string }> = [];
  pestana: Pestana = 'entregas';
  cargando = false;
  guardando = false;
  subiendo = false;

  entregas: EntregaDotacionApi[] = [];
  /** Las entregas del listado agrupadas por momento (el servidor ya las manda en orden: atrasadas, hoy, próximas y cerradas). */
  grupos: Array<{ momento: MomentoEntregaDotacion; titulo: string; filas: EntregaDotacionApi[] }> = [];
  buscar = '';
  /** De inicio: todo lo que hay que hacer, con lo atrasado arriba, luego lo de hoy y al final lo que viene. */
  filtroEstado: FiltroEstadoEntrega | '' = 'POR_ENTREGAR';
  filtroPlan = '';
  desde = '';
  hasta = '';
  planesFiltro: PlanDotacionApi[] = [];
  categorias: CategoriaDotacionApi[] = [];
  productos: ProductoDotacionApi[] = [];
  planes: PlanDotacionApi[] = [];
  rolesElegibles: Array<{ codigo: string; nombre: string }> = [];
  coordinadores: CoordinadorDotacionApi[] = [];
  firmaDetalle: string | null = null;
  agencias: Array<{ id: string; nombre: string }> = [];

  modalCategoria: { id?: string; nombre: string; activa: boolean } | null = null;
  modalProducto: { id?: string; nombre: string; categoriaId: string; activo: boolean } | null = null;
  modalIngreso: { producto: ProductoDotacionApi; cantidad: number; nota: string } | null = null;
  historial: { producto: ProductoDotacionApi; lista: MovimientoDotacionApi[] } | null = null;
  modalPlan: { id?: string; nombre: string; tipo: 'FIJO' | 'OCASIONAL'; fechaInicio: string; cadaMeses: number; alcance: 'ROLES' | 'AGENCIAS' | 'TODOS'; roles: string[]; agenciasIds: string[]; modoEntrega: 'PERSONAS' | 'AGENCIA'; coordinadorId: string; items: FilaPlan[] } | null = null;
  modalEntrega: { entrega: EntregaDotacionApi; cantidades: Record<string, number>; fotos: AdjuntoElegido[]; nota: string; firmando: boolean } | null = null;
  modalOmitir: { entrega: EntregaDotacionApi; motivo: string } | null = null;
  detalle: EntregaDotacionApi | null = null;

  puede(codigo: string): boolean { return this.auth.puede(codigo); }

  ngOnInit(): void {
    const todas: Array<{ id: Pestana; nombre: string; permiso: string }> = [
      { id: 'entregas', nombre: 'Entregas', permiso: 'pagina.dotaciones.entregas' },
      { id: 'productos', nombre: 'Productos y stock', permiso: 'pagina.dotaciones.productos' },
      { id: 'planes', nombre: 'Planes', permiso: 'pagina.dotaciones.planes' },
    ];
    this.pestanas = todas.filter((t) => this.puede(t.permiso));
    if (this.pestanas.length) this.cambiarPestana(this.pestanas[0].id);
  }

  cambiarPestana(id: Pestana): void {
    this.pestana = id;
    if (id === 'entregas') this.cargarEntregas();
    if (id === 'productos') this.cargarCatalogo();
    if (id === 'planes') { this.cargarCatalogo(); this.cargarPlanes(); this.cargarDestinos(); }
  }

  // ───────────────────────── Carga ─────────────────────────

  cargarEntregas(): void {
    this.cargando = true;
    if (!this.planesFiltro.length) this.api.planes().subscribe({ next: (l) => (this.planesFiltro = l), error: () => (this.planesFiltro = []) });
    this.api.entregas({
      ...(this.filtroEstado ? { estado: this.filtroEstado } : {}),
      ...(this.filtroPlan ? { planId: this.filtroPlan } : {}),
      ...(this.buscar.trim() ? { buscar: this.buscar.trim() } : {}),
      ...(this.desde ? { desde: this.desde } : {}),
      ...(this.hasta ? { hasta: this.hasta } : {}),
    }).subscribe({
      next: (l) => { this.entregas = l; this.grupos = this.agrupar(l); this.cargando = false; },
      error: (e) => { this.cargando = false; this.toast.error('No se pudieron cargar las entregas', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  private agrupar(lista: EntregaDotacionApi[]): Array<{ momento: MomentoEntregaDotacion; titulo: string; filas: EntregaDotacionApi[] }> {
    const orden: MomentoEntregaDotacion[] = ['ATRASADA', 'HOY', 'FUTURA', 'CERRADA'];
    return orden
      .map((momento) => ({ momento, titulo: TITULO_GRUPO[momento], filas: lista.filter((e) => e.momento === momento) }))
      .filter((g) => g.filas.length > 0);
  }

  get hayFiltros(): boolean {
    return !!(this.buscar.trim() || this.filtroPlan || this.desde || this.hasta || this.filtroEstado !== 'POR_ENTREGAR');
  }

  limpiarFiltros(): void {
    this.buscar = '';
    this.filtroPlan = '';
    this.desde = '';
    this.hasta = '';
    this.filtroEstado = 'POR_ENTREGAR';
    this.cargarEntregas();
  }

  /** "Atrasada 3 días": cuánto lleva sin entregarse. */
  diasDeAtraso(e: EntregaDotacionApi): string {
    const dias = Math.round((Date.parse(`${hoyEcuador()}T00:00:00Z`) - Date.parse(`${e.fechaProgramada}T00:00:00Z`)) / 86_400_000);
    return `Atrasada ${dias} ${dias === 1 ? 'día' : 'días'}`;
  }

  private cargarCatalogo(): void {
    this.api.categorias().subscribe({ next: (l) => (this.categorias = l), error: () => (this.categorias = []) });
    this.api.productos().subscribe({ next: (l) => (this.productos = l), error: () => (this.productos = []) });
  }

  private cargarPlanes(): void {
    this.api.planes().subscribe({ next: (l) => (this.planes = l), error: (e) => this.toast.error('No se pudieron cargar los planes', mensajeDe(e, 'Inténtalo de nuevo.')) });
  }

  private cargarDestinos(): void {
    this.rolesApi.getRoles().subscribe((roles) => {
      this.rolesElegibles = roles.filter((r) => !ROLES_SIN_DOTACION.includes((r.codigo || '').toUpperCase())).map((r) => ({ codigo: r.codigo, nombre: r.nombre }));
    });
    this.agenciasApi.getAgencias().subscribe((l) => (this.agencias = l.map((a) => ({ id: String(a.id), nombre: a.nombre }))));
    if (this.puede('dotaciones.planes.gestionar')) this.api.coordinadores().subscribe({ next: (l) => (this.coordinadores = l), error: () => (this.coordinadores = []) });
  }

  categoriasActivas(): CategoriaDotacionApi[] { return this.categorias.filter((c) => c.activa); }
  productosActivos(): ProductoDotacionApi[] { return this.productos.filter((p) => p.activo); }

  // ───────────────────────── Categorías y productos ─────────────────────────

  abrirCategoria(c?: CategoriaDotacionApi): void { this.modalCategoria = { id: c?.id, nombre: c?.nombre ?? '', activa: c?.activa ?? true }; }

  guardarCategoria(): void {
    const m = this.modalCategoria;
    if (!m || !m.nombre.trim()) { this.toast.warning('Falta el nombre', 'Escribe el nombre de la categoría.'); return; }
    this.guardando = true;
    this.api.guardarCategoria({ id: m.id, nombre: m.nombre.trim(), ...(m.id ? { activa: m.activa } : {}) }).subscribe({
      next: () => { this.guardando = false; this.modalCategoria = null; this.cargarCatalogo(); this.toast.success('Categoría guardada', ''); },
      error: (e) => { this.guardando = false; this.toast.error('No se pudo guardar', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  abrirProducto(p?: ProductoDotacionApi): void { this.modalProducto = { id: p?.id, nombre: p?.nombre ?? '', categoriaId: p?.categoriaId ?? '', activo: p?.activo ?? true }; }

  guardarProducto(): void {
    const m = this.modalProducto;
    if (!m || !m.nombre.trim() || !m.categoriaId) { this.toast.warning('Faltan datos', 'Escribe el nombre y elige la categoría.'); return; }
    this.guardando = true;
    this.api.guardarProducto({ id: m.id, nombre: m.nombre.trim(), categoriaId: m.categoriaId, ...(m.id ? { activo: m.activo } : {}) }).subscribe({
      next: () => { this.guardando = false; this.modalProducto = null; this.cargarCatalogo(); this.toast.success('Producto guardado', ''); },
      error: (e) => { this.guardando = false; this.toast.error('No se pudo guardar', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  abrirIngreso(producto: ProductoDotacionApi): void { this.modalIngreso = { producto, cantidad: 1, nota: '' }; }

  guardarIngreso(): void {
    const m = this.modalIngreso;
    if (!m || !Number.isInteger(Number(m.cantidad)) || Number(m.cantidad) < 1) { this.toast.warning('Cantidad inválida', 'Indica cuántas unidades ingresan.'); return; }
    this.guardando = true;
    this.api.ingreso(m.producto.id, Number(m.cantidad), m.nota.trim() || undefined).subscribe({
      next: () => { this.guardando = false; this.modalIngreso = null; this.cargarCatalogo(); this.toast.success('Ingreso registrado', ''); },
      error: (e) => { this.guardando = false; this.toast.error('No se pudo registrar el ingreso', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  abrirHistorial(producto: ProductoDotacionApi): void {
    this.historial = { producto, lista: [] };
    this.api.movimientos(producto.id).subscribe({
      next: (l) => { if (this.historial?.producto.id === producto.id) this.historial = { producto, lista: l }; },
      error: (e) => this.toast.error('No se pudo cargar el historial', mensajeDe(e, 'Inténtalo de nuevo.')),
    });
  }

  // ───────────────────────── Planes ─────────────────────────

  abrirPlan(p?: PlanDotacionApi): void {
    this.modalPlan = p
      ? { id: p.id, nombre: p.nombre, tipo: p.tipo, fechaInicio: p.fechaInicio, cadaMeses: p.cadaMeses ?? 6, alcance: p.roles.length ? 'ROLES' : p.agenciasIds.length ? 'AGENCIAS' : 'TODOS', roles: [...p.roles], agenciasIds: [...p.agenciasIds], modoEntrega: p.modoEntrega, coordinadorId: p.coordinadorId ?? '', items: p.items.map((i) => ({ productoId: i.productoId, cantidad: i.cantidad })) }
      : { nombre: '', tipo: 'FIJO', fechaInicio: hoyEcuador(), cadaMeses: 6, alcance: 'ROLES', roles: [], agenciasIds: [], modoEntrega: 'PERSONAS', coordinadorId: '', items: [{ productoId: '', cantidad: 1 }] };
  }

  agregarFila(): void { this.modalPlan?.items.push({ productoId: '', cantidad: 1 }); }
  quitarFila(i: number): void { if (this.modalPlan && this.modalPlan.items.length > 1) this.modalPlan.items.splice(i, 1); }

  alternar(lista: string[], valor: string): void {
    const i = lista.indexOf(valor);
    if (i >= 0) lista.splice(i, 1); else lista.push(valor);
  }

  guardarPlan(): void {
    const m = this.modalPlan;
    if (!m) return;
    if (!m.nombre.trim()) { this.toast.warning('Falta el nombre', 'Escribe el nombre del plan.'); return; }
    if (!m.fechaInicio) { this.toast.warning('Falta la fecha', 'Indica la fecha del plan.'); return; }
    if (m.tipo === 'FIJO' && !(Number(m.cadaMeses) >= 1)) { this.toast.warning('Falta la repetición', 'Indica cada cuántos meses se repite.'); return; }
    if (m.items.some((i) => !i.productoId || !(Number(i.cantidad) >= 1))) { this.toast.warning('Revisa los productos', 'Elige el producto y una cantidad de 1 o más en cada fila.'); return; }
    if (m.alcance === 'ROLES' && !m.roles.length) { this.toast.warning('Faltan roles', 'Marca al menos un rol o elige otra opción en «Aplica a».'); return; }
    if (m.alcance === 'AGENCIAS' && !m.agenciasIds.length) { this.toast.warning('Faltan agencias', 'Marca al menos una agencia o elige otra opción en «Aplica a».'); return; }
    if (!m.coordinadorId) { this.toast.warning('Falta el coordinador', 'Elige quién sale a entregar este plan.'); return; }
    this.guardando = true;
    this.api.guardarPlan({
      id: m.id, nombre: m.nombre.trim(), tipo: m.tipo, fechaInicio: m.fechaInicio, ...(m.tipo === 'FIJO' ? { cadaMeses: Number(m.cadaMeses) } : {}),
      roles: m.alcance === 'ROLES' ? m.roles : [], agenciasIds: m.alcance === 'AGENCIAS' ? m.agenciasIds : [], modoEntrega: m.modoEntrega, coordinadorId: m.coordinadorId, items: m.items.map((i) => ({ productoId: i.productoId, cantidad: Number(i.cantidad) })),
    }).subscribe({
      next: () => { this.guardando = false; this.modalPlan = null; this.cargarPlanes(); this.toast.success('Plan guardado', ''); },
      error: (e) => { this.guardando = false; this.toast.error('No se pudo guardar el plan', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  alternarPlan(p: PlanDotacionApi): void {
    this.api.estadoPlan(p.id, !p.activo).subscribe({
      next: () => this.cargarPlanes(),
      error: (e) => this.toast.error('No se pudo cambiar el plan', mensajeDe(e, 'Inténtalo de nuevo.')),
    });
  }

  resumenItems(p: PlanDotacionApi): string { return p.items.map((i) => `${i.cantidad} × ${i.producto}`).join(', '); }

  alcancePlan(p: PlanDotacionApi): string {
    const roles = p.roles.length ? p.roles.join(', ') : 'todos los roles';
    const nombres = p.agenciasIds.map((id) => this.agencias.find((a) => a.id === id)?.nombre ?? '…');
    return `${roles} · ${p.agenciasIds.length ? nombres.join(', ') : 'todas las agencias'}`;
  }

  // ───────────────────────── Entregas ─────────────────────────

  abrirEntrega(entrega: EntregaDotacionApi): void {
    const cantidades: Record<string, number> = {};
    for (const i of entrega.items) cantidades[i.id] = Math.min(i.cantidadPlan, i.stock);
    this.subiendo = false;
    this.modalEntrega = { entrega, cantidades, fotos: [], nota: '', firmando: false };
  }

  cerrarEntrega(): void { this.modalEntrega = null; this.subiendo = false; }

  registrarEntrega(): void {
    const m = this.modalEntrega;
    if (!m || this.subiendo) return;
    const items = m.entrega.items.map((i) => ({ itemId: i.id, cantidadEntregada: Math.max(0, Math.floor(Number(m.cantidades[i.id]) || 0)) }));
    if (!items.some((i) => i.cantidadEntregada > 0)) { this.toast.warning('Falta la cantidad', 'Indica al menos un producto entregado.'); return; }
    const fotos = m.fotos.filter((f) => f.remoto && !f.error);
    if (fotos.length < 1) { this.toast.warning('Falta la evidencia', 'Sube al menos una foto de la entrega.'); return; }
    // Lo último de la entrega: quien recibe escribe su nombre y firma en pantalla.
    m.firmando = true;
  }

  cancelarFirma(): void { if (this.modalEntrega) this.modalEntrega.firmando = false; }

  confirmarConFirma(firma: FirmaCapturada): void {
    const m = this.modalEntrega;
    if (!m) return;
    const items = m.entrega.items.map((i) => ({ itemId: i.id, cantidadEntregada: Math.max(0, Math.floor(Number(m.cantidades[i.id]) || 0)) }));
    const fotos = m.fotos.filter((f) => f.remoto && !f.error);
    this.guardando = true;
    this.api.registrarEntrega(m.entrega.id, items, fotos.map((f) => ({ url: f.remoto, nombre: f.nombre })), { recibeNombre: firma.nombre.trim(), firmaRecibe: firma.imagen }, m.nota.trim() || undefined).subscribe({
      next: () => { this.guardando = false; this.cerrarEntrega(); this.cargarEntregas(); this.toast.success('Entrega registrada', 'El stock se descontó y quedó la firma de quien recibió.'); },
      error: (e) => { this.guardando = false; m.firmando = false; this.toast.error('No se pudo registrar la entrega', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  abrirOmitir(entrega: EntregaDotacionApi): void { this.modalOmitir = { entrega, motivo: '' }; }

  omitir(): void {
    const m = this.modalOmitir;
    if (!m) return;
    if (m.motivo.trim().length < 5) { this.toast.warning('Falta el motivo', 'Escribe al menos 5 caracteres.'); return; }
    this.guardando = true;
    this.api.omitirEntrega(m.entrega.id, m.motivo.trim()).subscribe({
      next: () => { this.guardando = false; this.modalOmitir = null; this.cargarEntregas(); this.toast.success('Entrega omitida', ''); },
      error: (e) => { this.guardando = false; this.toast.error('No se pudo omitir', mensajeDe(e, 'Inténtalo de nuevo.')); },
    });
  }

  verEntrega(e: EntregaDotacionApi): void {
    this.detalle = e;
    this.firmaDetalle = null;
    if (e.firmada) this.api.firmaEntrega(e.id).subscribe({ next: (r) => { if (this.detalle?.id === e.id) this.firmaDetalle = r.firma; }, error: () => (this.firmaDetalle = null) });
  }

  /** Las evidencias tienen la misma forma que los adjuntos de una tarea: se muestran con el mismo componente. */
  evidenciasDe(e: EntregaDotacionApi): AdjuntoTareaApi[] {
    return e.evidencias.map((v) => ({ id: v.id, etapa: 'RESPUESTA', key: v.key, nombre: v.nombre, mime: v.mime, tamanioBytes: 0, tipo: 'IMAGEN' }));
  }
}
