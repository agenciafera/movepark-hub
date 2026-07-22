import * as React from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  GooglePlacesAutocomplete,
  isGooglePlacesEnabled,
} from "@/components/shared/GooglePlacesAutocomplete";
import { LocationMapPreview } from "@/components/shared/LocationMapPreview";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageGalleryField } from "@/components/shared/ImageUpload";
import { uploadCompanyAsset } from "@/lib/storage";
import { useAdminDestinations } from "@/features/destinations/api";
import { AmenityPicker } from "@/features/amenities/AmenityPicker";
import { useNearestDestination } from "./api";
import { slugify, type LocationFormApi } from "./useLocationForm";
import type { EntityStatus, Location } from "@/types/domain";

// Sentinela do <Select> para "sem âncora" (o Radix Select não aceita value="").
const NO_DESTINATION = "__none__";

/**
 * Um bloco do formulário: título, uma linha explicando o porquê, e os campos.
 *
 * O formulário tem 15 campos. Empilhados num grid só, como estavam, o parceiro
 * não sabe onde está nem o que falta. Cada bloco responde a uma pergunta
 * diferente, e é por isso que o título vem com a explicação junto.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  // `aria-labelledby` no h2 faz cada bloco virar região navegável por landmark.
  const headingId = `sec-${slugify(title)}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-hairline bg-canvas p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-display-sm text-ink">
          {title}
        </h2>
        <p className="text-body-sm text-muted">{description}</p>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 tablet:grid-cols-2">{children}</div>
    </section>
  );
}

/** Props de acessibilidade do controle quando o campo tem erro, para o caller espalhar. */
function errorProps(fieldId: string, error?: string) {
  return error ? { "aria-invalid": true, "aria-describedby": `${fieldId}-error` } : {};
}

/**
 * Um campo. `wide` ocupa a linha inteira do grid. `error` troca a dica por uma
 * mensagem em vermelho com id `${htmlFor}-error`, ligada ao controle via
 * `aria-describedby` (ver `errorProps`).
 */
function Field({
  label,
  htmlFor,
  hint,
  error,
  wide,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${wide ? "tablet:col-span-2" : ""}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-caption text-error">
          {error}
        </p>
      ) : (
        hint && <p className="text-caption text-muted">{hint}</p>
      )}
    </div>
  );
}

export function LocationSections({
  form,
  companyId,
  location,
}: {
  form: LocationFormApi;
  companyId: string;
  location: Location | null;
}) {
  const { fields: f, operatorMode, isEdit, errors } = form;

  // Âncora de proximidade só é editável no full scope (hub_admin); operator não toca o vínculo.
  const destinations = useAdminDestinations();
  const hasGeo = location?.latitude != null && location?.longitude != null;
  const nearest = useNearestDestination(
    !operatorMode ? (location?.latitude ?? null) : null,
    !operatorMode ? (location?.longitude ?? null) : null,
  );

  return (
    <>
      <Section
        title="Identificação"
        description="Como a unidade aparece para o cliente na busca e no voucher."
      >
        {/* Sem `required` nativo: a validação vive no submit (useLocationForm) e
            fala na mesma língua dos outros erros, em vez do balão do navegador. */}
        <Field label="Nome" htmlFor="name" error={errors.name} wide>
          <Input
            id="name"
            value={f.name}
            onChange={(e) => {
              f.setName(e.target.value);
              if (!isEdit && !operatorMode) f.setSlug(slugify(e.target.value));
            }}
            {...errorProps("name", errors.name)}
          />
        </Field>
        <div className="flex flex-col gap-1.5 tablet:col-span-2">
          <Label htmlFor="address">Endereço</Label>
          {/* Google Places (E1.9): ao escolher um resultado, captura endereço +
              lat/lng juntos, que alimentam a proximidade (ADR-001, coluna geog
              gerada). Sem key, degrada para input comum e mostra os campos
              manuais de lat/lng. */}
          <GooglePlacesAutocomplete
            id="address"
            value={f.address}
            onChange={(a) => {
              f.setAddress(a);
              // Editar o texto à mão invalida a geo até nova seleção, pra não
              // deixar coordenada de um endereço apontando para outro.
              if (isGooglePlacesEnabled) {
                f.setLatitude(null);
                f.setLongitude(null);
              }
            }}
            onSelect={(p) => {
              f.setAddress(p.address);
              f.setLatitude(p.latitude);
              f.setLongitude(p.longitude);
            }}
          />
          {f.latitude != null && f.longitude != null ? (
            <p className="flex items-center gap-1 text-caption-sm text-success">
              <MapPin className="h-3.5 w-3.5" /> Localização confirmada no mapa.
            </p>
          ) : (
            isGooglePlacesEnabled && (
              <p className="text-caption text-muted">
                Escolha o endereço na lista para fixar o ponto no mapa.
              </p>
            )
          )}
          {!isGooglePlacesEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lat">Latitude</Label>
                <Input
                  id="lat"
                  inputMode="decimal"
                  value={f.latitude ?? ""}
                  onChange={(e) => f.setLatitude(e.target.value ? Number(e.target.value) : null)}
                  placeholder="-23.5505"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lng">Longitude</Label>
                <Input
                  id="lng"
                  inputMode="decimal"
                  value={f.longitude ?? ""}
                  onChange={(e) => f.setLongitude(e.target.value ? Number(e.target.value) : null)}
                  placeholder="-46.6333"
                />
              </div>
            </div>
          )}
          <LocationMapPreview latitude={f.latitude} longitude={f.longitude} />
        </div>
      </Section>

      <Section
        title="Contato"
        description="Por onde a Movepark e o cliente falam com esta unidade."
      >
        <Field label="Telefone" htmlFor="phone">
          <Input id="phone" value={f.phone} onChange={(e) => f.setPhone(e.target.value)} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={f.email}
            onChange={(e) => f.setEmail(e.target.value)}
          />
        </Field>
      </Section>

      <Section
        title="Chegada"
        description="O que o cliente precisa saber para achar a entrada e pegar o transfer."
      >
        <Field
          label="Aviso crítico de entrada"
          htmlFor="notice"
          wide
          hint='Destacado em alerta no bloco "Como chegar". Use para o que o cliente erra na chegada.'
        >
          <Textarea
            id="notice"
            value={f.notice}
            onChange={(e) => f.setNotice(e.target.value)}
            placeholder="Ex.: Use a Rua Padre Celestino Pavan. O GPS erra a entrada."
          />
        </Field>
        <Field
          label="Como chegar (passo a passo)"
          htmlFor="directions"
          wide
          hint="O endereço diz onde fica. Aqui você diz como entrar."
        >
          <Textarea
            id="directions"
            value={f.directionsText}
            onChange={(e) => f.setDirectionsText(e.target.value)}
            placeholder="Ex.: Entre pela rua lateral (não pela entrada principal). Recepção coberta à direita."
          />
        </Field>
        <Field
          label="Transfer · frequência (min)"
          htmlFor="shuttle-freq"
          error={errors.shuttleFrequency}
        >
          <Input
            id="shuttle-freq"
            type="number"
            inputMode="numeric"
            min={1}
            value={f.shuttleFrequency}
            onChange={(e) => f.setShuttleFrequency(e.target.value)}
            placeholder="15"
            {...errorProps("shuttle-freq", errors.shuttleFrequency)}
          />
        </Field>
        <Field
          label="Transfer · tempo até o terminal (min)"
          htmlFor="shuttle-terminal"
          error={errors.shuttleToTerminal}
        >
          <Input
            id="shuttle-terminal"
            type="number"
            inputMode="numeric"
            min={1}
            value={f.shuttleToTerminal}
            onChange={(e) => f.setShuttleToTerminal(e.target.value)}
            placeholder="6"
            {...errorProps("shuttle-terminal", errors.shuttleToTerminal)}
          />
        </Field>
      </Section>

      <Section
        title="Fotos"
        description="Sem foto a unidade não entra na busca, então este bloco decide se ela vende."
      >
        {/* id de âncora: o submit rola até aqui quando falta foto. */}
        <div id="photos-field" className="scroll-mt-24 tablet:col-span-2">
          <ImageGalleryField
            label="Fotos da unidade"
            values={f.photos}
            onChange={f.setPhotos}
            onUpload={(file) => uploadCompanyAsset(companyId, "photo", file)}
          />
          {f.photos.length === 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-caption-sm text-error">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Suba pelo menos 1 foto. Sem foto, a unidade não entra na busca e não vende.
            </p>
          ) : (
            <p className="mt-2 text-caption-sm text-muted">
              Foto boa atrai mais cliente. Capriche na fachada e nas vagas.
            </p>
          )}
        </div>
      </Section>

      <Section
        title="Comodidades"
        description="O que a unidade oferece. Aparece como benefício no card da busca e no detalhe."
      >
        <div className="tablet:col-span-2">
          <AmenityPicker selected={f.amenities} onChange={f.setAmenities} />
        </div>
      </Section>

      <Section
        title="Política de reserva"
        description="As regras desta unidade que o cliente lê antes de reservar."
      >
        {/* Rótulo escondido: o título da seção já nomeia o campo na tela, e
            repetir a palavra logo abaixo é ruído. O leitor de tela continua
            recebendo o label. */}
        <Field label={<span className="sr-only">Política de reserva</span>} htmlFor="policy" wide>
          <Textarea
            id="policy"
            value={f.reservationPolicy}
            onChange={(e) => f.setReservationPolicy(e.target.value)}
            placeholder="Ex.: Cancelamento grátis até 24h antes do check-in."
          />
        </Field>
      </Section>

      {!operatorMode && (
        <Section
          title="Catálogo Movepark"
          description="Campos que a equipe Movepark controla. O parceiro não vê este bloco."
        >
          <Field label="Slug" htmlFor="slug">
            <Input
              id="slug"
              required
              value={f.slug}
              onChange={(e) => f.setSlug(slugify(e.target.value))}
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select value={f.status} onValueChange={(v) => f.setStatus(v as EntityStatus)}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="inactive">Inativa</SelectItem>
                <SelectItem value="suspended">Suspensa</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Fuso horário" htmlFor="tz">
            <Input id="tz" value={f.timezone} onChange={(e) => f.setTimezone(e.target.value)} />
          </Field>
          <Field
            label="Código no sistema de pátio (WPS)"
            htmlFor="external-ref"
            hint="Identifica este lote nos eventos do pátio (placa/ANPR). Deixe vazio se não integra com WPS."
          >
            <Input
              id="external-ref"
              value={f.externalRef}
              onChange={(e) => f.setExternalRef(e.target.value)}
              placeholder="ex: lote-01"
            />
          </Field>
          {/* O botão "Detectar" fica FORA do label: botão dentro de <label> é
              HTML inválido e o clique pode ser reencaminhado ao Select. */}
          <div className="flex flex-col gap-1.5 tablet:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="destination">Destino (âncora de proximidade)</Label>
              {hasGeo && nearest.data && nearest.data !== f.destinationId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => f.setDestinationId(nearest.data ?? null)}
                >
                  Detectar mais próximo
                </Button>
              )}
            </div>
            <Select
              value={f.destinationId ?? NO_DESTINATION}
              onValueChange={(v) => f.setDestinationId(v === NO_DESTINATION ? null : v)}
            >
              <SelectTrigger id="destination">
                <SelectValue placeholder="Selecione um destino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DESTINATION}>Nenhum</SelectItem>
                {(destinations.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.short_name ?? d.name} ({d.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted">
              Usado para ranquear e exibir a distância do lote ao destino. Lotes novos com geo são
              ligados ao mais próximo automaticamente.
            </p>
          </div>
        </Section>
      )}
    </>
  );
}
