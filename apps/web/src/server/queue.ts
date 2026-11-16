import {
  createRedisConnection,
  createTransactionalEmailQueue,
  type TransactionalEmailJob,
} from "@resume-pilot/queue";
import type { Queue } from "bullmq";

let queue: Queue<TransactionalEmailJob> | undefined;

/** One transactional-email queue (and Redis connection) per server process. */
export function getTransactionalEmailQueue(): Queue<TransactionalEmailJob> {
  if (!queue) {
    queue = createTransactionalEmailQueue(createRedisConnection());
  }
  return queue;
}
