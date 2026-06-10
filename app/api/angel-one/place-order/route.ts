import { NextRequest, NextResponse } from 'next/server';

const ANGEL_API_BASE = 'https://apiconnect.angelbroking.com';

export async function POST(req: NextRequest) {
  try {
    const { accessToken, apiKey, order } = await req.json();
    if (!accessToken || !apiKey) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const res = await fetch(`${ANGEL_API_BASE}/rest/secure/angelbroking/order/v1/placeOrder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': apiKey,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(order),
    });

    const text = await res.text();
    let data: { status?: boolean; message?: string; data?: { orderid?: string } };
    try {
      data = JSON.parse(text);
    } catch {
      const hint = text.toLowerCase();
      const msg = hint.includes('access') || hint.includes('denied')
        ? 'Access denied — check API key and token'
        : hint.includes('rate') ? 'Rate limit exceeded — please wait and retry'
        : text.substring(0, 200) || 'Invalid response from broker API';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    if (!data.status) {
      return NextResponse.json({ error: data.message || 'Order placement failed' }, { status: 400 });
    }

    return NextResponse.json({ orderId: data.data?.orderid, message: data.message });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
