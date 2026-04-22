import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CampaignBuilder } from "./campaign-builder";

type NewCampaignPageProps = {
  searchParams: Promise<{
    editId?: string;
  }>;
};

export default async function NewCampaignPage({ searchParams }: NewCampaignPageProps) {
  const params = await searchParams;
  const parsedEditId = Number(params.editId);
  const editCampaignId = Number.isInteger(parsedEditId) && parsedEditId > 0 ? parsedEditId : undefined;
  const isEditMode = Boolean(editCampaignId);

  return (
    <AppShell
      title={isEditMode ? "编辑邮件任务" : "创建邮件任务"}
      description={
        isEditMode ? "仅草稿任务可编辑，保存后会更新筛选与收件列表。" : "支持 HTML 与 Markdown 内容，支持用户ID与高级筛选。"
      }
      actions={
        <Button asChild variant="secondary">
          <Link href={isEditMode ? `/campaigns/${editCampaignId}` : "/campaigns"}>{isEditMode ? "返回任务详情" : "返回任务列表"}</Link>
        </Button>
      }
    >
      <CampaignBuilder editCampaignId={editCampaignId} />
    </AppShell>
  );
}
