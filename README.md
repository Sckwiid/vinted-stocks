# Vinted Stocks (GitHub Pages)

Mini app statique pour gerer vos stocks Vinted a 3 utilisateurs.

## Fonctionnalites

- Login 3 utilisateurs: Anthony, Julien et Compte pro
- Liste des articles avec:
  - Photo
  - Qui a mis en vente (Anthony, Julien, Compte pro, ou plusieurs personnes cochees avec badges colores)
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
- Filtres avances: exclusion vendeur (Anthony/Julien/Compte pro) et gestion affichage stock 0
- Vue detail article avec galerie multi-images
- Ajout d'articles sur une page dediee
- Historique des prix de vente
- Sync partage multi-PC via Firebase Realtime Database (optionnel)
- Bouton manuel `Pousser stock` pour forcer l'envoi complet du stock vers la sync cloud
- Cache local `localStorage` (fallback)

## Utilisateurs

- `anthony`
- `julien`
- `compte pro` ou `compte-pro`

Le login utilise des hash SHA-256 dans `config.js` (pas de mot de passe en clair dans le code).
Sur GitHub Pages, le workflow peut generer ces hash depuis les GitHub Secrets:

- `ANTHONY_PASSWORD`
- `JULIEN_PASSWORD`
- `COMPTE_PRO_PASSWORD`

Pour la sync multi-appareils, le workflow peut aussi injecter la config Firebase depuis les GitHub Secrets:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_PATH` (optionnel)
- `FIREBASE_ENABLED` (optionnel, `true` ou `false`)

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

## Partage entre plusieurs PC (Anthony + Julien + Compte pro)

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
    julien: { passwordHash: "..." },
    "compte-pro": { passwordHash: "..." }
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

Les changements de stock sont synchronises automatiquement quand Firebase est active.
Le bouton `Pousser stock` sert a forcer l'envoi complet du stock local vers la base cloud.

Important: GitHub Pages ne peut pas pousser le stock dans le repo GitHub directement sans exposer un token GitHub dans le navigateur. Pour garder une solution propre, GitHub sert le site et Firebase stocke les donnees partagees.

### Si le badge reste sur `Sync local`

Ouvrir l'URL suivante dans le navigateur:

```text
https://sckwiid.github.io/vinted-stocks/config.js
```

La partie `sync` doit contenir `enabled: true` et les champs Firebase remplis.
Si tu vois encore `enabled: false` et des valeurs vides, GitHub Pages publie le fichier brut du repo au lieu du fichier genere par GitHub Actions.

Dans ce cas:

1. Aller dans `Settings > Pages`.
2. Mettre `Source` sur `GitHub Actions`.
3. Aller dans `Actions > Deploy static content to Pages`.
4. Lancer `Run workflow`.
5. Recharger le site avec un hard refresh.

## Deploiement GitHub Pages

1. Pousser ces fichiers sur un repo GitHub (`main`).
2. `Settings > Pages`.
3. `Source: GitHub Actions` ou `Deploy from a branch` (les deux fonctionnent pour site statique).
4. Ouvrir l'URL Pages.

## Important (securite)

Le login reste cote client (front-end). Ce n'est pas une auth serveur forte.

Pour production, securiser les regles Firebase (pas `read/write=true`) et ajouter une vraie auth serveur.
