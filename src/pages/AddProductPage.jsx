import { CATEGORIES } from '../data/catalog'
import PageLayout from '../components/PageLayout'

const VARIANTS = ['Вариант 1', 'Вариант 2', 'Вариант 3', 'Вариант 4']

export default function AddProductPage() {
  return (
    <PageLayout title="Добавление товара">
      <p className="muted">
        Форма без логики: поля и кнопки ничего не отправляют и не определяют товар.
      </p>
      <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
        <div className="dropzone">Перетащите фото товара или выберите файл</div>

        <label>
          Категория
          <select defaultValue="">
            <option value="" disabled>
              Определится автоматически
            </option>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          Тип товара
          <input type="text" placeholder="Например, куртка" />
        </label>

        <div className="field-label">
          <span>Тип генерации</span>
          <div className="choice-row">
            <button type="button" className="choice" aria-pressed="true">
              Фото
            </button>
            <button type="button" className="choice" aria-pressed="false">
              Карточка
            </button>
          </div>
        </div>

        <div className="field-label">
          <span>Как показать товар</span>
          <div className="variants">
            {VARIANTS.map((variant) => (
              <button key={variant} type="button" className="variant">
                {variant}
              </button>
            ))}
          </div>
        </div>

        <label>
          Пожелания
          <textarea placeholder="Опишите, как показать товар" />
        </label>

        <label>
          Количество объектов
          <select defaultValue="1">
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="4">4</option>
          </select>
        </label>

        <div className="actions">
          <button type="button" className="btn">
            Запустить генерацию
          </button>
        </div>
      </form>
    </PageLayout>
  )
}
