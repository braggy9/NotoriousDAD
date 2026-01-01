import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const allCookies = request.cookies.getAll();

  return NextResponse.json({
    cookieCount: allCookies.length,
    cookies: allCookies.map(cookie => ({
      name: cookie.name,
      hasValue: !!cookie.value,
      valueLength: cookie.value?.length || 0,
      valuePreview: cookie.value ? `${cookie.value.substring(0, 20)}...` : null,
    })),
    headers: {
      cookie: request.headers.get('cookie'),
      host: request.headers.get('host'),
      origin: request.headers.get('origin'),
    },
    url: request.url,
  });
}
