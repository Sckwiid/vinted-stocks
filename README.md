# Vinted Stocks (GitHub Pages)

Mini app statique pour gerer vos stocks Vinted a 2 utilisateurs.

## Fonctionnalites

- Login 2 utilisateurs: Anthony et Julien
- Liste des articles avec:
  - Photo
  - Qui a mis en vente (badge colore)
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
- Persistance locale via `localStorage`

## Utilisateurs

- `anthony`
- `julien`

Les mots de passe ne sont plus stockes en dur dans le code. Ils sont injectes via GitHub Secrets pendant le deploiement.

## Lancer en local

Avant de tester en local, renseigner les hash dans `config.js`.

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

## Configuration des mots de passe (GitHub Secrets)

Dans le repo GitHub, ajouter ces secrets:

- `ANTHONY_PASSWORD`
- `JULIEN_PASSWORD`

Le workflow calcule automatiquement les hash SHA-256 et genere `config.js` au build.

## Deploiement GitHub Pages

1. Pousser ces fichiers sur un repo GitHub (branche `main`).
2. Ajouter les secrets `ANTHONY_PASSWORD` et `JULIEN_PASSWORD`.
3. Dans GitHub: `Settings > Pages`.
4. Dans `Build and deployment`, choisir `Source: GitHub Actions`.
5. Le workflow `.github/workflows/deploy-pages.yml` va deployer automatiquement.

## Important (securite)

Le login reste 100% cote client (front-end) et sert a separer visuellement les 2 utilisateurs.
Ce n'est pas un systeme d'authentification serveur.

Pour une vraie securite multi-utilisateur, il faut un back-end (API + base de donnees + auth serveur).
