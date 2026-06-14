# Vinted Stocks (GitHub Pages + Netlify API)

Mini app statique pour gerer vos stocks Vinted a 3 utilisateurs:

- `anthony`
- `julien`
- `compte pro` ou `compte-pro`

Le site GitHub Pages ne contient pas de mot de passe, pas de hash et pas de cle serveur.
La sync passe par une API Netlify Function gratuite, avec stockage Netlify Blobs.

## Architecture

- GitHub Pages sert le frontend: `index.html`, `app.js`, `styles.css`, `config.js`.
- Netlify expose une Function HTTPS gratuite.
- Netlify Blobs stocke le JSON des articles.
- Le frontend voit seulement `API_BASE_URL`, l'URL publique de l'API Netlify.

Endpoints:

- `POST /login`
- `GET /products`
- `PUT /products`
- `PUT /products/:id`
- `DELETE /products/:id`

## Setup Netlify gratuit

### 1. Creer le site Netlify

1. Va sur Netlify.
2. Connecte ton compte GitHub.
3. Cree un nouveau site depuis le repo `vinted-stocks`.
4. Netlify detectera `netlify.toml`.

Parametres attendus:

- Build command: vide
- Publish directory: `.`
- Functions directory: `netlify/functions`

### 2. Ajouter les variables d'environnement Netlify

Dans Netlify:

`Site configuration > Environment variables`

Ajoute:

- `ANTHONY_PASSWORD`: mot de passe Anthony
- `JULIEN_PASSWORD`: mot de passe Julien
- `COMPTE_PRO_PASSWORD`: mot de passe Compte pro
- `SESSION_SECRET`: longue chaine aleatoire, 40+ caracteres

Pour generer `SESSION_SECRET`:

```bash
openssl rand -base64 48
```

### 3. Deployer Netlify

Lance un deploy Netlify depuis l'interface.

Ton API sera:

```text
https://TON-SITE.netlify.app/api
```

Teste rapidement:

```bash
curl https://TON-SITE.netlify.app/api/products
```

Sans token, tu dois recevoir:

```json
{"error":"unauthorized"}
```

## Setup GitHub Pages

Dans GitHub `Settings > Secrets and variables > Actions`, mets:

- `API_SYNC_ENABLED`: `true`
- `API_BASE_URL`: `https://TON-SITE.netlify.app/api`

Ensuite:

1. Va dans `Settings > Pages`.
2. Mets `Source` sur `GitHub Actions`.
3. Va dans `Actions > Deploy static content to Pages`.
4. Lance `Run workflow`.
5. Ouvre `https://sckwiid.github.io/vinted-stocks/`.

Le badge doit afficher `Sync partage`.

## Verifier la config publique

Ouvre:

```text
https://sckwiid.github.io/vinted-stocks/config.js
```

Tu dois voir seulement:

- `provider: "api"`
- `enabled: true`
- `api.baseUrl: "https://TON-SITE.netlify.app/api"`

Tu ne dois pas voir:

- mot de passe
- hash
- token GitHub
- cle serveur

## Test local

Lancer le frontend:

```bash
python3 -m http.server 8080
```

Puis ouvrir:

```text
http://localhost:8080
```

Pour tester avec l'API Netlify deployee, mets temporairement dans `config.js`:

```js
sync: {
  provider: "api",
  enabled: true,
  api: {
    baseUrl: "https://TON-SITE.netlify.app/api"
  }
}
```

Ne mets pas de secret dans `config.js`.

## Import commandes Temu

Le site peut importer un fichier JSON exporte par une extension navigateur.

L'extension locale est dans:

```text
temu-orders-extension
```

Pour l'installer:

1. Ouvre `chrome://extensions`.
2. Active `Mode developpeur`.
3. Clique `Charger l'extension non empaquetee`.
4. Selectionne le dossier `temu-orders-extension`.

Format attendu:

```json
{
  "source": "temu-orders-extension",
  "schemaVersion": 1,
  "exportedAt": "2026-06-13T12:00:00.000Z",
  "items": [
    {
      "title": "Soutien-gorge bandeau noir",
      "purchasePrice": 1.76,
      "quantity": 2,
      "imageUrl": "https://...",
      "productUrl": "https://www.temu.com/...",
      "orderPageUrl": "https://www.temu.com/bg_order_detail.html?...",
      "orderId": "PO-123",
      "orderDate": "2026-06-13",
      "variant": "rose / Taille de l'etiquette: M",
      "color": "rose",
      "importKey": "cle-stable-optionnelle",
      "currency": "EUR"
    }
  ]
}
```

Champs obligatoires par article:

- `title` ou `productUrl`
- `quantity` est optionnel et vaut `1` par defaut
- `purchasePrice` est optionnel
- `imageUrl`, `productUrl`, `orderPageUrl`, `orderId`, `orderDate`, `variant`, `color`, `importKey` et `currency` sont optionnels

L'import fusionne avec un article existant si `importKey` correspond deja, ou si le vrai lien produit Temu correspond deja.
Le lien de page commande (`orderPageUrl`) est affiche, mais il n'est pas utilise pour fusionner les articles.

## Securite

L'URL de l'API Netlify est publique, mais:

- `/products` refuse les requetes sans token valide;
- `PUT` et `DELETE` refusent les requetes sans token valide;
- `/login` compare les mots de passe cote Netlify, jamais dans le navigateur;
- `/login` bloque le bruteforce apres 8 erreurs en 15 minutes;
- les IP de login rate-limit sont hashees, pas stockees en clair;
- `SESSION_SECRET` reste dans Netlify.

Si quelqu'un ouvre le code du site, il ne peut pas recuperer les mots de passe ni signer un token valide.

## Si ca bloque

### Le site affiche `Sync local`

- Verifie `API_SYNC_ENABLED=true` dans GitHub Actions.
- Verifie `API_BASE_URL=https://TON-SITE.netlify.app/api`.
- Verifie que GitHub Pages utilise `Source: GitHub Actions`.
- Relance le workflow Pages.

### Login refuse

- Verifie les variables Netlify `ANTHONY_PASSWORD`, `JULIEN_PASSWORD`, `COMPTE_PRO_PASSWORD`.
- Redeploie Netlify apres modification des variables.

### Stock inaccessible

- Ouvre les logs Netlify Functions.
- Verifie que l'URL finit bien par `/api`.
