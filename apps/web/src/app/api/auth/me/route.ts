import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';

    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data.error || 'Not authenticated' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Auth me proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to connect to authentication service' },
      { status: 502 }
    );
  }
}
