import { NextRequest, NextResponse } from 'next/server';
import { graph } from '@/lib/agent/graph';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return NextResponse.json({ error: 'threadId is required' }, { status: 400 });
  }

  const config = { configurable: { thread_id: threadId } };
  
  try {
    const state = await graph.getState(config);
    return NextResponse.json({
      project: state.values.project || {},
      messages: state.values.messages || [],
    });
  } catch (error) {
    console.error('[API] Get Agent State Error:', error);
    return NextResponse.json({ error: 'Failed to retrieve agent state' }, { status: 500 });
  }
}
