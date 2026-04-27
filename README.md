# SalubApp 🇨🇮🇸🇳🇨🇲

Plateforme citoyenne **mobile-first** pour signaler les problèmes d'**insalubrité** et d'**incivisme** dans les villes d'Afrique francophone.

## ✨ Fonctionnalités

- 📱 **Connexion par SMS** (numéro de téléphone + code OTP)
- 📸 **Signalement** avec photo et géolocalisation GPS
- 🗺️ **Carte interactive** (OpenStreetMap + Leaflet) de tous les signalements
- 👍 **Vote citoyen** : soutenez les signalements importants
- 🛡️ **Tableau de bord autorité** : suivi des statuts (nouveau / en cours / résolu / rejeté)
- 📊 **Export CSV** des signalements
- 🇫🇷 **100 % en français**

## 🧱 Stack

- **Frontend** : React 19 + TanStack Start + Vite + Tailwind v4 + shadcn/ui
- **Backend** : Lovable Cloud (Postgres + Auth + Storage managés)
- **Carte** : Leaflet + OpenStreetMap (sans clé API)

## ⚙️ Configuration requise

### 1. Activer la connexion par SMS

1. Ouvrir **Lovable Cloud → Users → Authentication Settings → Phone**
2. Activer le provider **Phone**
3. Renseigner les credentials d'un fournisseur SMS (Twilio, Messagebird, Vonage…)
4. Désactiver la confirmation par e-mail (non utilisée ici)

### 2. Promouvoir un compte autorité

Par défaut, chaque nouvel utilisateur est `citoyen`. Pour donner accès au tableau de bord :

```sql
INSERT INTO public.user_roles (user_id, role) VALUES ('<uuid-utilisateur>', 'autorite');
```

## 🚀 Déploiement

Cliquer sur **Publish** dans l'éditeur Lovable. L'application est servie sur un sous-domaine `*.lovable.app` (HTTPS, CDN global).

## 📐 Modèle de données

- `reports` — signalements (catégorie, description, photo, GPS, statut, votes)
- `report_votes` — un vote par citoyen / signalement
- `user_roles` — rôle (`citoyen`, `autorite`, `admin`)
- Bucket `report-photos` — stockage public des photos

Toutes les tables sont protégées par **Row-Level Security**.

## 🧭 Routes

- `/` — fil public + carte
- `/login` — connexion par SMS
- `/signaler` — formulaire de signalement (auth requise)
- `/dashboard` — tableau de bord autorité (rôle requis)

## 🌍 Optimisations Afrique

- Photos lazy-loadées et compressées côté navigateur
- Géolocalisation tolérante (timeout 15 s, cache 1 min)
- UI gros boutons, peu de texte technique
- Indicatifs internationaux gérés (+225, +221, +237…)