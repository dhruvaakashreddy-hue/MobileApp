/**
 * Vercel entry point for every /api route. The routing and checks live in server/handler.ts,
 * so this file stays a thin adapter.
 */
import { handleApiRequest } from '../server/handler.ts';

export async function GET(request: Request): Promise<Response> {
  return handleApiRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleApiRequest(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleApiRequest(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleApiRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleApiRequest(request);
}
