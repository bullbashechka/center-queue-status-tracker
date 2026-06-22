export function AdminPage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="eyebrow">Внутренняя зона центра</div>
        <h1>Админка MVP подготавливается</h1>
        <p>
          На этапе 1 здесь уже отделена внутренняя поверхность от публичной. Полноценный список
          детей, авторизация и рабочие действия будут добавлены в следующих задачах.
        </p>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Что уже заложено</h2>
          <p>Маршруты, модель данных, FIFO-очередь, архив, публичные ссылки и базовые API.</p>
        </article>
        <article className="panel">
          <h2>Что будет следующим</h2>
          <p>Авторизация сотрудников, список детей, поиск, редактирование и управление статусами.</p>
        </article>
      </section>
    </main>
  );
}

