// Called only after the encrypted job has committed. Failure does not lose the job.
export async function notifyEmailJob(id: string) {
  if (process.env.EMAIL_DELIVERY_MODE !== "inngest") return;
  try {
    const { inngest } = await import("../inngest/client");
    await inngest.send({ name: "monethakbe/email.queued", data: { jobId: id } });
  } catch {
    // Do not log SDK errors: they may contain request data or credentials.
    console.error(JSON.stringify({event: "email.event_publish_failed", id, next: "scheduled_recovery"}));
  }
}
