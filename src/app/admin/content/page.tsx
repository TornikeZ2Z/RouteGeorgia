import { requirePermission } from "@/lib/auth/session";
import { sql } from "@db/client";
import { Alert, Badge, PageHeader, Table } from "@/components/ui";
import { ContentForm } from "./form";

export const dynamic = "force-dynamic";

export default async function Content() {
  await requirePermission("admin.content.write");

  const pages = await sql<{
    id: string; slug: string; locale: string; kind: string; title: string;
    body: string; published: boolean; updated_at: Date;
  }[]>`
    SELECT id, slug, locale, kind, title, body, published, updated_at
    FROM content_pages ORDER BY slug, locale`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content"
        description="Editorial copy shown on the public site, per language."
      />

      <Alert tone="info" title="Translations fall back to English">
        A page with no entry for a language shows the English one rather than a blank screen. Missing
        translations are logged so you can see what is outstanding.
      </Alert>

      <Table head={["Slug", "Language", "Title", "Published", "Updated"]}>
        {pages.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-2.5 font-mono text-xs">{p.slug}</td>
            <td className="px-4 py-2.5">{p.locale}</td>
            <td className="px-4 py-2.5">{p.title}</td>
            <td className="px-4 py-2.5">
              <Badge tone={p.published ? "success" : "neutral"}>
                {p.published ? "live" : "draft"}
              </Badge>
            </td>
            <td className="px-4 py-2.5 text-xs">{new Date(p.updated_at).toLocaleDateString()}</td>
          </tr>
        ))}
      </Table>

      <ContentForm />
    </div>
  );
}
