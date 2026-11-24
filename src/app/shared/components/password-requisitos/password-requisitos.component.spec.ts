import { TestBed } from '@angular/core/testing';
import { PasswordRequisitosComponent } from './password-requisitos.component';
import { LucideAngularModule } from 'lucide-angular';
import { EASYDRY_ICONS } from '../../icons/lucide-icons';

describe('PasswordRequisitosComponent', () => {
  const crear = (password: string, email = '') => {
    const fixture = TestBed.createComponent(PasswordRequisitosComponent);
    fixture.componentInstance.password = password;
    fixture.componentInstance.email = email;
    fixture.detectChanges();
    const filas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li')) as HTMLElement[];
    return { fixture, filas };
  };

  beforeEach(() => TestBed.configureTestingModule({ imports: [PasswordRequisitosComponent, LucideAngularModule.pick(EASYDRY_ICONS)] }));

  it('con el campo vacío muestra el requisito en gris, sin marcarlo como fallido', () => {
    const { filas } = crear('');
    expect(filas.length).toBe(1);
    expect(filas[0].classList.contains('text-slate-500')).toBeTrue();
    expect(filas[0].classList.contains('text-rose-600')).toBeFalse();
  });

  it('mientras se escribe, en rojo si tiene menos de 8 caracteres', () => {
    const { filas } = crear('lavado');
    expect(filas[0].classList.contains('text-rose-600')).toBeTrue();
    expect(filas[0].textContent).toContain('Al menos 8 caracteres');
  });

  it('con 8 o más caracteres queda en verde, sin importar cuáles sean', () => {
    const { filas } = crear('lavadoseco');
    expect(filas.every((f) => f.classList.contains('text-emerald-600'))).toBeTrue();
  });

  it('se actualiza al cambiar la contraseña', () => {
    const { fixture } = crear('abc');
    fixture.componentInstance.password = 'abcdefgh';
    fixture.detectChanges();
    const filas = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li')) as HTMLElement[];
    expect(filas.every((f) => f.classList.contains('text-emerald-600'))).toBeTrue();
  });
});
