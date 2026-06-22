import { childStatusLabels, childStatusValues, type PublicStatusView } from "@queue-tracker/shared";

type StatusCardProps = {
  status: PublicStatusView;
};

export function StatusCard({ status }: StatusCardProps) {
  return (
    <section className="panel panel-status">
      <div className="eyebrow">Персональный статус</div>
      <h2>{status.fullName}</h2>

      <ol className="timeline">
        {childStatusValues.map((value) => {
          const currentIndex = childStatusValues.indexOf(status.status);
          const itemIndex = childStatusValues.indexOf(value);
          const state =
            itemIndex < currentIndex ? "done" : itemIndex === currentIndex ? "current" : "todo";

          return (
            <li key={value} className={`timeline-item timeline-item--${state}`}>
              <span className="timeline-dot" />
              <span>{childStatusLabels[value]}</span>
            </li>
          );
        })}
      </ol>

      <dl className="status-grid">
        <div>
          <dt>Текущий этап</dt>
          <dd>{status.statusLabel}</dd>
        </div>
        <div>
          <dt>Номер в очереди</dt>
          <dd>{status.queuePosition ?? "Не отображается"}</dd>
        </div>
        <div>
          <dt>Семей впереди</dt>
          <dd>{status.familiesAhead ?? "Не отображается"}</dd>
        </div>
        <div>
          <dt>Ориентировочный срок</dt>
          <dd>{status.estimatedStartText ?? "Пока не указан"}</dd>
        </div>
      </dl>
    </section>
  );
}

