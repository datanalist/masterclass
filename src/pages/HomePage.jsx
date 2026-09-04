import { Link } from 'react-router-dom'
import { CATEGORIES, FEATURES, INCLUDED } from '../data/catalog'

export default function HomePage() {
  return (
    <div className="shell stack">
      <section className="card hero">
        <div className="hero-left">
          <span className="badge">React · Supabase · Vercel</span>
          <h1 className="hero-title">
            <span className="hero-title-mark">mapEstate</span>
          </h1>
          <p className="hero-lead">
            Стартовый каркас приложения для генерации товарных карточек и каталога
            пользовательских товаров.
          </p>
          <div className="hero-status">
            <span className="pill pill-warn">Ожидает .env</span>
            <span className="pill pill-ready">Vite dev server ready</span>
          </div>
        </div>
        <aside className="included">
          <h2>Что уже учтено</h2>
          <ul className="included-list">
            {INCLUDED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>

      <section className="features">
        {FEATURES.map((feature) => (
          <Link key={feature.to} className="card feature-card" to={feature.to}>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </Link>
        ))}
      </section>

      <section className="card catalog">
        <span className="badge">Категории</span>
        <div className="section-head">
          <h2>Базовый справочник товаров</h2>
          <p>
            По этим категориям можно строить фильтры, автоопределение и предсозданные
            варианты генерации.
          </p>
        </div>
        <div className="chips">
          {CATEGORIES.map((category) => (
            <span key={category} className="chip">
              {category}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
