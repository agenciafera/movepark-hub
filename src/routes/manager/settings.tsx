import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

export default function ManagerSettings() {
  const [twoFactor, setTwoFactor] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Configurações" description="Ajustes globais da plataforma." />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform-name">Nome</Label>
                <Input id="platform-name" defaultValue="Move Park Hub" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="support">E-mail de suporte</Label>
                <Input id="support" type="email" defaultValue="suporte@movepark.com" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Templates de e-mail</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Confirmação de reserva</Label>
                <Textarea defaultValue="Olá {{nome}}, sua reserva {{codigo}} foi confirmada." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Cancelamento</Label>
                <Textarea defaultValue="Sua reserva {{codigo}} foi cancelada." />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-title-md">2FA obrigatório</div>
                  <div className="text-body-sm text-muted">
                    Exige autenticação em dois fatores para todos os hub_admin.
                  </div>
                </div>
                <Switch checked={twoFactor} onCheckedChange={setTwoFactor} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
