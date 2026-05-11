type CancelHandler = () => void | Promise<void>;

const cancelHandlers = new Map<string, CancelHandler>();

export function registerGenerationJobCancelHandler(jobId: string, handler: CancelHandler): void {
  cancelHandlers.set(jobId, handler);
}

export function unregisterGenerationJobCancelHandler(jobId: string): void {
  cancelHandlers.delete(jobId);
}

export async function cancelGenerationJob(jobId: string): Promise<boolean> {
  const handler = cancelHandlers.get(jobId);
  if (!handler) {
    return false;
  }

  await handler();
  return true;
}
