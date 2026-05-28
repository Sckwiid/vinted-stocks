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

## Comptes par defaut

- `anthony` / `stock123`
- `julien` / `stock123`

## Lancer en local

Option 1: ouvrir directement `index.html` dans le navigateur.

Option 2: serveur local simple:

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Deploiement GitHub Pages

1. Pousser ces fichiers sur un repo GitHub.
2. Dans GitHub: `Settings > Pages`.
3. Source: `Deploy from a branch`.
4. Choisir la branche (`main` par ex.) et dossier `/ (root)`.
5. Sauvegarder, puis ouvrir l'URL fournie par GitHub Pages.

## Important (securite)

Le login est 100% cote client (front-end) et sert a separer visuellement les 2 utilisateurs.
Ce n'est pas un systeme d'authentification securise.

Pour une vraie securite multi-utilisateur, il faut un back-end (API + base de donnees + auth serveur).
