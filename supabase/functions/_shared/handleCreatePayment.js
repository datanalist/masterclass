import { formatYookassaAmount } from './amount.js'
import { buildReceipt } from './receipt.js'

function json(status, body, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function readJwt(request) {
  const header = request.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

export async function handleCreatePayment(request, deps) {
  const cors = deps.corsHeaders ?? {}
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' }, cors)
  }

  const jwt = readJwt(request)
  if (!jwt) return json(401, { error: 'Unauthorized' }, cors)

  const user = await deps.getUser(jwt)
  if (!user?.id) return json(401, { error: 'Unauthorized' }, cors)

  const publicAppUrl = String(deps.publicAppUrl || '').replace(/\/$/, '')
  if (!publicAppUrl) return json(500, { error: 'Payment is not configured' }, cors)

  let packageId = ''
  try {
    const body = await request.json()
    packageId = typeof body?.package_id === 'string' ? body.package_id : ''
  } catch {
    return json(400, { error: 'Invalid package' }, cors)
  }

  const pkg = await deps.getPackage(packageId)
  if (!pkg || !pkg.is_active || !(pkg.points > 0) || !(pkg.amount_rub > 0)) {
    return json(400, { error: 'Invalid package' }, cors)
  }

  const receipt = buildReceipt(pkg, user)
  const idempotenceKey = deps.createIdempotenceKey()
  console.log(
    JSON.stringify({
      event: 'create-payment',
      package_id: pkg.id,
      receipt: receipt ? 'present' : 'omitted',
    }),
  )

  let created
  try {
    created = await deps.createYookassaPayment({
      amountValue: formatYookassaAmount(pkg.amount_rub),
      returnUrl: `${publicAppUrl}/profile?payment=pending`,
      idempotenceKey,
      description: pkg.title,
      metadata: {
        user_id: user.id,
        package_id: pkg.id,
        points: String(pkg.points),
      },
      receipt,
    })
  } catch (error) {
    console.log(JSON.stringify({ event: 'create-payment-yookassa-error', package_id: pkg.id }))
    return json(500, { error: 'Failed to create payment' }, cors)
  }

  try {
    await deps.insertPayment({
      user_id: user.id,
      provider_payment_id: created.id,
      idempotence_key: idempotenceKey,
      package_id: pkg.id,
      amount_rub: pkg.amount_rub,
      points: pkg.points,
      status: 'pending',
    })
  } catch (error) {
    console.log(
      JSON.stringify({
        event: 'create-payment-insert-error',
        package_id: pkg.id,
        provider_payment_id: created.id,
      }),
    )
    return json(500, { error: 'Failed to create payment' }, cors)
  }

  return json(
    200,
    { payment_id: created.id, confirmation_url: created.confirmationUrl },
    cors,
  )
}
