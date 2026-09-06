import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import PageLayout from '../components/PageLayout'
import { useAuth } from '../lib/auth'
import { BANNER_INTERVAL_MS, nextBannerStatus } from '../lib/payments/banner.js'
import { requestCreatePayment } from '../lib/payments/createPayment.js'
import { supabase } from '../lib/supabase'

const BANNER_COPY = {
  pending: 'Оплата принята, баллы вот-вот появятся',
  credited: 'Баллы начислены',
  timeout: 'Если деньги списаны, баллы появятся чуть позже, обновите страницу',
}

export default function ProfilePage() {
  const { openAuth } = useOutletContext()
  const { ready, session, profile, refreshProfile, signOut } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [packages, setPackages] = useState([])
  const [payingId, setPayingId] = useState(null)
  const [payError, setPayError] = useState('')
  const [banner, setBanner] = useState('hidden')
  const baselineRef = useRef(null)
  const ticksRef = useRef(0)
  const refreshProfileRef = useRef(refreshProfile)
  refreshProfileRef.current = refreshProfile

  const paymentQuery = searchParams.get('payment')

  useEffect(() => {
    if (!supabase || !session) {
      setPackages([])
      return undefined
    }
    let cancelled = false
    supabase
      .from('credit_packages')
      .select('id, title, points, amount_rub')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        if (!cancelled) setPackages(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [session])

  useEffect(() => {
    if (paymentQuery !== 'pending' || !session || !supabase || !profile) {
      if (paymentQuery !== 'pending') {
        baselineRef.current = null
        ticksRef.current = 0
      }
      return undefined
    }
    if (baselineRef.current == null) {
      baselineRef.current = profile.points_balance ?? 0
    }

    let cancelled = false

    async function tick(nextTicks) {
      const { data } = await supabase
        .from('profiles')
        .select('points_balance')
        .eq('id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      const current = data?.points_balance ?? baselineRef.current
      await refreshProfileRef.current()
      const next = nextBannerStatus({
        paymentQuery: 'pending',
        baselineBalance: baselineRef.current,
        currentBalance: current,
        ticks: nextTicks,
      })
      setBanner(next)
      if (next === 'credited') setSearchParams({}, { replace: true })
      return next
    }

    tick(ticksRef.current)
    const id = setInterval(async () => {
      ticksRef.current += 1
      const next = await tick(ticksRef.current)
      if (next === 'credited' || next === 'timeout') clearInterval(id)
    }, BANNER_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [paymentQuery, session, Boolean(profile), setSearchParams])

  async function onBuy(packageId) {
    setPayError('')
    setPayingId(packageId)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const result = await requestCreatePayment({
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
        accessToken: token,
        anonKey:
          import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        packageId,
      })
      if (!result.ok && result.status === 401) {
        openAuth()
        return
      }
      if (!result.ok && result.status === 400) {
        setPayError('Пакет недоступен')
        return
      }
      if (!result.ok) {
        setPayError('Не удалось начать оплату')
        return
      }
      window.location.href = result.confirmation_url
    } finally {
      setPayingId(null)
    }
  }

  if (!ready) {
    return (
      <PageLayout title="Профиль">
        <p className="muted">Загрузка…</p>
      </PageLayout>
    )
  }

  if (!session) {
    return (
      <PageLayout title="Профиль">
        <p className="muted">Войдите, чтобы видеть баланс и управлять баллами.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={openAuth}>
            Войти
          </button>
        </div>
        {!supabase ? <p className="muted">Supabase не настроен.</p> : null}
      </PageLayout>
    )
  }

  return (
    <PageLayout title="Профиль">
      <p className="muted">Баланс списывается при запуске генерации. Пополнение — через YooKassa.</p>
      {banner !== 'hidden' ? <p className="notice">{BANNER_COPY[banner]}</p> : null}
      {payError ? <p className="notice">{payError}</p> : null}
      <div className="balance">
        <strong>{profile?.points_balance ?? 0}</strong>
        <span className="muted">баллов</span>
      </div>
      <div className="packages">
        {packages.map((item) => (
          <button
            key={item.id}
            type="button"
            className="package"
            disabled={payingId === item.id}
            onClick={() => onBuy(item.id)}
          >
            {item.title}
            <span className="package-price">{item.amount_rub} ₽</span>
          </button>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
          Выйти
        </button>
      </div>
      {!supabase ? <p className="muted">Supabase не настроен.</p> : null}
    </PageLayout>
  )
}
