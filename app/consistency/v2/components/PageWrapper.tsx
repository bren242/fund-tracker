export default function PageWrapper({
  dateLabel,
  children,
}: {
  dateLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="v2-page">
      <div className="v2-masthead">
        <div className="v2-brand">
          <span className="v2-green-mark">GREEN</span>
        </div>
        <div className="v2-date">{dateLabel}</div>
      </div>
      {children}
    </div>
  );
}
