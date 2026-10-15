# SalubApp 🇨🇮

Plateforme citoyenne **mobile-first** pour signaler les problèmes d'**insalubrité**, de **voirie** et de **chantiers** dans le Grand Abidjan.

> Version indépendante : ce projet ne dépend plus de Lovable. Il tourne sur **Supabase** (base de données, auth, stockage, fonctions) et l'**API Google Gemini** (analyse des photos).

## ✨ Fonctionnalités

- 🕶️ **Mode anonyme** : aucune inscription, aucun email, aucun téléphone
- 📸 **Signalement** avec photo + GPS (limité à la zone d'Abidjan)
- 🙈 **Floutage automatique des visages** sur l'appareil (MediaPipe) avant envoi
- 🤖 **Analyse IA de la photo** (Gemini) : catégorie + description proposées, photos hors sujet refusées
- 🗺️ **Carte interactive** + carte de chaleur (Leaflet + OpenStreetMap)
- 👍 **Votes**, vérification communautaire (vrai/faux, persistant/résolu), **commentaires modérés**
- 🛡️ **Tableau de bord autorité** (`/dashboard`) : statuts + export CSV
- 🔑 **Espace admin** (`/administrator_app`) : modération signalements / commentaires / avis

## 🧱 Stack

| Couche | Outils |
|---|---|
| Frontend | React 19, TanStack Start, Vite 7, Tailwind v4, shadcn/ui |
| Backend | Supabase (Postgres + RLS, Auth anonyme, Storage, Edge Functions) |
| IA | Google Gemini 2.5 Flash (endpoint compatible OpenAI) |
| Carte | Leaflet + OpenStreetMap (sans clé API) |
| Hébergement | Cloudflare Workers (`wrangler.jsonc`) — ou tout hébergeur compatible |

## 🚀 Démarrer en local

```bash
npm install
cp .env.example .env      # puis remplir avec vos clés Supabase
npm run dev               # http://localhost:8080
```

> Sous Windows PowerShell, utilisez `npm.cmd` / `npx.cmd` si `npm` est bloqué.

## 🗄️ Mettre en place Supabase (une seule fois)

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Lier le projet et créer les tables :
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-du-projet>
   npx supabase db push
   ```
3. Activer la connexion anonyme : **Authentication → Sign In / Providers → Allow anonymous sign-ins**.
4. Déployer la fonction IA avec une clé Gemini ([aistudio.google.com](https://aistudio.google.com/apikey)) :
   ```bash
   npx supabase secrets set GEMINI_API_KEY=<votre-cle>
   npx supabase functions deploy classify-image
   ```
5. Créer le compte administrateur : **Authentication → Users → Add user** (email + mot de passe, cocher *Auto confirm*), puis dans le **SQL Editor** :
   ```sql
   INSERT INTO public.user_roles (user_id, role)
   SELECT id, 'admin' FROM auth.users WHERE email = 'votre@email.com';
   ```
   Pour un compte autorité (tableau de bord), même requête avec `'autorite'`.

## 📐 Modèle de données

- `reports` — signalements (catégorie, description, photo, GPS, statut, compteurs)
- `reports_public` — vue publique (coordonnées arrondies, sans `user_id`)
- `report_votes` — un vote par utilisateur / signalement
- `report_verifications` — vérification communautaire (`veracite` / `persistance`)
- `report_comments` — commentaires, visibles après approbation admin
- `app_feedback` — avis sur l'application (lisibles par l'admin)
- `user_roles` — rôle (`citoyen`, `autorite`, `admin`)
- Bucket `report-photos` — photos des signalements

Toutes les tables sont protégées par **Row-Level Security**.

## 🧭 Routes

| Route | Rôle |
|---|---|
| `/` | Fil public des signalements |
| `/carte` | Carte + carte de chaleur |
| `/login` | Entrée en mode anonyme |
| `/signaler` | Nouveau signalement |
| `/dashboard` | Tableau de bord autorité |
| `/administrator_app` | Administration |
| `/avis` | Donner son avis sur l'app |
| `/confidentialite` | Politique de confidentialité |

## 📜 Origine

Projet initialement créé sur Lovable par nanashi-2K1 ([dépôt d'origine](https://github.com/nanashi-2K1/mon-quartier-propre)), puis rendu indépendant.