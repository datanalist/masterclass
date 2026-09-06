import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleCreatePayment } from '../_shared/handleCreatePayment.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function env(name: string) {
  return (Deno.env.get(name) || '').trim()
}

function yookassaAuth() {
  const shopId = env('YOOKASSA_SHOP_ID')
  const secret = env('YOOKASSA_SECRET_KEY')
  return `Basic ${btoa(`${shopId}:${secret}`)}`
}

Deno.serve(async (request) => {
  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(supabaseUrl, serviceKey)

  return handleCreatePayment(request, {
    corsHeaders,
    publicAppUrl: env('PUBLIC_APP_URL'),
    createIdempotenceKey: () => crypto.randomUUID(),
    getUser: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt)
      if (error || !data.user) return null
      return { id: data.user.id }
    },
    getPackage: async (packageId) => {
      const { data } = await admin
        .from('credit_packages')
        .select('id, title, points, amount_rub, is_active')
        .eq('id', packageId)
        .maybeSingle()
      return data
    },
    createYookassaPayment: async (input) => {
      const shopId = env('YOOKASSA_SHOP_ID')
      const secret = env('YOOKASSA_SECRET_KEY')
      if (!shopId || !secret) throw new Error('YooKassa is not configured')
      const payload: Record<string, unknown> = {
        amount: { value: input.amountValue, currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        capture: true,
        description: input.description,
        metadata: input.metadata,
      }
      if (input.receipt) payload.receipt = input.receipt
      const res = await fetch('https://api.yookassa.ru/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: yookassaAuth(),
          'Idempotence-Key': input.idempotenceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        console.log(JSON.stringify({ event: 'yookassa-create-http', status: res.status }))
        throw new Error('YooKassa create failed')
      }
      const data = await res.json()
      const confirmationUrl = data?.confirmation?.confirmation_url
      if (!data?.id || !confirmationUrl) throw new Error('YooKassa create failed')
      return { id: data.id, confirmationUrl }
    },
    insertPayment: async (row) => {
      const { error } = await admin.from('payment_transactions').insert({
        user_id: row.user_id,
        provider: 'yookassa',
        provider_payment_id: row.provider_payment_id,
        idempotence_key: row.idempotence_key,
        package_id: row.package_id,
        amount_rub: row.amount_rub,
        points: row.points,
        status: row.status,
      })
      if (error) throw error
    },
  })
})
