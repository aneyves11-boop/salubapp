import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryEmoji, categoryLabel, statusInfo } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ThumbsUp, MapPin, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Report = Database["public"]["Tables"]["reports"]["Row"];

export function ReportCard({ report, hasVoted, onVoteChange }: {
  report: Report; hasVoted: boolean; onVoteChange: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [verifBusy, setVerifBusy] = useState(false);
  const [myVerif, setMyVerif] = useState<boolean | null>(null);
  const status = statusInfo(report.status);
  const created = new Date(report.created_at);

  useEffect(() => {
    if (!user) { setMyVerif(null); return; }
    supabase.from("report_verifications").select("is_true")
      .eq("report_id", report.id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setMyVerif(data?.is_true ?? null));
  }, [user, report.id]);

  const verify = async (isTrue: boolean) => {
    if (!user) { toast.info("Connectez-vous pour vérifier"); return; }
    setVerifBusy(true);
    if (myVerif === isTrue) {
      await supabase.from("report_verifications").delete()
        .eq("report_id", report.id).eq("user_id", user.id);
      setMyVerif(null);
    } else {
      const { error } = await supabase.from("report_verifications")
        .upsert({ report_id: report.id, user_id: user.id, is_true: isTrue }, { onConflict: "report_id,user_id" });
      if (error) toast.error(error.message); else setMyVerif(isTrue);
    }
    setVerifBusy(false);
    onVoteChange();
  };

  const verifBadge = () => {
    switch (report.verified_status) {
      case "valide": return <Badge className="bg-emerald-100 text-emerald-700 gap-1"><ShieldCheck className="h-3 w-3" />Vérifié</Badge>;
      case "rejete": return <Badge className="bg-red-100 text-red-700 gap-1"><XCircle className="h-3 w-3" />Rejeté</Badge>;
      case "douteux": return <Badge className="bg-amber-100 text-amber-700 gap-1"><AlertTriangle className="h-3 w-3" />Douteux</Badge>;
      default: return null;
    }
  };

  const toggleVote = async () => {
    if (!user) { toast.info("Connectez-vous pour voter"); return; }
    setBusy(true);
    if (hasVoted) {
      await supabase.from("report_votes").delete().eq("report_id", report.id).eq("user_id", user.id);
    } else {
      const { error } = await supabase.from("report_votes").insert({ report_id: report.id, user_id: user.id });
      if (error && !error.message.includes("duplicate")) toast.error(error.message);
    }
    setBusy(false);
    onVoteChange();
  };

  return (
    <Card className="overflow-hidden">
      {report.photo_url && (
        <img src={report.photo_url} alt={categoryLabel(report.category)} loading="lazy"
          className="h-48 w-full object-cover" />
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{categoryEmoji(report.category)}</span>
            <div>
              <div className="text-sm font-semibold leading-tight">{categoryLabel(report.category)}</div>
              <div className="text-xs text-muted-foreground">{created.toLocaleDateString("fr-FR")}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={status.color}>{status.label}</Badge>
            {verifBadge()}
          </div>
        </div>
        <p className="text-sm">{report.description}</p>
        {report.ville && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {report.ville}
          </div>
        )}

        <div className="flex items-center gap-2 border-t pt-2 text-xs">
          <span className="text-muted-foreground">Vérification :</span>
          <Button size="sm" variant={myVerif === true ? "default" : "outline"}
            disabled={verifBusy} onClick={() => verify(true)}
            className={`h-7 gap-1 px-2 ${myVerif === true ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
            <CheckCircle2 className="h-3 w-3" /> Vrai · {report.true_count}
          </Button>
          <Button size="sm" variant={myVerif === false ? "default" : "outline"}
            disabled={verifBusy} onClick={() => verify(false)}
            className={`h-7 gap-1 px-2 ${myVerif === false ? "bg-red-600 hover:bg-red-700" : ""}`}>
            <XCircle className="h-3 w-3" /> Faux · {report.false_count}
          </Button>
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button variant={hasVoted ? "default" : "outline"} size="sm" onClick={toggleVote} disabled={busy} className="gap-1">
            <ThumbsUp className="h-4 w-4" />
            {report.votes_count} {hasVoted ? "Voté" : "Soutenir"}
          </Button>
          <Link to="/" search={{}} className="text-xs text-muted-foreground hover:underline"
            onClick={(e) => {
              e.preventDefault();
              window.open(`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}#map=18/${report.latitude}/${report.longitude}`, "_blank");
            }}>
            Voir sur la carte ↗
          </Link>
        </div>
      </div>
    </Card>
  );
}