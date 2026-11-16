// Producer queues live in @resume-pilot/queue so tRPC procedures can use
// them too; re-exported here for the web app's own server code.
export { getExtractionQueue, getTransactionalEmailQueue } from "@resume-pilot/queue";
