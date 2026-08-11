/**
 * LES LIVRÉES — jeux de couleurs prêts à poser sur tout le build.
 *
 * Une livrée n'est pas une teinte de plus dans le sélecteur de pièce : c'est
 * un ensemble cohérent, appliqué d'un clic à tout ce qui se peint sur ce
 * drone. Cinq familles, et chacune a sa raison d'être :
 *
 *  - LES PIÈCES IMPRIMÉES — covers, joues, supports, patins, caches. C'est la
 *    couleur qu'on voit de loin, celle qui donne son nom à la livrée.
 *  - LE STICK PAD, en TPU. Matière différente, teinte propre : sur une vraie
 *    machine, la bobine de TPU souple n'est jamais du même bain que le PLA.
 *  - LES CLOCHES MOTEUR. Elles sont en aluminium anodisé, donc repeignables ;
 *    le cuivre des bobinages et l'acier de l'arbre, eux, ne bougent pas —
 *    leur matière refuse la teinte, et c'est voulu.
 *  - LE FILET DE CHANFREIN, ce liseré clair qui suit les arêtes d'usinage.
 *    Une livrée sombre demande un filet clair, une livrée claire un filet
 *    plus doux : il fait partie du jeu.
 *  - LES DEUX HÉLICES AVANT, et elles seules. C'est la convention du FPV :
 *    l'avant d'une couleur, l'arrière sombre, pour lire l'orientation de la
 *    machine d'un coup d'œil quand elle est loin. Une livrée qui peindrait
 *    les quatre ferait joli et se piloterait mal.
 *
 * Le carbone n'est pas touché : c'est du carbone, il a la couleur du carbone.
 */

/**
 * @typedef {object} Livree
 * @property {string} id
 * @property {string} name
 * @property {string} [note] ce qui la caractérise, en une ligne
 * @property {boolean} [reset] rend au build ses teintes d'usine
 * @property {string} [imprime] pièces imprimées
 * @property {string} [tpu] stick pad
 * @property {string} [moteur] cloches moteur
 * @property {string} [helice] les deux hélices avant
 * @property {string} [chanfrein] filet d'arête
 */

/** @type {Livree[]} */
export const LIVREES = [
  {
    id: 'origine',
    name: 'Origine',
    note: 'les teintes d’usine, rien de peint',
    reset: true,
    swatch: '#3a3d42',
  },
  {
    id: 'bee',
    name: 'Bee',
    note: 'jaune ruche sur noir',
    imprime: '#f2b705', tpu: '#f2b705', moteur: '#1b1d21',
    helice: '#f2b705', chanfrein: '#ffe08a',
  },
  {
    id: 'red-racing',
    name: 'Red Racing',
    note: 'rouge course',
    imprime: '#c8102e', tpu: '#c8102e', moteur: '#2a1114',
    helice: '#e01f3d', chanfrein: '#ff9aa6',
  },
  {
    id: 'spider',
    name: 'Spider',
    note: 'violet d’araignée',
    imprime: '#6b2fbf', tpu: '#7a3ad4', moteur: '#221037',
    helice: '#8b5cf6', chanfrein: '#c9a7ff',
  },
  {
    id: 'shark',
    name: 'Shark',
    note: 'bleu requin',
    imprime: '#1e6fd9', tpu: '#1e6fd9', moteur: '#10243d',
    helice: '#3b8ef0', chanfrein: '#9fd0ff',
  },
  {
    id: 'snake',
    name: 'Snake',
    note: 'vert clair de serpent',
    imprime: '#6fd44e', tpu: '#8ae06d', moteur: '#162a12',
    helice: '#7fe05c', chanfrein: '#c8ffab',
  },
  {
    id: 'girly',
    name: 'Girly',
    note: 'rose franc',
    imprime: '#ff5fa2', tpu: '#ff7fb6', moteur: '#33101f',
    helice: '#ff77b0', chanfrein: '#ffc2dc',
  },
  {
    id: 'ghost',
    name: 'Ghost',
    note: 'noir mat, filet clair',
    imprime: '#14161a', tpu: '#14161a', moteur: '#0f1114',
    helice: '#1b1e23', chanfrein: '#e9eef5',
  },
  {
    id: 'steel',
    name: 'Steel',
    note: 'gris acier',
    imprime: '#8b949e', tpu: '#7c858f', moteur: '#5b636c',
    helice: '#9aa3ad', chanfrein: '#f2f6fa',
  },
  {
    id: 'tiger',
    name: 'Tiger',
    note: 'orange tigre',
    imprime: '#ff7a18', tpu: '#ff8c33', moteur: '#231208',
    helice: '#ff8f2e', chanfrein: '#ffc48a',
  },
  {
    id: 'white-wolf',
    name: 'White Wolf',
    note: 'blanc loup',
    imprime: '#eef2f6', tpu: '#e2e8ee', moteur: '#c9d0d8',
    helice: '#f4f7fa', chanfrein: '#9fb2c4',
  },

  /* --- quatre de plus, dans le même esprit --------------------------- */
  {
    id: 'copper',
    name: 'Copper',
    note: 'cuivre chaud sur noir — la teinte des bobinages',
    imprime: '#b06a2c', tpu: '#c07a35', moteur: '#1b1d21',
    helice: '#c98a3a', chanfrein: '#ffd7a8',
  },
  {
    id: 'glacier',
    name: 'Glacier',
    note: 'blanc bleuté, filet cyan',
    imprime: '#dfe9f2', tpu: '#cfe0ee', moteur: '#7f97ab',
    helice: '#eaf3fa', chanfrein: '#6cd8ff',
  },
  {
    id: 'kaki',
    name: 'Kaki',
    note: 'vert militaire mat',
    imprime: '#5d6b3a', tpu: '#6b7a44', moteur: '#2a3019',
    helice: '#6f7f46', chanfrein: '#cbd7a6',
  },
  {
    id: 'toxic',
    name: 'Toxic',
    note: 'vert fluo sur anthracite',
    imprime: '#b6ff1a', tpu: '#c8ff4d', moteur: '#181a1d',
    helice: '#c4ff3d', chanfrein: '#e8ff9a',
  },
];

/** Ce qu'une livrée montre dans sa pastille. */
export function swatchOf(l) {
  return l.swatch || l.imprime || '#3a3d42';
}

/**
 * Teinte que reçoit une pièce sous une livrée donnée.
 *
 * Le classement se fait sur la MATIÈRE déclarée par la pièce, pas sur une
 * liste d'identifiants : ajouter demain un support imprimé le peindra sans
 * qu'on ait à revenir ici.
 *
 * @param {Livree} livree
 * @param {object} meta meta de la pièce
 * @returns {string|null} couleur, ou null pour rendre sa teinte d'usine
 */
export function colorFor(livree, meta) {
  if (livree.reset) return null;
  switch (meta.material) {
    case 'TPU souple':
      return livree.tpu || livree.imprime || null;
    case 'Moteur brushless':
      return livree.moteur || null;
    case 'Polycarbonate':
      // les DEUX AVANT seulement : l'arrière reste sombre, c'est le repère
      // d'orientation en vol
      return meta.id.includes('-av-') ? (livree.helice || null) : null;
    case 'Plastique imprimé':
      return livree.imprime || null;
    default:
      // carbone, visserie, tout le reste : on n'y touche pas
      return null;
  }
}
