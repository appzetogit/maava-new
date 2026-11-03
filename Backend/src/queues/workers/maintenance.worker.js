import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { getBullMQConnection } from '../connection.js';
import { MAINTENANCE_QUEUE } from '../queue.constants.js';
import { processMaintenanceJob } from '../processors/maintenance.processor.js';

const startMaintenanceWorker = async () => {
    if (!config.bullmqEnabled) {
        logger.info('BullMQ is disabled. Maintenance worker not started.');
        return null;
    }

    const connection = getBullMQConnection();
    if (!connection) {
        logger.error('Maintenance worker: Redis connection unavailable. Exiting.');
        process.exit(1);
    }

    const worker = new Worker(MAINTENANCE_QUEUE, processMaintenanceJob, {
        connection,
        concurrency: 1,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 }
        }
    });

    // Setup repeatable jobs
    const maintenanceQueue = new Queue(MAINTENANCE_QUEUE, { connection });

    // Remove the legacy daily expiry schedule — BullMQ persists repeatable
    // schedules in Redis, so the old job keeps firing unless explicitly removed.
    try {
        await maintenanceQueue.removeRepeatable(
            'SUBSCRIPTION_EXPIRY_CHECK',
            { pattern: '0 3 * * *' },
            'subscription_expiry_job'
        );
    } catch (err) {
        logger.warn(`Could not remove legacy subscription expiry schedule: ${err.message}`);
    }

    // Maava charges commission only. The monthly subscription billing schedule
    // is removed for the same reason as the one above: Redis keeps it, and it
    // would go on firing at 00:30 on the 1st of every month.
    try {
        await maintenanceQueue.removeRepeatable(
            'MONTHLY_SUBSCRIPTION_BILLING',
            { pattern: '30 0 1 * *' },
            'monthly_subscription_billing_job'
        );
    } catch (err) {
        logger.warn(`Could not remove subscription billing schedule: ${err.message}`);
    }

    // FSSAI Expiry Check (Every day at 4 AM)
    await maintenanceQueue.add(
        'FSSAI_EXPIRY_CHECK',
        { type: 'FSSAI_EXPIRY_CHECK' },
        {
            repeat: { pattern: '0 4 * * *' }, // 4:00 AM daily
            jobId: 'fssai_expiry_job'
        }
    );

    worker.on('completed', (job) => logger.info(`Maintenance job ${job.id} completed`));
    worker.on('failed', (job, err) => logger.error(`Maintenance job ${job?.id} failed: ${err.message}`));
    worker.on('error', (err) => logger.error(`Maintenance worker error: ${err.message}`));

    logger.info('Maintenance worker started with repeatable jobs (FSSAI expiry)');
    return worker;
};

const worker = await startMaintenanceWorker();

if (worker) {
    const shutdown = async () => {
        await worker.close();
        process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}
