import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryLabel, statusInfo } from "@/lib/categories";
import type { Database } from "@/integrations/supabase/types";
import { ThumbsUp, MapPin, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Clock, Wrench, MessageSquare, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Report = Database["public"]["Tables"]["reports"]["Row"];
type Comment = { id: string; user_email: string; content: string; created_at: string; user_id: string };

export function ReportCard({ report, hasVoted, onVoteChange }: {
  report: Report; hasVoted: boolean; onVoteChange: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [verifBusy, setVerifBusy] = useState(false);
  const [myVerif, setMyVerif] = useState<boolean | null>(null);
  const [myStatus, setMyStatus] = useState<boolean | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const status = statusInfo(report.status);
  const created = new Date(report.created_at);

  useEffect(() => {
    if (!user) { setMyVerif(null); setMyStatus(null); return; }
    supabase.from("report_verifications").select("is_true, kind")
      .eq("report_id", report.id).eq("user_id", user.id)
      .then(({ data }) => {
        const v = data?.find((d: any) => d.kind === "veracite");
        const s = data?.find((d: any) => d.kind === "persistance");
        setMyVerif(v?.is_true ?? null);
        setMyStatus(s?.is_true ?? null);
      });
  }, [user, report.id]);

  const verify = async (isTrue: boolean) => {
    if (!user) { toast.info("Connectez-vous pour vérifier"); return; }
    setVerifBusy(true);
    if (myVerif === isTrue) {
      await supabase.from("report_verifications").delete()
        .eq("report_id", report.id).eq("user_id", user.id).eq("kind", "veracite");
      setMyVerif(null);
    } else {
      const { error } = await supabase.from("report_verifications")
        .upsert({ report_id: report.id, user_id: user.id, is_true: isTrue, kind: "veracite" }, { onConflict: "report_id,user_id,kind" });
      if (error) toast.error(error.message); else setMyVerif(isTrue);
    }
    setVerifBusy(false);
    onVoteChange();
  };

  // isPersistent=true → "encore présent" ; false → "déjà résolu"
  const reportStatus = async (isPersistent: boolean) => {
    if (!user) { toast.info("Connectez-vous pour signaler le statut"); return; }
    setStatusBusy(true);
    if (myStatus === isPersistent) {
      await supabase.from("report_verifications").delete()
        .eq("report_id", report.id).eq("user_id", user.id).eq("kind", "persistance");
      setMyStatus(null);
    } else {
      const { error } = await supabase.from("report_verifications")
        .upsert({ report_id: report.id, user_id: user.id, is_true: isPersistent, kind: "persistance" }, { onConflict: "report_id,user_id,kind" });
      if (error) toast.error(error.message); else setMyStatus(isPersistent);
    }
    setStatusBusy(false);
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

  const loadComments = async () => {
    setCommentsLoading(true);
    const { data } = await (supabase as any).from("report_comments")
      .select("id, user_email, content, created_at, user_id")
      .eq("report_id", report.id)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
    setCommentsLoading(false);
  };

  const toggleComments = () => {
    if (!showComments) loadComments();
    setShowComments((v) => !v);
  };

  const submitComment = async () => {
    if (!user) { toast.info("Connectez-vous pour commenter"); return; }
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    const { error } = await (supabase as any).from("report_comments").insert({
      report_id: report.id,
      user_id: user.id,
      user_email: user.email,
      content: newComment.trim(),
    });
    if (error) { toast.error(error.message); } else {
      setNewComment("");
      await loadComments();
    }
    setSubmittingComment(false);
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

        <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
          <span className="text-muted-foreground">État sur place :</span>
          <Button size="sm" variant={myStatus === true ? "default" : "outline"}
            disabled={statusBusy} onClick={() => reportStatus(true)}
            className={`h-7 gap-1 px-2 ${myStatus === true ? "bg-amber-600 hover:bg-amber-700" : ""}`}>
            <Clock className="h-3 w-3" /> Persistant · {report.persistent_count ?? 0}
          </Button>
          <Button size="sm" variant={myStatus === false ? "default" : "outline"}
            disabled={statusBusy} onClick={() => reportStatus(false)}
            className={`h-7 gap-1 px-2 ${myStatus === false ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}>
            <Wrench className="h-3 w-3" /> Déjà résolu · {report.resolved_community_count ?? 0}
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

        <div className="border-t pt-2">
          <button onClick={toggleComments} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <MessageSquare className="h-3.5 w-3.5" />
            {showComments ? "Masquer les notes" : `Notes${comments.length > 0 ? ` (${comments.length})` : ""}`}
          </button>

          {showComments && (
            <div className="mt-3 space-y-3">
              {commentsLoading ? (
                <p className="text-xs text-muted-foreground">Chargement…</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune note pour l'instant.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2 text-muted-foreground mb-1">
                      <span className="font-medium truncate">{c.user_email}</span>
                      <span className="shrink-0">{new Date(c.created_at).toLocaleDateString("fr-FR")}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))
              )}

              {user ? (
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Ajouter une note…"
                    maxLength={500}
                    rows={2}
                    className="text-xs resize-none"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitComment(); } }}
                  />
                  <Button size="icon" variant="outline" disabled={submittingComment || !newComment.trim()} onClick={submitComment} className="shrink-0 self-end h-8 w-8">
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Connectez-vous pour laisser une note.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}