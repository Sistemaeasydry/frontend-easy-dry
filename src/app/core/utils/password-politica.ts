/** Debe coincidir con `backend-easydry/src/common/utils/password-politica.ts` (el servidor es quien la exige de verdad). */
export const PASSWORD_LARGO_MINIMO = 8;
export const PASSWORD_MENSAJE = `La contraseña debe tener al menos ${PASSWORD_LARGO_MINIMO} caracteres.`;

/** Motivo por el que la contraseña no sirve, o `null` si cumple la política (solo se exige el largo mínimo). El correo ya no se usa. */
export function motivoPasswordDebil(password: string | null | undefined, _email?: string): string | null {
  return (password ?? '').trim().length >= PASSWORD_LARGO_MINIMO ? null : PASSWORD_MENSAJE;
}

export function passwordCumplePolitica(password: string | null | undefined, email?: string): boolean {
  return motivoPasswordDebil(password, email) === null;
}

export interface RequisitoPassword {
  clave: string;
  texto: string;
  cumple: boolean;
}

/** La única condición de la política, para mostrarla en vivo mientras se escribe. */
export function requisitosPassword(password: string | null | undefined, _email?: string): RequisitoPassword[] {
  return [{ clave: 'largo', texto: `Al menos ${PASSWORD_LARGO_MINIMO} caracteres`, cumple: (password ?? '').trim().length >= PASSWORD_LARGO_MINIMO }];
}
