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
- Sync partage multi-PC via Firebase Auth + Realtime Database
- Bouton manuel `Pousser stock` pour forcer l'envoi complet du stock vers la sync cloud
- Cache local `localStorage` (fallback)

## Utilisateurs

- `anthony`
- `julien`
- `compte pro` ou `compte-pro`

Avec Firebase active, les mots de passe passent par Firebase Auth.
GitHub Pages ne doit publier ni mot de passe, ni hash, ni cle privee.

Pour la sync multi-appareils avec Firebase:

- `FIREBASE_ENABLED`: `true`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Ces valeurs ne sont pas stockees dans le repo si tu les mets dans GitHub Secrets.
Elles seront visibles dans le `config.js` genere par GitHub Pages, car un site statique doit les envoyer au navigateur.
La securite doit venir de Firebase Auth + des regles Realtime Database.

## Lancer en local

Option 1: ouvrir directement `index.html` dans le navigateur.

Option 2: serveur local simple:

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

Pour tester la sync en local, mets temporairement `sync.enabled: true` et les champs `sync.firebase`
dans `config.js`.

Le fallback par hash dans `config.js` existe seulement pour un test local hors prod.
Ne pousse pas de hash de mot de passe dans un repo public.

## Partage entre plusieurs PC avec Firebase

Le site GitHub Pages ne doit pas contenir de cle backend, token GitHub, mot de passe ou hash.
Avec Firebase, la config web est publique par design. Elle ne suffit pas a lire/ecrire si les regles Firebase sont correctes.

### 1. Creer les comptes Firebase Auth

Dans Firebase Console:

1. Aller dans `Authentication`.
2. Activer `Email/Password`.
3. Creer ces 3 utilisateurs:

- `anthony@vinted-stocks.app`
- `julien@vinted-stocks.app`
- `compte-pro@vinted-stocks.app`

Utilise les mots de passe que tu veux pour chacun.
Recupere les `uid` des 3 utilisateurs dans Firebase Auth.

### 2. Configurer Realtime Database

Dans Realtime Database, mets des regles comme ca en remplacant les UID:

```json
{
  "rules": {
    "allowedUsers": {
      "$uid": {
        ".read": false,
        ".write": false
      }
    },
    "vinted-stocks": {
      "shared": {
        "products": {
          ".read": "auth != null && root.child('allowedUsers').child(auth.uid).val() === true",
          ".write": "auth != null && root.child('allowedUsers').child(auth.uid).val() === true"
        }
      }
    }
  }
}
```

Ensuite ajoute les UID autorises dans les donnees:

```json
{
  "allowedUsers": {
    "UID_ANTHONY": true,
    "UID_JULIEN": true,
    "UID_COMPTE_PRO": true
  }
}
```

Sans cette whitelist, quelqu'un pourrait creer un compte Firebase et acceder a la base si tes regles sont trop larges.

### 3. Configurer GitHub Actions

Dans GitHub `Settings > Secrets and variables > Actions`, ajoute:

- `FIREBASE_ENABLED`: `true`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Relance ensuite `Actions > Deploy static content to Pages > Run workflow`.

Le badge en haut doit afficher `Sync partage`.
Les changements de stock sont synchronises automatiquement.
Le bouton `Pousser stock` force l'envoi complet du stock local vers Firebase.

### Si le badge reste sur `Sync local`

Ouvrir l'URL suivante dans le navigateur:

```text
https://sckwiid.github.io/vinted-stocks/config.js
```

La partie `sync` doit contenir `provider: "firebase"`, `enabled: true` et les champs `firebase` remplis.
Si tu vois encore `enabled: false`, GitHub Pages publie le fichier brut du repo ou le workflow ne recoit pas `FIREBASE_ENABLED=true`.
Les `passwordHash` doivent rester vides sur GitHub Pages.

Dans ce cas:

1. Aller dans `Settings > Pages`.
2. Mettre `Source` sur `GitHub Actions`.
3. Aller dans `Actions > Deploy static content to Pages`.
4. Lancer `Run workflow`.
5. Recharger le site avec un hard refresh.

### Si GitHub Actions affiche `in progress deployment`

Ce n'est pas une erreur de sync. GitHub Pages refuse juste de lancer deux deploiements en meme temps.

Dans ce cas:

1. Attendre 1 a 2 minutes que l'ancien deploiement se termine.
2. Si ca reste bloque, ouvrir le run/deployment indique dans l'erreur et cliquer `Cancel workflow` ou `Cancel deployment`.
3. Verifier que `Settings > Pages > Source` est bien sur `GitHub Actions`.
4. Relancer `Actions > Deploy static content to Pages > Run workflow`.

Le workflow est configure pour mettre les deploiements en file d'attente et eviter ce conflit sur les prochains runs.

## Deploiement GitHub Pages

1. Pousser ces fichiers sur un repo GitHub (`main`).
2. `Settings > Pages`.
3. `Source: GitHub Actions` obligatoire si tu utilises les GitHub Secrets pour Firebase.
4. Ouvrir l'URL Pages.

## Important (securite)

Les valeurs Firebase web seront visibles dans le front apres build.
C'est normal pour Firebase: la cle web identifie ton projet, elle ne doit pas etre utilisee comme un secret.
La vraie protection est:

- Firebase Auth
- regles Realtime Database strictes
- whitelist des UID autorises

Un login uniquement en JavaScript avec des hash publics ne protege pas vraiment les donnees.
Pour le site public sans Worker, utilise Firebase Auth + regles strictes.
