/**
 * Persist the seller-chosen category plus optional key-subject label.
 * Detection lives in `detectKeySubject`; this RPC does not infer either field.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {{ productId: string, categoryId: string, detectedLabel?: string | null }} input
 */
export async function classifyProduct(client, input) {
  const { error } = await client.rpc('classify_product', {
    p_product_id: input.productId,
    p_category_id: input.categoryId,
    p_detected_label: input.detectedLabel ?? null,
  })
  if (error) throw error
}
