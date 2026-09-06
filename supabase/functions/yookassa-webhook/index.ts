import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleYookassaWebhook } from '../_shared/handleYookassaWebhook.js'

function env(name: string) {
  return (Deno.env.get(name) || '').trim()
}

function yookassaAuth() {
  return `Basic ${btoa(`${env('YOOKASSA_SHOP_ID')}:${env('YOOKASSA_SECRET_KEY')}`)}`
}

Deno.serve(async (request) => {
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

  return handleYookassaWebhook(request, {
    fetchYookassaPayment: async (id) => {
      const res = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(id)}`, {
        headers: { Authorization: yookassaAuth() },
      })
      if (!res.ok) return null
      return await res.json()
    },
    getPaymentRow: async (providerPaymentId) => {
      const { data } = await admin
        .from('payment_transactions')
        .select('amount_rub, status')
        .eq('provider_payment_id', providerPaymentId)
        .maybeSingle()
      return data
    },
    finalizePayment: async (providerPaymentId, status, rawPayload) => {
      const { data, error } = await admin.rpc('finalize_yookassa_payment', {
        p_provider_payment_id: providerPaymentId,
        p_status: status,
        p_raw_payload: rawPayload,
      })
      if (error) throw error
      return data
    },
  })
})
