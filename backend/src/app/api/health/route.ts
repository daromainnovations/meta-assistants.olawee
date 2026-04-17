import { webhookController } from '../../../controllers/webhook.controller';

export async function GET() {
  return webhookController.healthCheck();
}
