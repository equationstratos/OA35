/**
 * Fiche technique du châssis, telle que fournie par le fabricant.
 *
 * C'est la seule source de cotes absolues du projet : tout le reste est
 * mesuré sur les photos. Les épaisseurs viennent d'ici, et l'empattement sert
 * de contrôle une fois les bras modélisés.
 */

export const FRAME = {
  model: 'Sub250 OasisFly35 DC',

  /**
   * Configuration « dead cat » : les bras ne sont pas répartis en croix, et
   * les bras ARRIÈRE sont les plus longs sur ce châssis. Les quatre moteurs
   * forment donc un rectangle, pas un carré — ce dont il faut tenir compte
   * pour contrôler l'empattement.
   */
  configuration: 'dead cat, bras arrière plus longs',

  /** Empattement, en mm : diagonale d'axe moteur à axe moteur. */
  wheelbaseMm: 175,

  /**
   * Rôles de pièce et épaisseurs associées, en mm.
   * Choisir le rôle d'une pièce suffit donc à lui donner la bonne épaisseur.
   */
  roles: [
    { id: 'bottom', name: 'Plaque inférieure', thickness: 1.5 },
    { id: 'mid', name: 'Plaque intermédiaire', thickness: 2.5 },
    { id: 'top', name: 'Plaque supérieure', thickness: 2.0 },
    // deux rôles distincts : sur un dead cat les deux paires n'ont pas la
    // même longueur, les confondre reviendrait à en perdre une
    { id: 'arm-front', name: 'Bras avant', thickness: 3.5 },
    { id: 'arm-rear', name: 'Bras arrière (le plus long)', thickness: 3.5 },
    { id: 'other', name: 'autre', thickness: null },
  ],
};

/** Épaisseur associée à un rôle, ou null si le rôle est libre. */
export function thicknessForRole(id) {
  const role = FRAME.roles.find((r) => r.id === id);
  return role ? role.thickness : null;
}
