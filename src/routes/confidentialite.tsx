import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { ShieldCheck, Lock, Eye, Trash2, Mail, MapPin, Camera } from "lucide-react";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({ meta: [
    { title: "Politique de confidentialité — SalubApp" },
    { name: "description", content: "Comment SalubApp protège votre vie privée : mode anonyme, floutage des visages, anonymisation des coordonnées GPS." },
  ]}),
  component: PrivacyPage,
});

function PrivacyPage() {
  const updated = "30 avril 2026";
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 pb-24">
        <Link to="/" className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground">← Retour</Link>

        <header className="mb-8">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold">Politique de confidentialité</h1>
          <p className="mt-2 text-sm text-muted-foreground">Dernière mise à jour : {updated}</p>
          <p className="mt-4 text-base text-muted-foreground">
            SalubApp est une plateforme citoyenne de signalement de l'insalubrité urbaine et des
            chantiers à Abidjan. Cette politique explique, en termes simples, quelles données nous
            collectons, pourquoi, et comment nous les protégeons.
          </p>
        </header>

        <Card className="mb-6 border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-emerald-900">
            <Lock className="h-5 w-5" /> En résumé
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-emerald-900/90">
            <li>• L'application fonctionne en <strong>mode anonyme</strong> : aucune inscription, ni email, ni numéro de téléphone n'est demandé.</li>
            <li>• Les <strong>visages sont automatiquement floutés</strong> sur votre appareil, avant l'envoi de la photo.</li>
            <li>• Les <strong>coordonnées GPS exactes ne sont pas affichées publiquement</strong> ; les visiteurs voient une position arrondie (~ 100 m).</li>
            <li>• Aucune donnée n'est revendue. SalubApp est utilisé pour aider les autorités locales à intervenir.</li>
          </ul>
        </Card>

        <Section icon={Eye} title="1. Données que nous collectons">
          <p>Lorsque vous utilisez SalubApp, nous collectons uniquement ce qui est nécessaire au signalement :</p>
          <ul>
            <li><strong>Photo</strong> du problème (facultative, mais fortement recommandée) — les visages sont floutés sur votre appareil avant l'envoi.</li>
            <li><strong>Position GPS</strong> du signalement (latitude / longitude), strictement limitée à la zone du Grand Abidjan.</li>
            <li><strong>Catégorie</strong> et <strong>description</strong> textuelle du problème.</li>
            <li><strong>Quartier / ville</strong> (facultatif, saisi par vous).</li>
            <li>Un <strong>identifiant technique anonyme</strong> généré par le mode invité, qui ne contient ni nom, ni email, ni téléphone, ni IP. Il sert uniquement à éviter les votes/commentaires en double.</li>
            <li><strong>Date et heure</strong> du signalement.</li>
          </ul>
          <p>
            Nous ne collectons <strong>pas</strong> : votre nom, votre email, votre numéro de téléphone,
            votre adresse IP, ni aucune information de votre carnet d'adresses ou de votre galerie hors
            des photos que vous choisissez explicitement de joindre.
          </p>
        </Section>

        <Section icon={MapPin} title="2. Localisation : pourquoi et comment ?">
          <p>
            La position GPS est <strong>essentielle</strong> : elle permet aux autorités d'intervenir au bon endroit.
          </p>
          <ul>
            <li>Elle n'est récupérée qu'au moment où vous appuyez sur « Envoyer le signalement ».</li>
            <li>Elle est strictement limitée à la zone d'Abidjan ; toute position en dehors est refusée.</li>
            <li>La coordonnée <strong>exacte</strong> n'est visible que par les autorités habilitées (rôle « autorite ») et les administrateurs.</li>
            <li>Pour le grand public et la carte thermique, les coordonnées sont <strong>arrondies à environ 100 mètres</strong>, ce qui empêche d'identifier précisément un domicile.</li>
          </ul>
        </Section>

        <Section icon={Camera} title="3. Photos : floutage automatique des visages">
          <p>
            Avant tout envoi, vos photos sont analysées <strong>directement dans votre navigateur</strong> :
            les visages détectés sont floutés automatiquement, et c'est uniquement la version floutée qui
            est transmise aux serveurs.
          </p>
          <p>
            Les photos sont également passées au crible d'un filtre IA pour vérifier qu'elles concernent
            bien un problème d'insalubrité ou de voirie. Les images sans rapport (selfies, captures
            d'écran, photos d'objets personnels…) sont automatiquement <strong>refusées</strong> et ne
            sont jamais stockées sur nos serveurs.
          </p>
        </Section>

        <Section icon={ShieldCheck} title="4. Qui peut voir vos signalements ?">
          <ul>
            <li><strong>Le grand public</strong> : voit la photo, la catégorie, la description, le quartier, et la position arrondie. <em>Pas</em> d'identifiant utilisateur, <em>pas</em> de coordonnées exactes.</li>
            <li><strong>Les autorités locales</strong> (rôle « autorite ») : voient les coordonnées exactes pour pouvoir intervenir, mais <em>pas</em> votre identifiant anonyme.</li>
            <li><strong>Les administrateurs</strong> : peuvent modérer les signalements (validation, rejet, suppression d'images frauduleuses).</li>
          </ul>
        </Section>

        <Section icon={Lock} title="5. Sécurité technique">
          <ul>
            <li>Les données sont chiffrées en transit (HTTPS) et au repos.</li>
            <li>L'accès aux données est protégé par des règles strictes de sécurité au niveau de la base (RLS).</li>
            <li>L'inscription par email, SMS ou Google est <strong>actuellement désactivée</strong> pour éviter toute collecte d'identifiants personnels.</li>
          </ul>
        </Section>

        <Section icon={Trash2} title="6. Vos droits">
          <p>Conformément aux principes de protection des données :</p>
          <ul>
            <li>Vous pouvez à tout moment <strong>supprimer un signalement</strong> que vous avez créé, depuis le fil.</li>
            <li>Vous pouvez <strong>vous déconnecter</strong> via l'icône en haut à droite ; cela révoque immédiatement votre session anonyme.</li>
            <li>Vous pouvez demander la suppression complète d'une donnée publique (par exemple si elle révèle des informations sensibles) en nous contactant.</li>
          </ul>
        </Section>

        <Section icon={Mail} title="7. Contact">
          <p>
            Pour toute question concernant cette politique ou pour exercer vos droits, écrivez-nous via
            le formulaire de contact de votre municipalité partenaire ou via le canal officiel SalubApp
            communiqué par les autorités locales.
          </p>
        </Section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Cette politique peut évoluer pour refléter de nouvelles fonctionnalités. La date de dernière
          mise à jour est indiquée en haut de cette page.
        </p>
      </main>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof ShieldCheck; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}