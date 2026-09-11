"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive, Ban, FileDown, FileSignature, FileText, Hash, Printer, Send,
} from "lucide-react";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/lib/i18n";
import { useItem } from "@/lib/hooks";
import { useSession } from "@/components/providers";
import type { Letter } from "@/lib/types";
import { PageHeader, Section } from "@/components/shared/page";
import { Comments, DetailRow, LoadingPanel, RelatedPanel } from "@/components/shared/entity";
import { Badge, StatusBadge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

/** Where a letter is read, acted on, and exported. */
export function LetterDetail({ letterId }: { letterId: string }) {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const { can } = useSession();
  const [busy, setBusy] = React.useState<string | null>(null);

  const letter = useItem<Letter>(`/letters/${letterId}`);
  const preview = useItem<{ html: string }>(`/letters/${letterId}/preview`);

  const data = letter.data;
  if (letter.isLoading || !data) return <LoadingPanel />;

  const refresh = () => {
    client.invalidateQueries({ queryKey: [`/letters/${letterId}`] });
    client.invalidateQueries({ queryKey: [`/letters/${letterId}/preview`] });
    client.invalidateQueries({ queryKey: ["/letters"] });
    client.invalidateQueries({ queryKey: ["/letters/stats"] });
  };

  async function act(action: string, body?: unknown) {
    setBusy(action);
    try {
      await api.post(`/letters/${letterId}/${action}`, body ?? {});
      toast.success(t(`letters.${action}`));
      refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed");
    } finally {
      setBusy(null);
    }
  }

  /** Streams the file through the BFF so the access token never leaves the server. */
  async function download(format: "pdf" | "docx") {
    setBusy(format);
    try {
      const response = await fetch(`/api/orbit/letters/${letterId}/${format}`);
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(data.number ?? "letter").replace(/\//g, "-")}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setBusy(null);
    }
  }

  const writable = can("letters.write");

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t("letters.title"), href: "/letters" }, { label: data.subject }]}
        title={<span dir="auto">{data.subject}</span>}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {data.number ? (
              <span dir="auto" className="font-mono tnum text-text">{data.number}</span>
            ) : (
              <span className="text-faint">{t("letters.unnumbered")}</span>
            )}
            <span className="text-faint">·</span>
            <span>{data.letter_date_display ?? formatDate(data.letter_date, locale)}</span>
            <span className="text-faint">·</span>
            <span>{t(`letters.${data.kind}`)}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={busy === "pdf"}
              onClick={() => download("pdf")}
            >
              <FileDown className="h-3.5 w-3.5" />
              {t("letters.downloadPdf")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={busy === "docx"}
              onClick={() => download("docx")}
            >
              <FileText className="h-3.5 w-3.5" />
              {t("letters.downloadDocx")}
            </Button>
            {writable && !data.number ? (
              <Button
                variant="primary"
                size="sm"
                loading={busy === "register"}
                onClick={() => act("register")}
              >
                <Hash className="h-3.5 w-3.5" />
                {t("letters.register")}
              </Button>
            ) : null}
            {writable && data.status === "awaiting_signature" ? (
              <Button
                variant="primary"
                size="sm"
                loading={busy === "sign"}
                onClick={() => act("sign")}
              >
                <FileSignature className="h-3.5 w-3.5" />
                {t("letters.sign")}
              </Button>
            ) : null}
            {writable && data.status === "signed" ? (
              <Button
                variant="primary"
                size="sm"
                loading={busy === "send"}
                onClick={() => act("send", { delivery_method: "email" })}
              >
                <Send className="h-3.5 w-3.5" />
                {t("letters.send")}
              </Button>
            ) : null}
            {writable && data.status === "sent" ? (
              <Button
                variant="secondary"
                size="sm"
                loading={busy === "archive"}
                onClick={() => act("archive")}
              >
                <Archive className="h-3.5 w-3.5" />
                {t("letters.archive")}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* The preview is the same HTML the PDF renderer uses, so the screen and
            the printed sheet cannot drift apart. */}
        <Section title={t("letters.preview")} contentClassName="p-0">
          <div className="overflow-x-auto bg-[#f4f4f6] p-4">
            <iframe
              title={data.subject}
              srcDoc={preview.data?.html ?? ""}
              className="mx-auto h-[1000px] w-full max-w-[820px] rounded-md border border-border bg-white shadow-[var(--shadow-panel)]"
            />
          </div>
        </Section>

        <div className="space-y-4">
          <Section title={t("common.details")}>
            <div className="space-y-1">
              <DetailRow label={t("common.status")}>
                <StatusBadge status={data.status} />
              </DetailRow>
              <DetailRow label={t("letters.kind")}>{t(`letters.${data.kind}`)}</DetailRow>
              {data.number ? (
                <DetailRow label={t("letters.number")}>
                  <span dir="auto" className="font-mono tnum">{data.number}</span>
                </DetailRow>
              ) : null}
              <DetailRow label={t("letters.date")}>
                {data.letter_date_display ?? formatDate(data.letter_date, locale)}
              </DetailRow>
              {data.recipient_name ? (
                <DetailRow label={t("letters.recipient")}>{data.recipient_name}</DetailRow>
              ) : null}
              {data.recipient_org ? (
                <DetailRow label={t("letters.recipientOrg")}>{data.recipient_org}</DetailRow>
              ) : null}
              {data.attachment_note ? (
                <DetailRow label={t("letters.attachmentNote")}>{data.attachment_note}</DetailRow>
              ) : null}
              {data.follow_up_of ? (
                <DetailRow label={t("letters.followUp")}>
                  <span dir="auto" className="font-mono tnum">{data.follow_up_of}</span>
                </DetailRow>
              ) : null}
              {data.author ? (
                <DetailRow label={t("letters.sender")}>{data.author.full_name}</DetailRow>
              ) : null}
              {data.signer ? (
                <DetailRow label={t("letters.sign")}>{data.signer.full_name}</DetailRow>
              ) : null}
              {data.confidentiality !== "normal" ? (
                <DetailRow label={t("letters.confidentiality")}>
                  <Badge tone="at_risk">{data.confidentiality}</Badge>
                </DetailRow>
              ) : null}
              {data.delivery_method ? (
                <DetailRow label={t("letters.deliveryMethod")}>{data.delivery_method}</DetailRow>
              ) : null}
            </div>
          </Section>

          <RelatedPanel entityType="letter" entityId={data.id} />
          <Comments entityType="letter" entityId={data.id} />
        </div>
      </div>
    </div>
  );
}
