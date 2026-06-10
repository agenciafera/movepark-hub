import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/auth/context";
import { CouponsTab } from "@/features/coupons/CouponsTab";
import { DiscountsTab } from "@/features/discounts/DiscountsTab";

export default function OperatorPromotions() {
  const { effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Promoções"
        description="Cupons (código no checkout) e descontos automáticos (aplicados direto no preço)."
      />

      {!companyId ? (
        <EmptyState
          title="Sem empresa vinculada"
          description="Solicite à equipe Movepark a vinculação da sua empresa."
        />
      ) : (
        <Tabs defaultValue="coupons">
          <TabsList>
            <TabsTrigger value="coupons">Cupons</TabsTrigger>
            <TabsTrigger value="discounts">Descontos</TabsTrigger>
          </TabsList>
          <TabsContent value="coupons" className="pt-4">
            <CouponsTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="discounts" className="pt-4">
            <DiscountsTab companyId={companyId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
