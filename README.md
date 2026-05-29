# Vinted Stocks (GitHub Pages)

Mini app statique pour gerer vos stocks Vinted a 2 utilisateurs.

## Fonctionnalites

- Login 2 utilisateurs: Anthony et Julien
- Liste des articles avec:
  - Photo
  - Qui a mis en vente (Anthony, Julien ou Nous deux, avec badges colores)
  - Stock total
  - Quantite en vente
  - Stock disponible (stock total - en vente)
  - Seuil de stock bas
  - Lien article Vinted
- Alerte visuelle rouge quand le stock disponible est bas
- Ajout de nouveaux produits
- Actions rapides par ligne:
  - Ajouter du stock
  - Mettre a jour la mise en vente
  - Supprimer un produit
- Recherche, filtres et tris
- Sync partage multi-PC via Firebase Realtime Database (optionnel)
- Cache local `localStorage` (fallback)

## Utilisateurs

- `anthony`
- `julien`

Le login utilise des hash SHA-256 dans `config.js` (pas de mot de passe en clair dans le code).

## Lancer en local

Avant de tester, renseigner les hash dans `config.js`.

Exemple pour generer un hash SHA-256:

```bash
printf 'mon_mot_de_passe' | shasum -a 256
```

Option 1: ouvrir directement `index.html` dans le navigateur.

Option 2: serveur local simple:

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Partage entre plusieurs PC (Anthony + Julien)

Pour que les deux PC voient les memes stocks en temps reel:

1. Creer un projet Firebase.
2. Activer `Realtime Database` (region de ton choix).
3. Pour test rapide, mettre ces regles:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

4. Recuperer la config Web Firebase (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`, etc.).
5. Remplir `config.js`:

```js
window.APP_CONFIG = {
  users: {
    anthony: { passwordHash: "..." },
    julien: { passwordHash: "..." }
  },
  sync: {
    provider: "firebase",
    enabled: true,
    path: "vinted-stocks/shared/products",
    firebase: {
      apiKey: "...",
      authDomain: "...",
      databaseURL: "...",
      projectId: "...",
      storageBucket: "...",
      messagingSenderId: "...",
      appId: "..."
    }
  }
};
```

6. Deploy sur GitHub Pages.
7. Le badge en haut doit afficher `Sync partage` sur chaque PC.

## Deploiement GitHub Pages

1. Pousser ces fichiers sur un repo GitHub (`main`).
2. `Settings > Pages`.
3. `Source: GitHub Actions` ou `Deploy from a branch` (les deux fonctionnent pour site statique).
4. Ouvrir l'URL Pages.

## Important (securite)

Le login reste cote client (front-end). Ce n'est pas une auth serveur forte.

Pour production, securiser les regles Firebase (pas `read/write=true`) et ajouter une vraie auth serveur.
