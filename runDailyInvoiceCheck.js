import { runDailyInvoiceCheck } from "./services/jobs.js";

await runDailyInvoiceCheck()
process.exit(0)