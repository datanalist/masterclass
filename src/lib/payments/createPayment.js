export async function requestCreatePayment({
  supabaseUrl,
  accessToken,
  anonKey,
  packageId,
  fetchImpl = fetch,
}) {
  if (!accessToken) return { ok: false, status: 401 }
  const base = String(supabaseUrl || '').replace(/\/$/, '')
  let res
  try {
    res = await fetchImpl(`${base}/functions/v1/create-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ package_id: packageId }),
    })
  } catch {
    return { ok: false, status: 0 }
  }
  if (!res.ok) return { ok: false, status: res.status }
  const data = await res.json().catch(() => ({}))
  if (!data?.confirmation_url) return { ok: false, status: 500 }
  return { ok: true, payment_id: data.payment_id, confirmation_url: data.confirmation_url }
}
