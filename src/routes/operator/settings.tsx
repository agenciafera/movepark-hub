import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/auth/context";

export default function OperatorSettings() {
  const { session } = useAuth();
  const [newBooking, setNewBooking] = React.useState(true);
  const [cancel, setCancel] = React.useState(true);
  const [pendingCheckin, setPendingCheckin] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Preferências da sua empresa." />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Perfil da empresa</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Nome do operador logado</Label>
                <Input value={session?.fullName ?? ""} readOnly />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>E-mail</Label>
                <Input value={session?.email ?? ""} readOnly />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Empresas vinculadas</Label>
                <Input
                  value={session?.companyIds.length ? session.companyIds.length + " empresa(s)" : "—"}
                  readOnly
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Eventos a notificar</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Row
                title="Nova reserva criada"
                description="Receba e-mail quando uma reserva é criada na sua empresa."
                checked={newBooking}
                onChange={setNewBooking}
              />
              <Row
                title="Cancelamento"
                description="Notifica quando uma reserva é cancelada."
                checked={cancel}
                onChange={setCancel}
              />
              <Row
                title="Check-in pendente"
                description="Alerta antes do horário do check-in."
                checked={pendingCheckin}
                onChange={setPendingCheckin}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-title-md">{title}</div>
        <div className="text-body-sm text-muted">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
