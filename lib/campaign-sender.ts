import {
  finalizeCampaignStatus,
  getCampaignForSending,
  listPendingRecipientsForCampaign,
  markCampaignRecipientFailed,
  markCampaignRecipientSuccess,
  resetFailedRecipientsToPending,
  startCampaignSending,
} from "@/lib/campaign-repo";
import {
  claimNextQueueJob,
  createQueueJob,
  findActiveQueueJobByCampaign,
  finishQueueJob,
  getNextPendingQueueItem,
  isQueueJobStopRequested,
  markQueueItemFailed,
  markQueueItemSuccess,
  requestStopQueueJobByCampaign,
  summarizeQueueJob,
} from "@/lib/queue-sqlite";
import { sendOneEmail } from "@/lib/sendgrid";

const MIN_RATE_PER_MINUTE = 1;
const MAX_RATE_PER_MINUTE = 100_000;

let queueWorkerPromise: Promise<void> | null = null;

export class CampaignSendError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CampaignSendError";
    this.status = status;
  }
}

function normalizeRatePerMinute(value: number, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new CampaignSendError(`${fieldName} 必须是整数`, 400);
  }

  if (value < MIN_RATE_PER_MINUTE || value > MAX_RATE_PER_MINUTE) {
    throw new CampaignSendError(
      `${fieldName} 必须在 ${MIN_RATE_PER_MINUTE} 到 ${MAX_RATE_PER_MINUTE} 之间`,
      400,
    );
  }

  return value;
}

export function getDefaultRatePerMinute() {
  const raw = process.env.DEFAULT_SEND_RATE_PER_MINUTE?.trim();

  if (!raw) {
    return 60;
  }

  const value = Number(raw);
  return normalizeRatePerMinute(value, "DEFAULT_SEND_RATE_PER_MINUTE");
}

function resolveRatePerMinute(overrideRatePerMinute?: number) {
  if (typeof overrideRatePerMinute === "number") {
    return {
      ratePerMinute: normalizeRatePerMinute(overrideRatePerMinute, "ratePerMinute"),
      usedDefaultRate: false,
    };
  }

  return {
    ratePerMinute: getDefaultRatePerMinute(),
    usedDefaultRate: true,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "发送失败";
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function triggerQueueWorker() {
  if (queueWorkerPromise) {
    return;
  }

  queueWorkerPromise = runQueueWorker().finally(() => {
    queueWorkerPromise = null;
  });
}

async function collectPendingRecipients(campaignId: number) {
  const recipients: Array<{
    campaignRecipientId: number;
    email: string;
    userName: string;
  }> = [];

  let afterRecipientId = 0;
  const pageSize = 1000;

  while (true) {
    const batch = await listPendingRecipientsForCampaign(campaignId, pageSize, afterRecipientId);

    if (batch.length === 0) {
      break;
    }

    recipients.push(
      ...batch.map((item) => ({
        campaignRecipientId: item.id,
        email: item.email,
        userName: item.user_name,
      })),
    );

    afterRecipientId = batch[batch.length - 1].id;
  }

  return recipients;
}

async function processQueueJob(job: {
  id: number;
  campaign_id: number;
  rate_per_minute: number;
}) {
  const campaign = await getCampaignForSending(job.campaign_id);

  if (!campaign) {
    while (true) {
      const item = getNextPendingQueueItem(job.id);

      if (!item) {
        break;
      }

      markQueueItemFailed(item.id, "任务不存在");
    }

    const summary = summarizeQueueJob(job.id);
    finishQueueJob({
      jobId: job.id,
      status: "failed",
      summary,
      errorMessage: "任务不存在",
    });
    return;
  }

  const intervalMs = Math.max(10, Math.floor(60_000 / Math.max(1, job.rate_per_minute)));
  let stoppedByUser = false;

  while (true) {
    if (isQueueJobStopRequested(job.id)) {
      stoppedByUser = true;
      break;
    }

    const item = getNextPendingQueueItem(job.id);

    if (!item) {
      break;
    }

    try {
      const providerMessageId = await sendOneEmail({
        toEmail: item.email,
        userName: item.user_name,
        subject: campaign.subject,
        htmlContent: campaign.html_content,
        textContent: campaign.text_content,
      });

      await markCampaignRecipientSuccess(item.campaign_recipient_id, providerMessageId);
      markQueueItemSuccess(item.id, providerMessageId);
    } catch (error) {
      const errorMessage = getErrorMessage(error);

      try {
        await markCampaignRecipientFailed(item.campaign_recipient_id, errorMessage);
      } catch {
        // MySQL 更新失败时仍然标记队列项失败，避免队列阻塞。
      }

      markQueueItemFailed(item.id, errorMessage);
    }

    await sleep(intervalMs);
  }

  const summary = summarizeQueueJob(job.id);

  if (stoppedByUser && summary.pending > 0) {
    finishQueueJob({
      jobId: job.id,
      status: summary.success > 0 ? "partial" : "failed",
      summary,
      errorMessage: "任务已手动停止",
    });

    await finalizeCampaignStatus(job.campaign_id, "stopped", "任务已手动停止");
    return;
  }

  if (summary.pending > 0) {
    finishQueueJob({
      jobId: job.id,
      status: "failed",
      summary,
      errorMessage: "队列处理中断，仍有未处理项",
    });

    await finalizeCampaignStatus(job.campaign_id, "failed", "队列处理中断，仍有未处理项");
    return;
  }

  if (summary.failed === 0) {
    finishQueueJob({
      jobId: job.id,
      status: "done",
      summary,
    });

    await finalizeCampaignStatus(job.campaign_id, "done");
    return;
  }

  if (summary.success === 0) {
    finishQueueJob({
      jobId: job.id,
      status: "failed",
      summary,
      errorMessage: "所有邮件发送失败",
    });

    await finalizeCampaignStatus(job.campaign_id, "failed", "所有邮件发送失败");
    return;
  }

  finishQueueJob({
    jobId: job.id,
    status: "partial",
    summary,
    errorMessage: `部分发送失败（失败 ${summary.failed}）`,
  });

  await finalizeCampaignStatus(job.campaign_id, "partial", `部分发送失败（失败 ${summary.failed}）`);
}

async function runQueueWorker() {
  while (true) {
    const job = claimNextQueueJob();

    if (!job) {
      break;
    }

    try {
      await processQueueJob(job);
    } catch (error) {
      const summary = summarizeQueueJob(job.id);
      const errorMessage = getErrorMessage(error);

      finishQueueJob({
        jobId: job.id,
        status: "failed",
        summary,
        errorMessage,
      });

      await finalizeCampaignStatus(job.campaign_id, "failed", errorMessage);
    }
  }
}

export async function sendCampaignById(campaignId: number, overrideRatePerMinute?: number) {
  const campaign = await getCampaignForSending(campaignId);

  if (!campaign) {
    throw new CampaignSendError("任务不存在", 404);
  }

  if (campaign.status === "done") {
    throw new CampaignSendError("任务已完成发送", 409);
  }

  const activeJob = findActiveQueueJobByCampaign(campaignId);

  if (activeJob) {
    triggerQueueWorker();

    const summary = summarizeQueueJob(activeJob.id);

    return {
      campaignId,
      jobId: activeJob.id,
      alreadyQueued: true,
      queuedCount: summary.pending,
      ratePerMinute: activeJob.rate_per_minute,
      usedDefaultRate: false,
    };
  }

  if (campaign.status === "failed" || campaign.status === "partial" || campaign.status === "stopped") {
    await resetFailedRecipientsToPending(campaignId);
  }

  const recipients = await collectPendingRecipients(campaignId);

  if (recipients.length === 0) {
    throw new CampaignSendError("没有待发送收件人", 400);
  }

  const { ratePerMinute, usedDefaultRate } = resolveRatePerMinute(overrideRatePerMinute);

  const queueJob = createQueueJob({
    campaignId,
    ratePerMinute,
    recipients,
  });

  if (campaign.status !== "sending") {
    const started = await startCampaignSending(campaignId);

    if (!started) {
      const latestCampaign = await getCampaignForSending(campaignId);

      if (!latestCampaign || latestCampaign.status !== "sending") {
        throw new CampaignSendError("任务状态不可发送，请刷新后重试", 409);
      }
    }
  }

  triggerQueueWorker();

  return {
    campaignId,
    jobId: queueJob.jobId,
    alreadyQueued: false,
    queuedCount: queueJob.totalCount,
    ratePerMinute,
    usedDefaultRate,
  };
}

export async function stopCampaignById(campaignId: number) {
  const campaign = await getCampaignForSending(campaignId);

  if (!campaign) {
    throw new CampaignSendError("任务不存在", 404);
  }

  if (campaign.status !== "sending") {
    throw new CampaignSendError("仅发送中的任务可停止", 409);
  }

  const queueJob = requestStopQueueJobByCampaign(campaignId);

  if (!queueJob) {
    throw new CampaignSendError("未找到可停止的队列任务", 409);
  }

  triggerQueueWorker();

  return {
    campaignId,
    jobId: queueJob.id,
    status: queueJob.status,
    pending: summarizeQueueJob(queueJob.id).pending,
  };
}
