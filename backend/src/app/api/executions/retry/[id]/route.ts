import { NextRequest } from 'next/server';
import { executionController } from '../../../../../controllers/executions.controller';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  return executionController.retry(id);
}
