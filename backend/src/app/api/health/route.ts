import { assistantsController } from '../../../controllers/assistants.controller';

export async function GET() {
  return assistantsController.healthCheck();
}
