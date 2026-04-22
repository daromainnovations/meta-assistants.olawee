import { NextRequest } from 'next/server';
import { executionController } from '../../../controllers/executions.controller';

export async function GET(req: NextRequest) {
  return executionController.list(req);
}
