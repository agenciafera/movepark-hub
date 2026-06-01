import * as React from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/context";
import { useCreateFaq, useFaqCategories, useUpdateFaq } from "./api";
import type { Faq, FaqScope } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faq?: Faq | null;
  /** Define o scope do FAQ. Travado em forms de manager (global) e operator (location). */
  scope: FaqScope;
  /** Quando scope='location', limita as locations disponíveis a uma empresa. */
  lockCompanyId?: string;
  /** Pré-seleciona uma location quando scope='location'. */
  defaultLocationId?: string;
};

type LocationOpt = { id: string; name: string; company_id: string };

function useEditableLocations(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["faq-form-locations", companyId ?? "all"],
    queryFn: async (): Promise<LocationOpt[]> => {
      let q = supabase.from("location").select("id, name, company_id").is("deleted_at", null);
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q.order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LocationOpt[];
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function FaqForm({
  open,
  onOpenChange,
  faq,
  scope,
  lockCompanyId,
  defaultLocationId,
}: Props) {
  const { session } = useAuth();
  const create = useCreateFaq();
  const update = useUpdateFaq();
  const cats = useFaqCategories();
  const locs = useEditableLocations(lockCompanyId, scope === "location" && open);

  const editing = !!faq;
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [locationId, setLocationId] = React.useState<string>("");
  const [sortOrder, setSortOrder] = React.useState<string>("0");
  const [isPublished, setIsPublished] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setQuestion(faq?.question ?? "");
    setAnswer(faq?.answer ?? "");
    setCategoryId(faq?.category_id ?? "");
    setLocationId(faq?.location_id ?? defaultLocationId ?? "");
    setSortOrder(String(faq?.sort_order ?? 0));
    setIsPublished(faq?.is_published ?? true);
  }, [open, faq, defaultLocationId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (!question.trim() || !answer.trim()) {
      toast.error("Preencha pergunta e resposta");
      return;
    }
    if (scope === "location" && !locationId) {
      toast.error("Escolha o estacionamento");
      return;
    }
    try {
      const basePayload = {
        scope,
        location_id: scope === "location" ? locationId : null,
        category_id: categoryId || null,
        question: question.trim(),
        answer: answer.trim(),
        sort_order: parseInt(sortOrder, 10) || 0,
        is_published: isPublished,
      };

      if (editing && faq) {
        await update.mutateAsync({
          id: faq.id,
          patch: { ...basePayload, updated_by: session.userId },
        });
        toast.success("FAQ atualizado");
      } else {
        await create.mutateAsync({
          ...basePayload,
          created_by: session.userId,
          updated_by: session.userId,
        });
        toast.success("FAQ criado");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar FAQ" : "Nova pergunta"}</DialogTitle>
          <DialogDescription>
            {scope === "global"
              ? "Pergunta global — aparece em todos os estacionamentos e na página /faq."
              : "Pergunta específica desse estacionamento. As gerais da Movepark continuam aparecendo abaixo."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {scope === "location" && (
            <div className="flex flex-col gap-1.5">
              <Label>Estacionamento</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(locs.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="question">Pergunta</Label>
            <Input
              id="question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Como faço o check-in?"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="answer">Resposta</Label>
            <Textarea
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              placeholder="Resposta em texto. Quebras de linha são respeitadas."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem categoria" />
                </SelectTrigger>
                <SelectContent>
                  {(cats.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sort">Ordem</Label>
              <Input
                id="sort"
                type="number"
                inputMode="numeric"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-body-sm">
            <Checkbox
              checked={isPublished}
              onCheckedChange={(v) => setIsPublished(v === true)}
            />
            Publicado (visível ao público)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
