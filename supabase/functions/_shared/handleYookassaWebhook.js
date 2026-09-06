import { amountsMatch } from './amount.js'

const YOOKASSA_PAYMENT_ID = /^[A-Za-z0-9-]{1,64}$/

export function isYookassaPaymentId(id) {
  return typeof id === 'string' && YOOKASSA_PAYMENT_ID.test(id)
}

export function decideWebhookAction({ apiPayment, dbRow }) {
  if (!apiPayment || !dbRow) return { httpStatus: 500, rpcStatus: null }
  if (apiPayment.status === 'canceled') return { httpStatus: 200, rpcStatus: 'canceled' }
  if (apiPayment.status === 'succeeded' && apiPayment.paid === true) {
    if (amountsMatch(apiPayment.amount?.value, dbRow.amount_rub)) {
      return { httpStatus: 200, rpcStatus: 'succeeded' }
    }
    return { httpStatus: 200, rpcStatus: 'failed' }
  }
  return { httpStatus: 200, rpcStatus: null }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleYookassaWebhook(request, deps) {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })

  let providerPaymentId = ''
  try {
    const body = await request.json()
    providerPaymentId = body?.object?.id || ''
  } catch {
    return json(400, { error: 'Invalid notification' })
  }

  if (!isYookassaPaymentId(providerPaymentId)) return json(400, { error: 'Invalid notification' })

  const apiPayment = await deps.fetchYookassaPayment(providerPaymentId)
  const dbRow = await deps.getPaymentRow(providerPaymentId)
  const decision = decideWebhookAction({ apiPayment, dbRow })

  console.log(
    JSON.stringify({
      event: 'yookassa-webhook',
      provider_payment_id: providerPaymentId,
      api_status: apiPayment?.status ?? null,
      rpc_status: decision.rpcStatus,
    }),
  )

  if (decision.rpcStatus) {
    const balance = await deps.finalizePayment(providerPaymentId, decision.rpcStatus, apiPayment)
    console.log(
      JSON.stringify({
        event: 'yookassa-finalize',
        provider_payment_id: providerPaymentId,
        status: decision.rpcStatus,
        points_balance: balance,
      }),
    )
  }

  return json(decision.httpStatus, { ok: decision.httpStatus === 200 })
}
