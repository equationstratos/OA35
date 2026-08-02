/**
 * Historique du plan de travail : permet de revenir en arrière après une
 * fausse manœuvre, sans avoir à tout reprendre depuis le début.
 *
 * On mémorise des ÉTATS COMPLETS (placements, entretoises, pièces masquées)
 * plutôt que des actions inversables. Les actions du viewer sont hétérogènes
 * — poser une contrainte, déplacer au curseur, assembler le châssis, masquer
 * une pièce — et écrire l'inverse de chacune multiplierait les occasions de
 * se tromper. Un instantané se compare et se restaure de la même façon quelle
 * que soit l'action qui l'a produit.
 *
 * Les états sont clonés à l'enregistrement : sans ça, l'historique
 * pointerait sur les objets vivants, que la suite de la session modifie.
 */

const LIMIT = 50;

const clone = (state) => JSON.parse(JSON.stringify(state));

export function createHistory() {
  /** @type {object[]} */
  const past = [];
  /** @type {object[]} */
  const future = [];
  let current = null;

  return {
    /** Fixe l'état de départ, sans créer de point de retour. */
    reset(state) {
      past.length = 0;
      future.length = 0;
      current = clone(state);
    },

    /**
     * Enregistre un nouvel état. Sans effet si rien n'a changé : les
     * gestionnaires du viewer sauvegardent parfois sans modification (un clic
     * qui ne déplace rien), et ces doublons rendraient l'annulation
     * imprévisible — il faudrait appuyer plusieurs fois pour un seul effet.
     */
    push(state) {
      const next = clone(state);
      if (current && JSON.stringify(current) === JSON.stringify(next)) return false;
      if (current) past.push(current);
      if (past.length > LIMIT) past.shift();
      current = next;
      future.length = 0;
      return true;
    },

    /** @returns {object|null} état précédent, ou null s'il n'y en a pas */
    undo() {
      if (!past.length) return null;
      future.push(current);
      current = past.pop();
      return clone(current);
    },

    /** @returns {object|null} état rétabli, ou null s'il n'y en a pas */
    redo() {
      if (!future.length) return null;
      past.push(current);
      current = future.pop();
      return clone(current);
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
