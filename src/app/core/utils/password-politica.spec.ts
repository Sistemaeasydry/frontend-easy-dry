import { motivoPasswordDebil, passwordCumplePolitica, PASSWORD_MENSAJE, requisitosPassword } from './password-politica';

/** Debe dar lo mismo que la política del backend (`backend-easydry/src/common/utils/password-politica.spec.ts`): solo cuenta el largo. */
describe('política de contraseñas (panel web)', () => {
  it('acepta cualquier contraseña de 8 o más caracteres', () => {
    for (const clave of ['12345678', 'lavadoseco', 'LAVADOSECO', 'Lavado#2026Seco', 'password']) {
      expect(passwordCumplePolitica(clave)).withContext(clave).toBeTrue();
    }
  });

  it('rechaza las de menos de 8 caracteres', () => {
    for (const clave of ['', 'a', 'Ab1#xyz', '1234567']) {
      expect(motivoPasswordDebil(clave)).withContext(clave).toBe(PASSWORD_MENSAJE);
    }
  });

  it('el mínimo es de 8 caracteres', () => {
    expect(passwordCumplePolitica('abcdefgh')).toBeTrue();
    expect(passwordCumplePolitica('abcdefg')).toBeFalse();
  });

  it('el requisito en vivo es uno solo y coincide con la política', () => {
    for (const clave of ['', 'a', 'abcdefg', 'abcdefgh', 'Lavado#2026Seco']) {
      const r = requisitosPassword(clave);
      expect(r.length).toBe(1);
      expect(r[0].cumple).withContext(clave).toBe(passwordCumplePolitica(clave));
    }
  });
});
