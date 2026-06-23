import { childStatusLabels, childStatusValues, type PublicStatusView } from "@queue-tracker/shared";

type StatusCardProps = {
  status: PublicStatusView;
};

function formatFamiliesAhead(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} семья`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} семьи`;
  }

  return `${count} семей`;
}

export function StatusCard({ status }: StatusCardProps) {
  const showQueue = status.status !== "enrolled" && status.queuePosition !== null;
  const familiesAhead = status.familiesAhead ?? 0;

  return (
    <section className="panel panel-status">
      <div className="eyebrow">Персональный статус</div>
      <h2>{status.fullName}</h2>

      {status.status === "enrolled" ? (
        <div className="enrolled-banner" role="status">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.5l4 4 10-11" />
          </svg>
          <div>
            <strong>Ребёнок зачислен</strong>
            <p>Поздравляем! Заявка дошла до финального этапа.</p>
          </div>
        </div>
      ) : null}

      <ol className="timeline">
        {childStatusValues.map((value) => {
          const currentIndex = childStatusValues.indexOf(status.status);
          const itemIndex = childStatusValues.indexOf(value);
          const state =
            itemIndex < currentIndex ? "done" : itemIndex === currentIndex ? "current" : "todo";

          return (
            <li key={value} className={`timeline-item timeline-item--${state}`}>
              <span className="timeline-marker" aria-hidden="true">
                {state === "done" ? (
                  <svg
                    viewBox="0 0 16 16"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                ) : null}
              </span>
              <span>{childStatusLabels[value]}</span>
              <span className="timeline-state-label">
                {state === "done" ? "Пройдено" : state === "current" ? "Сейчас" : "Ожидается"}
              </span>
            </li>
          );
        })}
      </ol>

      {showQueue ? (
        <section className="queue-summary" aria-label="Позиция в очереди">
          <div>
            <span className="queue-summary__label">Сейчас вы</span>
            <strong>№{status.queuePosition} в очереди</strong>
          </div>
          <div>
            <span className="queue-summary__label">Перед вами</span>
            <strong>{formatFamiliesAhead(familiesAhead)}</strong>
          </div>
        </section>
      ) : null}

      <dl className="status-grid">
        <div>
          <dt>Текущий этап</dt>
          <dd>{status.statusLabel}</dd>
        </div>
        {status.estimatedStartText ? (
          <div>
            <dt>Ориентировочный срок</dt>
            <dd>{status.estimatedStartText}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
