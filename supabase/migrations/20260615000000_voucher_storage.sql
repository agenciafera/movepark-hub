-- Voucher PDF: bucket de storage para os PDFs de voucher.
-- Privado (voucher tem PII — placa, nome): a edge `voucher-pdf` faz upload com
-- service_role e devolve signed URLs; o cliente nunca acessa o storage direto.
-- Sem policies em storage.objects (service_role bypassa RLS; signed URLs são
-- pré-autorizadas).

insert into storage.buckets (id, name, public)
values ('vouchers', 'vouchers', false)
on conflict (id) do nothing;
